// OpenClaw Gateway adapter — connects via WebSocket JSON-RPC protocol
// Reference: OpenClaw Gateway WebSocket protocol (protocol v3)
// Based on reverse-engineering the OpenClaw 2026.5.7 gateway protocol
//
// Protocol flow:
// 1. Connect to ws://host:port/ws with auth headers
// 2. Receive connect.challenge event
// 3. Send connect request with protocol v3 + auth
// 4. Receive connect response (hello-ok)
// 5. Send chat.send RPC to queue message
// 6. Wait for agent completion via agent.wait
// 7. Fetch response via chat.history

import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../types";
import WebSocket from "ws";

const PROTOCOL_VERSION = 3;
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_CLIENT_ID = "gateway-client";
const DEFAULT_CLIENT_VERSION = "0.1.0";
const DEFAULT_CLIENT_MODE = "backend";
const DEFAULT_CLIENT_PLATFORM = "nmj-dashboard";
const DEFAULT_ROLE = "operator";
const DEFAULT_SCOPES = ["operator.admin"];

interface ChatMessageContent {
  type: string;
  text?: string;
}

interface ChatMessage {
  role: string;
  content?: string | ChatMessageContent[];
}

interface ChatHistory {
  messages?: ChatMessage[];
}

export class OpenClawAdapter extends BaseAdapter {
  type = "openclaw";
  label = "OpenClaw Gateway";
  description = "Connects to an OpenClaw gateway via WebSocket JSON-RPC protocol";

  async isAvailable(agent: Agent): Promise<boolean> {
    const config = this.parseConfig(agent);
    const url = config.url || "";
    if (!url) return false;
    try {
      const httpUrl = url
        .replace(/^ws:\/\//, "http://")
        .replace(/^wss:\/\//, "https://");
      const res = await fetch(`${httpUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildWsUrl(agent: Agent): string {
    const config = this.parseConfig(agent);
    let url = config.url || "ws://127.0.0.1:18789";
    if (!url.endsWith("/ws") && !url.includes("/ws?")) {
      url = url.replace(/\/+$/, "") + DEFAULT_WS_PATH;
    }
    return url;
  }

  private buildSessionKey(agent: Agent): string {
    const name = (agent.name || "main").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `agent:main:${name}`;
  }

  private resolveAuthToken(config: AdapterConfig): string {
    if (config.authToken && typeof config.authToken === "string" && config.authToken.trim()) {
      return config.authToken.trim();
    }
    if (process.env.OPENCLAW_GATEWAY_TOKEN) {
      return process.env.OPENCLAW_GATEWAY_TOKEN.trim();
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require("path") as typeof import("path");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const os = require("os") as typeof import("os");
      const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
      if (fs.existsSync(configPath)) {
        const ocConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const token = ocConfig?.gateway?.auth?.token;
        if (token && typeof token === "string") return token.trim();
      }
    } catch { /* ignore */ }
    return "";
  }

  private async wsConnect(
    wsUrl: string,
    config: AdapterConfig
  ): Promise<{ ws: WebSocket; close: () => void }> {
    return new Promise((resolve, reject) => {
      const token = this.resolveAuthToken(config);
      const headers: Record<string, string> = {};
      if (token) {
        headers["x-openclaw-token"] = token;
        headers["x-openclaw-auth"] = token;
      }
      if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
          if (typeof value === "string") headers[key] = value;
        }
      }
      const ws = new WebSocket(wsUrl, { headers });
      let connected = false;
      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close();
          reject(new Error("OpenClaw connect timeout"));
        }
      }, 10000);
      ws.on("open", () => {
        // Wait for connect.challenge
      });
      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "connect.challenge" && !connected) {
            const connectReq = {
              type: "req",
              id: "connect-1",
              method: "connect",
              params: {
                minProtocol: PROTOCOL_VERSION,
                maxProtocol: PROTOCOL_VERSION,
                client: {
                  id: DEFAULT_CLIENT_ID,
                  version: DEFAULT_CLIENT_VERSION,
                  mode: DEFAULT_CLIENT_MODE,
                  platform: DEFAULT_CLIENT_PLATFORM,
                },
                role: DEFAULT_ROLE,
                scopes: DEFAULT_SCOPES,
                auth: {
                  ...(token ? { token } : {}),
                  ...(config.password && typeof config.password === "string" ? { password: config.password } : {}),
                },
              },
            };
            ws.send(JSON.stringify(connectReq));
            return;
          }
          if (msg.type === "res" && msg.id === "connect-1" && !connected) {
            if (msg.ok === true) {
              connected = true;
              clearTimeout(timeout);
              resolve({
                ws,
                close: () => {
                  try { ws.close(); } catch { /* ignore */ }
                },
              });
            } else {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(msg.error?.message || "OpenClaw connect failed"));
            }
            return;
          }
        } catch {
          // Non-JSON, ignore
        }
      });
      ws.on("error", (err: Error) => {
        if (!connected) {
          clearTimeout(timeout);
          reject(new Error(`OpenClaw WebSocket error: ${err.message}`));
        }
      });
      ws.on("close", () => {
        if (!connected) {
          clearTimeout(timeout);
          reject(new Error("OpenClaw connection closed before connect"));
        }
      });
    });
  }

  private async wsSendAndWait(
    ws: WebSocket,
    method: string,
    params: Record<string, unknown>,
    timeoutSec: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        reject(new Error(`OpenClaw ${method} timeout`));
      }, timeoutSec * 1000);
      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "res" && msg.id === reqId) {
            clearTimeout(timeout);
            ws.off("message", handler);
            if (msg.ok === true || msg.payload) {
              resolve(msg.payload || msg.result);
            } else {
              reject(new Error(msg.error?.message || `${method} failed`));
            }
          }
        } catch {
          // ignore non-JSON
        }
      };
      ws.on("message", handler);
      ws.send(JSON.stringify({ type: "req", id: reqId, method, params }));
    });
  }

  async execute(agent: Agent, message: string, context?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const wsUrl = this.buildWsUrl(agent);
    const timeoutSec = config.timeoutSec || 120;
    const fullMessage = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    const { ws, close } = await this.wsConnect(wsUrl, config);
    try {
      try {
        await this.wsSendAndWait(ws, "sessions.reset", {
          key: this.buildSessionKey(agent),
        }, 10);
      } catch {
        // Ignore reset errors
      }
      const chatResult = await this.wsSendAndWait(ws, "chat.send", {
        message: fullMessage,
        sessionKey: this.buildSessionKey(agent),
        idempotencyKey: `nmj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }, 10) as { runId?: string };
      const runId = chatResult?.runId;
      if (!runId) {
        throw new Error("chat.send did not return runId");
      }
      await this.wsSendAndWait(ws, "agent.wait", {
        runId,
        timeoutMs: Math.min(timeoutSec - 10, 120) * 1000,
      }, timeoutSec);
      const history = await this.wsSendAndWait(ws, "chat.history", {
        sessionKey: this.buildSessionKey(agent),
        limit: 5,
      }, 10) as ChatHistory;
      if (history?.messages && Array.isArray(history.messages)) {
        const messages = history.messages;
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg.role === "assistant" && msg.content) {
            if (typeof msg.content === "string") {
              return msg.content;
            }
            if (Array.isArray(msg.content)) {
              const textParts = msg.content
                .filter((c: ChatMessageContent) => c.type === "text" && c.text)
                .map((c: ChatMessageContent) => c.text!);
              if (textParts.length > 0) {
                return textParts.join("\n");
              }
            }
          }
        }
      }
      return "";
    } finally {
      close();
    }
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const config = this.parseConfig(agent);
    const wsUrl = this.buildWsUrl(agent);
    const timeoutSec = config.timeoutSec || 120;
    const fullMessage = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    const { ws, close } = await this.wsConnect(wsUrl, config);
    let runId: string | null = null;
    let fullText = "";
    try {
      try {
        await this.wsSendAndWait(ws, "sessions.reset", {
          key: this.buildSessionKey(agent),
        }, 10);
      } catch { /* ignore */ }
      const chatResult = await this.wsSendAndWait(ws, "chat.send", {
        message: fullMessage,
        sessionKey: this.buildSessionKey(agent),
        idempotencyKey: `nmj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }, 10) as { runId?: string };
      runId = chatResult?.runId ?? null;
      if (!runId) {
        throw new Error("chat.send did not return runId");
      }
      const subId = `sub-${Date.now()}`;
      ws.send(JSON.stringify({
        type: "req",
        id: subId,
        method: "sessions.messages.subscribe",
        params: { sessionKey: this.buildSessionKey(agent) },
      }));
      const deadline = Date.now() + (timeoutSec - 10) * 1000;
      let done = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!done) {
            reject(new Error("Streaming timeout"));
          }
        }, timeoutSec * 1000);
        ws.on("message", (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "event") {
              const event = msg.event || "";
              const payload = msg.payload || {};
              if (event === "agent") {
                const phase = payload?.data?.phase || "";
                if (phase === "end" || phase === "error") {
                  done = true;
                  clearTimeout(timeout);
                  resolve();
                }
              } else if (event === "chat") {
                const state = payload?.state || "";
                if (state === "error") {
                  const errMsg = payload?.errorMessage || "Chat error";
                  done = true;
                  clearTimeout(timeout);
                  reject(new Error(errMsg));
                }
              } else if (event === "message" || event === "chunk" || event === "delta") {
                const content = payload?.content || payload?.text || payload?.delta || "";
                if (content) {
                  fullText += content;
                  onChunk(content);
                }
              }
            }
            if (Date.now() > deadline && !done) {
              done = true;
              clearTimeout(timeout);
              resolve();
            }
          } catch { /* ignore */ }
        });
      });
      if (!fullText) {
        const history = await this.wsSendAndWait(ws, "chat.history", {
          sessionKey: this.buildSessionKey(agent),
          limit: 5,
        }, 10) as ChatHistory;
        if (history?.messages && Array.isArray(history.messages)) {
          for (let i = history.messages.length - 1; i >= 0; i--) {
            const msg = history.messages[i];
            if (msg.role === "assistant" && msg.content) {
              if (typeof msg.content === "string") {
                fullText = msg.content;
                break;
              }
              if (Array.isArray(msg.content)) {
                const textParts = msg.content
                  .filter((c: ChatMessageContent) => c.type === "text" && c.text)
                  .map((c: ChatMessageContent) => c.text!);
                if (textParts.length > 0) {
                  fullText = textParts.join("\n");
                  break;
                }
              }
            }
          }
        }
      }
      return fullText;
    } finally {
      close();
    }
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    const url = config.url || "";
    if (!url) {
      checks.push({
        code: "url_missing",
        level: "error",
        message: "OpenClaw gateway URL is not configured",
        hint: "Set 'url' in adapter config (e.g., ws://127.0.0.1:18789)",
      });
      return this.createTestResult(this.type, "fail", checks);
    }
    checks.push({
      code: "url",
      level: "info",
      message: `Gateway URL: ${url}`,
    });
    const reachable = await this.isAvailable(agent);
    checks.push({
      code: "reachable",
      level: reachable ? "info" : "error",
      message: reachable ? "Gateway is reachable" : "Gateway is not reachable",
      hint: reachable ? null : "Check that the OpenClaw gateway is running",
    });
    if (config.authToken) {
      checks.push({
        code: "auth",
        level: "info",
        message: "Auth token is configured",
      });
    } else {
      checks.push({
        code: "auth",
        level: "warn",
        message: "No auth token configured — connection will fail if gateway requires auth",
      });
    }
    checks.push({
      code: "protocol",
      level: "info",
      message: `Protocol version: ${PROTOCOL_VERSION}`,
    });
    const hasError = checks.some((c) => c.level === "error");
    return this.createTestResult(this.type, hasError ? "fail" : "pass", checks);
  }
}
