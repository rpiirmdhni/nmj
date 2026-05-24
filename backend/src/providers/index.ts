// Provider factory — creates agent instances with adapter system
// Legacy file, kept for backward compatibility
// New code should use the adapter system directly via orchestrator

import { Agent, AgentAdapterType } from "../types";
import { getAdapter, executeAdapter, executeAdapterStreaming } from "../adapters";

/**
 * Create an agent with the specified adapter type.
 * This is the new way to create agents — adapter-based, not provider-based.
 */
export function createAgentWithAdapter(
  id: string,
  name: string,
  role: string,
  adapterType: AgentAdapterType,
  adapterConfig: Record<string, unknown> = {},
  systemPrompt?: string
): Agent {
  return {
    id,
    name,
    role,
    avatar: name.charAt(0).toUpperCase(),
    color: "bg-gray-500/10 text-gray-500",
    tag_color: "bg-gray-500/15 text-gray-600 border-gray-500/30",
    adapter_type: adapterType,
    adapter_config: JSON.stringify(adapterConfig),
    system_prompt: systemPrompt || null,
    is_active: 1,
    reports_to: null,
    model: adapterConfig.model as string || "gpt-4o",
    provider: adapterType,
    provider_config_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Execute a message using the agent's adapter.
 */
export async function runAgent(
  agent: Agent,
  message: string,
  context?: string
): Promise<string> {
  return executeAdapter(agent, message, context);
}

/**
 * Execute a streaming message using the agent's adapter.
 */
export async function runAgentStreaming(
  agent: Agent,
  message: string,
  context: string | undefined,
  onChunk: (chunk: string) => void
): Promise<string> {
  return executeAdapterStreaming(agent, message, context, onChunk);
}

// Re-export adapter functions for convenience
export { getAdapter, executeAdapter, executeAdapterStreaming, testAdapterEnvironment } from "../adapters";
export { listAdapterMeta, listAdapters, listAdapterTypes } from "../adapters";
