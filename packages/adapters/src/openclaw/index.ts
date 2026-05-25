// OpenClaw Gateway adapter — connects via WebSocket JSON-RPC protocol
// System prompt: prepended to message (gateway manages its own system prompt)

import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../../shared/src/types";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROTOCOL_VERSION_MIN = 2;
const PROTOCOL_VERSION_MAX = 4;
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_CLIENT_ID = "gateway-client";
const DEFAULT_CLIENT_VERSION = "0.1.0";
const DEFAULT_CLIENT_MODE = "backend";
const DEFAULT_CLIENT_PLATFORM = "nmj-dashboard";
const DEFAULT_ROLE = "operator";
const DEFAULT_SCOPES = ["operator.admin"];

interface ChatMessageContent { type: string; text?: string; }
interface ChatMessage { role: string; content?: string | ChatMessageContent[]; }
interface ChatHistory { messages?: ChatMessage[]; }

export class OpenClawAdapter extends BaseAdapter {
  type = "openclaw";
  label = "OpenClaw Gateway";
  description = "Connects to an OpenClaw gateway via WebSocket JSON-RPC protocol";

  async isAvailable(agent: Agent): Promise<boolean> {
    const config = this.parseConfig(agent);
    const url = config.url || "";
    if (!url) return false;
    try {
      const httpUrl = url.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
      const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch { return false; }
  }

  private buildWsUrl(agent: Agent): string {
    const config = this.parseConfig(agent);
    let url = config.url || "ws://127.0.0.1:18789";
    // Auto-convert http(s) to ws(s) — users may configure either scheme
    url = url.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
    if (!url.endsWith("/ws") && !url.includes("/ws?")) {
      url = url.replace(/\/+$/, "") + DEFAULT_WS_PATH;
    }
    return url;
  }

  private buildSessionKey(agent: Agent): string {
    // Use agent.id as the primary key to guarantee uniqueness per agent
    const name = (agent.name || "main").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `nmj:agent:${agent.id}:${name}`;
  }

  /** Explicitly reset a session — call only when starting a brand new conversation, not on every message */
  async resetSession(agent: Agent): Promise<void> {
    const config = this.parseConfig(agent);
    const wsUrl = this.buildWsUrl(agent);
    const { ws, close } = await this.wsConnect(wsUrl, config);
    try {
      await this.wsSendAndWait(ws, "sessions.reset", { key: this.buildSessionKey(agent) }, 10);
    } catch { /* ignore if gateway doesn't support it */ }
    finally { close(); }
  }

  private resolveAuthToken(config: AdapterConfig): string {
    if (config.authToken && typeof config.authToken === "string" && config.authToken.trim()) return config.authToken.trim();
    if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN.trim();
    try {
      const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
      if (fs.existsSync(configPath)) {
        const ocConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const token = ocConfig?.gateway?.auth?.token;
        if (token && typeof token === "string") return token.trim();
      }
    } catch (err) {
      console.error("[OpenClaw resolveAuthToken] Failed to read token:", err);
    }
    return "";
  }

  private async wsConnect(wsUrl: string, config: AdapterConfig): Promise<{ ws: WebSocket; close: () => void }> {
    return new Promise((resolve, reject) => {
      const token = this.resolveAuthToken(config);
      const headers: Record<string, string> = {};
      if (token) { headers["x-openclaw-token"] = token; headers["x-openclaw-auth"] = token; }
      if (config.headers) { for (const [key, value] of Object.entries(config.headers)) { if (typeof value === "string") headers[key] = value; } }
      const ws = new WebSocket(wsUrl, { headers });
      let connected = false;
      const timeout = setTimeout(() => { if (!connected) { ws.close(); reject(new Error("OpenClaw connect timeout")); } }, 10000);
      ws.on("open", () => { /* Wait for connect.challenge */ });
      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === "connect.challenge" && !connected) {
            ws.send(JSON.stringify({ type: "req", id: "connect-1", method: "connect", params: { minProtocol: PROTOCOL_VERSION_MIN, maxProtocol: PROTOCOL_VERSION_MAX, client: { id: DEFAULT_CLIENT_ID, version: DEFAULT_CLIENT_VERSION, mode: DEFAULT_CLIENT_MODE, platform: DEFAULT_CLIENT_PLATFORM }, role: DEFAULT_ROLE, scopes: DEFAULT_SCOPES, auth: { ...(token ? { token } : {}), ...(config.password && typeof config.password === "string" ? { password: config.password } : {}) } } }));
            return;
          }
          if (msg.type === "res" && msg.id === "connect-1" && !connected) {
            if (msg.ok === true) { connected = true; clearTimeout(timeout); resolve({ ws, close: () => { try { ws.close(); } catch { /* ignore */ } } }); }
            else {
              clearTimeout(timeout); ws.close();
              const errMsg = msg.error?.message || "OpenClaw connect failed";
              const hint = errMsg.toLowerCase().includes("protocol")
                ? `${errMsg}. Your OpenClaw Gateway may be outdated — try: npm update -g openclaw`
                : errMsg;
              reject(new Error(hint));
            }
            return;
          }
        } catch { /* Non-JSON, ignore */ }
      });
      ws.on("error", (err: Error) => { if (!connected) { clearTimeout(timeout); reject(new Error(`OpenClaw WebSocket error: ${err.message}`)); } });
      ws.on("close", () => { if (!connected) { clearTimeout(timeout); reject(new Error("OpenClaw connection closed before connect")); } });
    });
  }

  private async wsSendAndWait(ws: WebSocket, method: string, params: Record<string, unknown>, timeoutSec: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => { reject(new Error(`OpenClaw ${method} timeout`)); }, timeoutSec * 1000);
      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "res" && msg.id === reqId) { clearTimeout(timeout); ws.off("message", handler); if (msg.ok === true || msg.payload) { resolve(msg.payload || msg.result); } else { reject(new Error(msg.error?.message || `${method} failed`)); } }
        } catch { /* ignore non-JSON */ }
      };
      ws.on("message", handler);
      ws.send(JSON.stringify({ type: "req", id: reqId, method, params }));
    });
  }

  private extractAssistantText(history: ChatHistory): string {
    if (history?.messages && Array.isArray(history.messages)) {
      for (let i = history.messages.length - 1; i >= 0; i--) {
        const msg = history.messages[i];
        if (msg.role === "assistant" && msg.content) {
          if (typeof msg.content === "string") return msg.content;
          if (Array.isArray(msg.content)) {
            const textParts = msg.content.filter((c: ChatMessageContent) => c.type === "text" && c.text).map((c: ChatMessageContent) => c.text!);
            if (textParts.length > 0) return textParts.join("\n");
          }
        }
      }
    }
    return "";
  }

  async execute(agent: Agent, message: string, context?: string, systemPrompt?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const wsUrl = this.buildWsUrl(agent);
    const timeoutSec = config.timeoutSec || 120;
    // OpenClaw manages system prompt at gateway level — prepend to message as workaround
    const fullMessage = this.buildFullPrompt(message, context, systemPrompt, agent);
    const { ws, close } = await this.wsConnect(wsUrl, config);
    try {
      // NOTE: sessions.reset intentionally removed — gateway session is preserved per agent
      // for conversational memory. Call resetSession() explicitly only when starting fresh.
      const chatResult = await this.wsSendAndWait(ws, "chat.send", { message: fullMessage, sessionKey: this.buildSessionKey(agent), idempotencyKey: `nmj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, 10) as { runId?: string };
      const runId = chatResult?.runId;
      if (!runId) throw new Error("chat.send did not return runId");
      await this.wsSendAndWait(ws, "agent.wait", { runId, timeoutMs: Math.min(timeoutSec - 10, 120) * 1000 }, timeoutSec);
      const history = await this.wsSendAndWait(ws, "chat.history", { sessionKey: this.buildSessionKey(agent), limit: 5 }, 10) as ChatHistory;
      return this.extractAssistantText(history);
    } finally { close(); }
  }

  async executeStreaming(agent: Agent, message: string, context: string | undefined, onChunk: (chunk: string) => void, systemPrompt?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const wsUrl = this.buildWsUrl(agent);
    const timeoutSec = config.timeoutSec || 120;
    const fullMessage = this.buildFullPrompt(message, context, systemPrompt, agent);
    const { ws, close } = await this.wsConnect(wsUrl, config);
    let runId: string | null = null;
    let fullText = "";
    try {
      // NOTE: sessions.reset intentionally removed — gateway session is preserved per agent
      // for conversational memory. Call resetSession() explicitly only when starting fresh.
      const chatResult = await this.wsSendAndWait(ws, "chat.send", { message: fullMessage, sessionKey: this.buildSessionKey(agent), idempotencyKey: `nmj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, 10) as { runId?: string };
      runId = chatResult?.runId ?? null;
      if (!runId) throw new Error("chat.send did not return runId");
      const subId = `sub-${Date.now()}`;
      ws.send(JSON.stringify({
        type: "req",
        id: subId,
        method: "sessions.messages.subscribe",
        params: {
          key: this.buildSessionKey(agent),
          sessionKey: this.buildSessionKey(agent) // Send both key and legacy sessionKey for maximum compatibility
        }
      }));
      const deadline = Date.now() + (timeoutSec - 10) * 1000;
      let done = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!done) {
            done = true;
            ws.off("message", handler);
            reject(new Error("Streaming timeout"));
          }
        }, timeoutSec * 1000);

        const handler = (data: Buffer) => {
          if (done) return;
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
                  ws.off("message", handler);
                  resolve();
                }
              } else if (event === "chat") {
                const state = payload?.state || "";
                if (state === "error") {
                  done = true;
                  clearTimeout(timeout);
                  ws.off("message", handler);
                  reject(new Error(payload?.errorMessage || "Chat error"));
                } else if (state === "delta") {
                  const content = payload?.deltaText || "";
                  if (content) { fullText += content; onChunk(content); }
                } else if (state === "final") {
                  done = true;
                  clearTimeout(timeout);
                  ws.off("message", handler);
                  resolve();
                }
              } else if (event === "message" || event === "chunk" || event === "delta") {
                const content = payload?.content || payload?.text || payload?.delta || "";
                if (content) { fullText += content; onChunk(content); }
              }
            }
            if (Date.now() > deadline && !done) {
              done = true;
              clearTimeout(timeout);
              ws.off("message", handler);
              resolve();
            }
          } catch { /* ignore */ }
        };

        ws.on("message", handler);
      });
      if (!fullText) {
        const history = await this.wsSendAndWait(ws, "chat.history", { sessionKey: this.buildSessionKey(agent), limit: 5 }, 10) as ChatHistory;
        fullText = this.extractAssistantText(history);
      }
      return fullText;
    } finally { close(); }
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    const url = config.url || "";
    if (!url) { checks.push({ code: "url_missing", level: "error", message: "OpenClaw gateway URL is not configured", hint: "Set 'url' in adapter config (e.g., ws://127.0.0.1:18789)" }); return this.createTestResult(this.type, "fail", checks); }
    checks.push({ code: "url", level: "info", message: `Gateway URL: ${url}` });
    const reachable = await this.isAvailable(agent);
    checks.push({ code: "reachable", level: reachable ? "info" : "error", message: reachable ? "Gateway is reachable" : "Gateway is not reachable", hint: reachable ? null : "Check that the OpenClaw gateway is running" });
    if (config.authToken) { checks.push({ code: "auth", level: "info", message: "Auth token is configured" }); }
    else { checks.push({ code: "auth", level: "warn", message: "No auth token configured — connection will fail if gateway requires auth" }); }
    checks.push({ code: "protocol", level: "info", message: `Protocol version: ${PROTOCOL_VERSION_MIN}-${PROTOCOL_VERSION_MAX}` });
    const hasError = checks.some((c) => c.level === "error");
    return this.createTestResult(this.type, hasError ? "fail" : "pass", checks);
  }
}
