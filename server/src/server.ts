import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { Orchestrator } from "../../packages/db/src/orchestrator";
import { WSMessage, ChatMessagePayload, Agent } from "../../packages/shared/src/types";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// ── Input Validation Middleware ──────────────────────────────

function validateAgentInput(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { name, role, id } = req.body;
  if (req.method === "POST" || req.method === "PUT") {
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Agent name must be a non-empty string" });
      }
      if (name.length > 128) {
        return res.status(400).json({ error: "Agent name must be 128 characters or less" });
      }
      // Only allow alphanumeric, spaces, hyphens, underscores
      if (!/^[a-zA-Z0-9\s\-_]+$/.test(name.trim())) {
        return res.status(400).json({ error: "Agent name contains invalid characters" });
      }
    }
    if (role !== undefined) {
      if (typeof role !== "string" || role.trim().length === 0) {
        return res.status(400).json({ error: "Agent role must be a non-empty string" });
      }
      if (role.length > 256) {
        return res.status(400).json({ error: "Agent role must be 256 characters or less" });
      }
    }
    if (id !== undefined) {
      if (typeof id !== "string" || id.trim().length === 0) {
        return res.status(400).json({ error: "Agent ID must be a non-empty string" });
      }
      if (!/^[a-zA-Z0-9\-_]+$/.test(id.trim())) {
        return res.status(400).json({ error: "Agent ID contains invalid characters (only alphanumeric, hyphens, underscores)" });
      }
    }
    // Sanitize adapter_type
    const validAdapters = ["claude_code", "codex", "opencode", "gemini_cli", "hermes", "cursor", "openclaw", "process", "http", "custom"];
    if (req.body.adapter_type && !validAdapters.includes(req.body.adapter_type)) {
      return res.status(400).json({ error: `Invalid adapter_type. Must be one of: ${validAdapters.join(", ")}` });
    }
    // Sanitize adapter_config — must be valid JSON string
    if (req.body.adapter_config !== undefined) {
      try {
        const parsed = JSON.parse(req.body.adapter_config);
        if (typeof parsed !== "object" || parsed === null) {
          return res.status(400).json({ error: "adapter_config must be a JSON object" });
        }
        // Danger flags: dangerouslySkipPermissions and dangerouslyBypassSandbox must be opt-in (not default true)
        // Warning: these are allowed but logged
        if (parsed.dangerouslySkipPermissions === true || parsed.dangerouslyBypassSandbox === true) {
          console.warn(`[Security] Agent "${name || id}" configured with elevated permissions (dangerouslySkipPermissions/dangerouslyBypassSandbox)`);
        }
      } catch {
        return res.status(400).json({ error: "adapter_config must be valid JSON" });
      }
    }
  }
  next();
}

function validateCronInput(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { name, schedule, prompt, agent_id } = req.body;
  if (req.method === "POST" || req.method === "PUT") {
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Cron name must be a non-empty string" });
      }
      if (name.length > 256) {
        return res.status(400).json({ error: "Cron name must be 256 characters or less" });
      }
    }
    if (schedule !== undefined) {
      if (typeof schedule !== "string" || schedule.trim().length === 0) {
        return res.status(400).json({ error: "Schedule must be a non-empty cron expression" });
      }
      // Basic cron validation: must have 5 or 6 fields
      const parts = schedule.trim().split(/\s+/);
      if (parts.length < 5 || parts.length > 6) {
        return res.status(400).json({ error: "Invalid cron expression format (expected 5 or 6 fields: min hour dom month dow [year])" });
      }
    }
    if (prompt !== undefined) {
      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt must be a non-empty string" });
      }
      if (prompt.length > 10000) {
        return res.status(400).json({ error: "Prompt must be 10000 characters or less" });
      }
    }
    if (agent_id !== undefined) {
      if (typeof agent_id !== "string" || agent_id.trim().length === 0) {
        return res.status(400).json({ error: "agent_id must be a non-empty string" });
      }
    }
  }
  next();
}

function validateFileInput(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { name, type } = req.body;
  if (req.method === "POST") {
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "File/folder name must be a non-empty string" });
      }
      if (name.length > 512) {
        return res.status(400).json({ error: "Name must be 512 characters or less" });
      }
      // Prevent path traversal
      if (name.includes("..") || name.includes("/") || name.includes("\\")) {
        return res.status(400).json({ error: "Name contains invalid characters (no path separators or .. allowed)" });
      }
    }
    if (type !== undefined && !["file", "folder"].includes(type)) {
      return res.status(400).json({ error: "Type must be 'file' or 'folder'" });
    }
  }
  next();
}

// Initialize orchestrator
const orchestrator = new Orchestrator((msg: WSMessage) => {
  broadcast(msg);
});

// ── WebSocket ────────────────────────────────────────────────

const clients = new Set<WebSocket>();

function broadcast(message: WSMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Client connected. Total:", clients.size);

  // Send initial agent list
  ws.send(JSON.stringify({
    type: "agent:status",
    payload: orchestrator.getAllAgents(),
    timestamp: new Date().toISOString(),
  }));

  ws.on("message", async (data) => {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case "chat:message": {
          const payload = message.payload as ChatMessagePayload;
          await orchestrator.handleChatMessage(payload);
          break;
        }

        case "chat:typing": {
          broadcast(message);
          break;
        }

        default:
          console.warn("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      ws.send(JSON.stringify({
        type: "error",
        payload: { message: error instanceof Error ? error.message : "Unknown error" },
        timestamp: new Date().toISOString(),
      }));
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("Client disconnected. Total:", clients.size);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  });
});

// ── REST API: Agents ─────────────────────────────────────────

app.get("/api/agents", (_req, res) => {
  res.json(orchestrator.getAllAgents());
});

app.get("/api/agents/:id", (req, res) => {
  const agent = orchestrator.getAgentById(req.params.id as string);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
});

app.post("/api/agents", validateAgentInput, (req, res) => {
  try {
    const agent = orchestrator.createAgent(req.body);
    res.status(201).json(agent);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create agent" });
  }
});

app.put("/api/agents/:id", validateAgentInput, (req, res) => {
  const agent = orchestrator.updateAgent(req.params.id as string, req.body);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
});

app.delete("/api/agents/:id", (req, res) => {
  const deleted = orchestrator.deleteAgent(req.params.id as string);
  if (!deleted) return res.status(404).json({ error: "Agent not found" });
  res.status(204).send();
});

// ── REST API: Org Chart ──────────────────────────────────────

app.get("/api/org", (_req, res) => {
  res.json(orchestrator.getOrgTree());
});

// ── REST API: Adapter Meta ───────────────────────────────────

app.get("/api/adapters", (_req, res) => {
  res.json(orchestrator.getAdapterMeta());
});

app.post("/api/agents/:id/test-environment", async (req, res) => {
  try {
    const agentId = req.params.id as string;
    let agent = orchestrator.getAgentById(agentId);

    // If agent not in DB (e.g. "temp"), construct from body
    if (!agent && req.body && req.body.adapter_type) {
      agent = {
        id: "temp",
        name: req.body.name || "Test Agent",
        role: req.body.role || "Test",
        avatar: "T",
        color: "bg-gray-500/10 text-gray-500",
        tag_color: "bg-gray-500/15 text-gray-600 border-gray-500/30",
        adapter_type: req.body.adapter_type,
        adapter_config: req.body.adapter_config || "{}",
        system_prompt: req.body.system_prompt || null,
        is_active: 1,
        reports_to: null,
        model: "",
        provider: "",
        provider_config_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Agent;
    }

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const result = await orchestrator.testAgentEnvironment(agent);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Test failed" });
  }
});

// ── REST API: Sessions ───────────────────────────────────────

app.get("/api/sessions/:agentId/messages", (req, res) => {
  const messages = orchestrator.getSessionMessages(req.params.agentId);
  res.json(messages);
});

// ── REST API: Cron Jobs ──────────────────────────────────────

app.get("/api/cron", (_req, res) => {
  res.json(orchestrator.getAllCronJobs());
});

app.post("/api/cron", validateCronInput, (req, res) => {
  try {
    const job = orchestrator.createCronJob(req.body);
    orchestrator.rescheduleAllCronJobs();
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create cron job" });
  }
});

app.put("/api/cron/:id", validateCronInput, (req, res) => {
  const job = orchestrator.updateCronJob(req.params.id as string, req.body);
  if (!job) return res.status(404).json({ error: "Cron job not found" });
  orchestrator.rescheduleAllCronJobs();
  res.json(job);
});

app.delete("/api/cron/:id", (req, res) => {
  const deleted = orchestrator.deleteCronJob(req.params.id as string);
  if (!deleted) return res.status(404).json({ error: "Cron job not found" });
  orchestrator.rescheduleAllCronJobs();
  res.status(204).send();
});

// ── REST API: Files ──────────────────────────────────────────

app.get("/api/files", (_req, res) => {
  res.json(orchestrator.getAllFiles());
});

app.post("/api/files", validateFileInput, (req, res) => {
  const file = orchestrator.createFile(req.body);
  res.status(201).json(file);
});

app.delete("/api/files/:id", (req, res) => {
  const deleted = orchestrator.deleteFile(req.params.id as string);
  if (!deleted) return res.status(404).json({ error: "File not found" });
  res.status(204).send();
});

// ── REST API: Provider Configs (legacy) ──────────────────────

app.get("/api/providers", (_req, res) => {
  res.json(orchestrator.getAllProviderConfigs());
});

app.post("/api/providers", (req, res) => {
  const config = orchestrator.createProviderConfig(req.body);
  res.status(201).json(config);
});

app.put("/api/providers/:id", (req, res) => {
  const config = orchestrator.updateProviderConfig(req.params.id as string, req.body);
  if (!config) return res.status(404).json({ error: "Provider config not found" });
  res.json(config);
});

app.delete("/api/providers/:id", (req, res) => {
  const deleted = orchestrator.deleteProviderConfig(req.params.id as string);
  if (!deleted) return res.status(404).json({ error: "Provider config not found" });
  res.status(204).send();
});

app.post("/api/providers/:id/test", async (req, res) => {
  const result = await orchestrator.testProvider(req.params.id as string);
  res.json(result);
});

// ── REST API: Supported Provider List ─────────────────────────

app.get("/api/providers/supported", (_req, res) => {
  res.json(orchestrator.getSupportedProviders());
});

// ── REST API: Fetch Provider Models ───────────────────────────

app.get("/api/providers/:id/models", async (req, res) => {
  try {
    const models = await orchestrator.fetchProviderModels(req.params.id as string);
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch models" });
  }
});

// ── REST API: Skills Proxy ────────────────────────────────────

app.get("/api/skills/proxy", async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: "url query param required" });
  // Only allow GitHub raw content
  if (!url.startsWith("https://raw.githubusercontent.com/")) {
    return res.status(403).json({ error: "Only raw.githubusercontent.com URLs are allowed" });
  }
  try {
    const fetchRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!fetchRes.ok) return res.status(fetchRes.status).json({ error: "Fetch failed" });
    const text = await fetchRes.text();
    res.setHeader("Content-Type", "text/plain");
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Proxy failed" });
  }
});

// ── REST API: Agent Memory ───────────────────────────────────

app.get("/api/agents/:agentId/memories", (req, res) => {
  const memories = orchestrator.getAgentMemories(req.params.agentId, req.query.type as string | undefined);
  res.json(memories);
});

app.post("/api/agents/:agentId/memories", (req, res) => {
  const { type, content, importance, tags, source } = req.body;
  if (!type || !content) {
    return res.status(400).json({ error: "type and content are required" });
  }
  const memory = orchestrator.createAgentMemory({
    agent_id: req.params.agentId,
    type,
    content,
    importance,
    tags,
    source,
  });
  res.status(201).json(memory);
});

// ── REST API: Agent Workspace Files ──────────────────────────

app.get("/api/agents/:agentId/files", (req, res) => {
  res.json(orchestrator.getAgentFiles(req.params.agentId));
});

app.get("/api/agents/:agentId/files/:name", (req, res) => {
  const file = orchestrator.getAgentFile(req.params.agentId, req.params.name);
  if (!file) return res.status(404).json({ error: "File not found" });
  res.json(file);
});

app.put("/api/agents/:agentId/files/:name", (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: "content is required" });
  const file = orchestrator.upsertAgentFile(req.params.agentId, req.params.name, content);
  res.json(file);
});

// ── REST API: Settings ───────────────────────────────────────

app.get("/api/settings", (_req, res) => {
  const settings = orchestrator.getAllSettings();
  res.json(settings);
});

app.put("/api/settings/:key", (req, res) => {
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: "value is required" });
  }
  orchestrator.setSetting(req.params.key, value);
  res.json({ key: req.params.key, value });
});

// ── Health Check ─────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Gateway Status ────────────────────────────────────────────

app.get("/api/gateway/status", async (_req, res) => {
  const running = await isGatewayRunning();
  res.json({
    running,
    url: GATEWAY_URL,
    port: GATEWAY_PORT,
  });
});

// ── OpenClaw Gateway Manager ─────────────────────────────────

import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || 18789;
const GATEWAY_URL = `ws://127.0.0.1:${GATEWAY_PORT}`;

async function isGatewayRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function findOpenClawBinary(): string | null {
  const isWindows = process.platform === "win32";
  const whichCmd = isWindows ? "where" : "which";

  // 1. Try simple "openclaw" in PATH
  try {
    execSync(`${whichCmd} openclaw`, { stdio: "pipe" });
    return "openclaw";
  } catch {
    // Not in PATH
  }

  // 2. Check platform-specific common locations
  const candidates: string[] = [];

  if (isWindows) {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    candidates.push(
      join(appData, "npm", "openclaw.cmd"),
      join(appData, "npm", "openclaw"),
      join(homedir(), ".npm-global", "openclaw.cmd"),
    );
  } else {
    candidates.push(
      "/usr/local/bin/openclaw",
      "/usr/bin/openclaw",
      join(homedir(), ".local", "bin", "openclaw"),
    );
    // nvm locations
    const nvmDir = process.env.NVM_DIR || join(homedir(), ".nvm");
    if (existsSync(nvmDir)) {
      try {
        const nodeVersion = execSync("node -v", { encoding: "utf-8" }).trim();
        const nvmPath = join(nvmDir, "versions", "node", nodeVersion, "bin", "openclaw");
        candidates.push(nvmPath);
      } catch { /* ignore */ }
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // 3. Check npm global bin
  try {
    const npmBin = execSync("npm bin -g", { encoding: "utf-8" }).trim();
    const ext = isWindows ? ".cmd" : "";
    const binPath = join(npmBin, `openclaw${ext}`);
    if (existsSync(binPath)) return binPath;
  } catch {
    // ignore
  }

  return null;
}

async function startGateway(): Promise<boolean> {
  const binary = findOpenClawBinary();
  if (!binary) {
    console.warn("[Gateway] openclaw binary not found — agents using openclaw adapter will not work");
    return false;
  }

  console.log(`[Gateway] Starting OpenClaw Gateway on port ${GATEWAY_PORT}...`);
  try {
    const isWindows = process.platform === "win32";
    // Spawn the gateway process detached
    const gatewayProc = spawn(binary, ["gateway", "--port", String(GATEWAY_PORT)], {
      detached: !isWindows, // detached not supported well on Windows
      stdio: "ignore",
      ...(isWindows ? { shell: true } : {}),
    });
    gatewayProc.unref();
  } catch (err) {
    console.warn(`[Gateway] Failed to spawn gateway: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Wait for gateway to be ready (max 15s)
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isGatewayRunning()) {
      console.log(`[Gateway] OpenClaw Gateway ready on port ${GATEWAY_PORT}`);
      return true;
    }
  }

  console.warn("[Gateway] OpenClaw Gateway did not start within 15s — openclaw agents may not work");
  return false;
}

async function ensureGateway(): Promise<void> {
  if (await isGatewayRunning()) {
    console.log(`[Gateway] OpenClaw Gateway already running on port ${GATEWAY_PORT}`);
    return;
  }
  console.log("[Gateway] OpenClaw Gateway not detected, attempting auto-start...");
  await startGateway();
}

// ── Start Server ─────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

// Ensure gateway is running before accepting connections
ensureGateway().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Nineteen Million (AI) Jobs — Backend running on http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   REST API:  http://localhost:${PORT}/api`);
    console.log(`   Gateway:   ${GATEWAY_URL}`);
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  orchestrator.destroyAllCronJobs();
  server.close(() => {
    process.exit(0);
  });
});
