// Adapter registry — manages all agent adapters

import { AgentAdapter, AgentAdapterType, Agent, AdapterEnvironmentTestResult } from "../../shared/src/types";
import { ClaudeCodeAdapter } from "./claude-code";
import { CodexAdapter } from "./codex";
import { OpenCodeAdapter } from "./opencode";
import { GeminiCliAdapter } from "./gemini-cli";
import { HermesAdapter } from "./hermes";
import { CursorAdapter } from "./cursor";
import { OpenClawAdapter } from "./openclaw";
import { ProcessAdapter } from "./process";
import { HttpAdapter } from "./http";
import { CustomAdapter } from "./custom";

const adaptersByType = new Map<AgentAdapterType, AgentAdapter>();

// Register all built-in adapters
function registerDefaults(): void {
  const adapters: AgentAdapter[] = [
    new ClaudeCodeAdapter(),
    new CodexAdapter(),
    new OpenCodeAdapter(),
    new GeminiCliAdapter(),
    new HermesAdapter(),
    new CursorAdapter(),
    new OpenClawAdapter(),
    new ProcessAdapter(),
    new HttpAdapter(),
    new CustomAdapter(),
  ];

  for (const adapter of adapters) {
    adaptersByType.set(adapter.type as AgentAdapterType, adapter);
  }
}

// Initialize on import
registerDefaults();

export function getAdapter(type: AgentAdapterType): AgentAdapter | undefined {
  return adaptersByType.get(type);
}

export function listAdapters(): AgentAdapter[] {
  return Array.from(adaptersByType.values());
}

export function listAdapterTypes(): AgentAdapterType[] {
  return Array.from(adaptersByType.keys());
}

export function registerAdapter(adapter: AgentAdapter): void {
  adaptersByType.set(adapter.type as AgentAdapterType, adapter);
}

export function unregisterAdapter(type: AgentAdapterType): boolean {
  return adaptersByType.delete(type);
}

export async function executeAdapter(
  agent: Agent,
  message: string,
  context?: string
): Promise<string> {
  const adapter = getAdapter(agent.adapter_type);
  if (!adapter) {
    throw new Error(`No adapter registered for type: ${agent.adapter_type}`);
  }
  return adapter.execute(agent, message, context);
}

export async function executeAdapterStreaming(
  agent: Agent,
  message: string,
  context: string | undefined,
  onChunk: (chunk: string) => void
): Promise<string> {
  const adapter = getAdapter(agent.adapter_type);
  if (!adapter) {
    throw new Error(`No adapter registered for type: ${agent.adapter_type}`);
  }
  return adapter.executeStreaming(agent, message, context, onChunk);
}

export async function testAdapterEnvironment(
  agent: Agent
): Promise<AdapterEnvironmentTestResult> {
  const adapter = getAdapter(agent.adapter_type);
  if (!adapter) {
    return {
      adapterType: agent.adapter_type,
      status: "fail",
      checks: [{
        code: "adapter_not_found",
        level: "error",
        message: `No adapter registered for type: ${agent.adapter_type}`,
      }],
      testedAt: new Date().toISOString(),
    };
  }
  return adapter.testEnvironment(agent);
}

// Adapter metadata for UI
export interface AdapterMeta {
  type: AgentAdapterType;
  label: string;
  description: string;
  recommended: boolean;
  category: "coding" | "gateway" | "generic";
}

export function listAdapterMeta(): AdapterMeta[] {
  return [
    { type: "claude_code", label: "Claude Code", description: "Anthropic Claude Code CLI", recommended: true, category: "coding" },
    { type: "codex", label: "Codex", description: "OpenAI Codex CLI", recommended: true, category: "coding" },
    { type: "opencode", label: "OpenCode", description: "OpenCode CLI (multi-provider)", recommended: true, category: "coding" },
    { type: "gemini_cli", label: "Gemini CLI", description: "Google Gemini CLI (experimental)", recommended: false, category: "coding" },
    { type: "hermes", label: "Hermes", description: "Hermes AI Agent CLI", recommended: false, category: "coding" },
    { type: "cursor", label: "Cursor", description: "Cursor IDE agent", recommended: false, category: "coding" },
    { type: "openclaw", label: "OpenClaw Gateway", description: "Connect via WebSocket", recommended: false, category: "gateway" },
    { type: "process", label: "Process", description: "Run shell commands", recommended: false, category: "generic" },
    { type: "http", label: "HTTP Webhook", description: "External service webhook", recommended: false, category: "generic" },
    { type: "custom", label: "Custom", description: "User-defined agent", recommended: false, category: "generic" },
  ];
}
