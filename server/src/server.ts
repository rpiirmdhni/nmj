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

// ── Start Server ─────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 NMJ Backend running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   REST API:  http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  orchestrator.destroyAllCronJobs();
  server.close(() => {
    process.exit(0);
  });
});
