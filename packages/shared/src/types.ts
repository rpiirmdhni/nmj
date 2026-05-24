// Types for the NMJ backend system

// ── Agent Adapter Types ──────────────────────────────────────

export type AgentAdapterType =
  | "claude_code"
  | "codex"
  | "opencode"
  | "gemini_cli"
  | "hermes"
  | "cursor"
  | "openclaw"
  | "process"
  | "http"
  | "custom";

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  tag_color: string;
  adapter_type: AgentAdapterType;
  adapter_config: string; // JSON string
  system_prompt: string | null;
  is_active: number;
  // Org hierarchy
  reports_to: string | null; // parent agent ID, null for CEO Assistant
  // Legacy fields (kept for backward compat during migration)
  model: string;
  provider: string;
  provider_config_id: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface AdapterConfig {
  command?: string;
  cwd?: string;
  model?: string;
  effort?: string;
  env?: Record<string, string>;
  timeoutSec?: number;
  graceSec?: number;
  maxTurnsPerRun?: number;
  dangerouslySkipPermissions?: boolean;
  search?: boolean;
  fastMode?: boolean;
  dangerouslyBypassSandbox?: boolean;
  extraArgs?: string[];
  url?: string;
  headers?: Record<string, string>;
  authToken?: string;
  promptTemplate?: string;
  instructionsFilePath?: string;
  workspaceStrategy?: {
    type: string;
    baseRef?: string;
    branchTemplate?: string;
    worktreeParentDir?: string;
  };
  [key: string]: unknown;
}

export interface Session {
  id: string;
  agent_id: string;
  status: "active" | "idle" | "closed" | "error";
  context: string | null;
  session_params: string | null; // JSON string for adapter session persistence
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string | null;
  agent_id: string | null;
  sender_type: "user" | "agent" | "system";
  sender_name: string | null;
  content: string;
  tagged_agent_ids: string | null;
  metadata: string | null;
  created_at: string;
}

export interface InterAgentLog {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  session_id: string | null;
  message: string;
  response: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  agent_id: string;
  schedule: string;
  prompt: string;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  mime_type: string | null;
  size: number | null;
  path: string;
  parent_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  base_url: string | null;
  api_key: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ── Agent Adapter Interface ──────────────────────────────────

export interface AgentAdapter {
  type: string;
  label: string;
  description: string;
  execute(agent: Agent, message: string, context?: string): Promise<string>;
  executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string>;
  testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult>;
  isAvailable(agent: Agent): Promise<boolean>;
  healthCheck(agent: Agent): Promise<boolean>;
}

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: "pass" | "warn" | "fail";
  checks: AdapterEnvironmentCheck[];
  testedAt: string;
}

export interface AdapterEnvironmentCheck {
  code: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string | null;
  hint?: string | null;
}

// ── WebSocket message types ──────────────────────────────────

export type WSMessageType =
  | "chat:message"
  | "chat:typing"
  | "chat:response"
  | "agent:status"
  | "session:update"
  | "inter_agent:message"
  | "cron:triggered"
  | "cron:completed"
  | "cron:failed"
  | "error";

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: string;
}

export interface ChatMessagePayload {
  sessionId: string;
  agentId: string;
  content: string;
  taggedAgentIds: string[];
}

export interface ChatResponsePayload {
  sessionId: string;
  fromAgentId: string;
  toAgentId?: string;
  content: string;
  isInterAgent: boolean;
}

export interface TypingPayload {
  sessionId: string;
  agentId: string;
  isTyping: boolean;
}

export interface AgentStatusPayload {
  agentId: string;
  status: "online" | "busy" | "offline";
}

// ── Org Chart Types ──────────────────────────────────────────

export interface OrgNode {
  agent: Agent;
  children: OrgNode[];
  division: string | null;
}

export interface RoutingResult {
  allowed: boolean;
  path: string[]; // agent IDs in the routing path
  reason?: string;
}
