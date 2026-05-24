// Shared frontend types for NMJ Dashboard

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  tag_color: string;
  adapter_type: string;
  adapter_config: string;
  system_prompt: string | null;
  is_active: number;
  reports_to: string | null;
  // Legacy fields
  model: string;
  provider: string;
  provider_config_id: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface WSMessage {
  type: string;
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

export interface AdapterMeta {
  type: string;
  label: string;
  description: string;
  recommended: boolean;
  category: string;
}

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: "pass" | "warn" | "fail";
  checks: Array<{
    code: string;
    level: "info" | "warn" | "error";
    message: string;
    detail?: string | null;
    hint?: string | null;
  }>;
  testedAt: string;
}

export interface OrgNode {
  agent: Agent;
  children: OrgNode[];
  division: string | null;
}
