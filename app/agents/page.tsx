"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  RefreshCw,
  ChevronDown,
  Brain,
  FileText,
  MessageSquare,
  FlaskConical,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

import { Agent, AgentAdapterType } from "@nmj/shared/types";
import { AdapterMeta, AdapterEnvironmentTestResult } from "@/lib/types";

interface AgentMemory {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  importance: number;
  tags: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface AgentFile {
  id: string;
  agent_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface OrgNode {
  agent: Agent;
  children: OrgNode[];
  division: string | null;
}

// ── Constants ────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const COLORS = [
  { label: "Violet", value: "bg-violet-500/10 text-violet-500", tag: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
  { label: "Blue", value: "bg-blue-500/10 text-blue-500", tag: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  { label: "Green", value: "bg-emerald-500/10 text-emerald-500", tag: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  { label: "Amber", value: "bg-amber-500/10 text-amber-500", tag: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  { label: "Pink", value: "bg-pink-500/10 text-pink-500", tag: "bg-pink-500/15 text-pink-600 border-pink-500/30" },
  { label: "Cyan", value: "bg-cyan-500/10 text-cyan-500", tag: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30" },
  { label: "Orange", value: "bg-orange-500/10 text-orange-500", tag: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  { label: "Red", value: "bg-red-500/10 text-red-500", tag: "bg-red-500/15 text-red-600 border-red-500/30" },
  { label: "Gray", value: "bg-gray-500/10 text-gray-500", tag: "bg-gray-500/15 text-gray-600 border-gray-500/30" },
];

const DEFAULT_ADAPTER_CONFIGS: Record<string, object> = {
  claude_code: { command: "claude", dangerouslySkipPermissions: false, maxTurnsPerRun: 300, timeoutSec: 600 },
  codex: { command: "codex", dangerouslyBypassSandbox: false, timeoutSec: 600 },
  opencode: { command: "opencode", timeoutSec: 600 },
  gemini_cli: { command: "gemini", model: "gemini-2.0-flash", timeoutSec: 300 },
  hermes: { command: "hermes", timeoutSec: 300 },
  cursor: { command: "agent", timeoutSec: 600 },
  openclaw: { url: "ws://127.0.0.1:18789", authToken: "", timeoutSec: 120 },
  process: { command: "", timeoutSec: 120 },
  http: { url: "", headers: {}, timeoutSec: 120 },
  custom: { command: "", timeoutSec: 120 },
};

// ── Adapter Type Badge ───────────────────────────────────────

function AdapterBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    claude_code: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    codex: "bg-green-500/10 text-green-600 border-green-500/20",
    opencode: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    gemini_cli: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    hermes: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    cursor: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    openclaw: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
    process: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    http: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    custom: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  };

  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", colorMap[type] || colorMap.custom)}>
      {type.replace("_", " ")}
    </span>
  );
}

// ── Environment Test Result ──────────────────────────────────

function EnvironmentTestResult({ result, loading }: { result: AdapterEnvironmentTestResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Testing environment...
      </div>
    );
  }

  if (!result) return null;

  const statusIcon = {
    pass: <CheckCircle className="h-4 w-4 text-green-500" />,
    warn: <AlertCircle className="h-4 w-4 text-amber-500" />,
    fail: <XCircle className="h-4 w-4 text-red-500" />,
  }[result.status];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {statusIcon}
        <span className="capitalize">{result.status}</span>
        <span className="text-xs text-muted-foreground">({result.adapterType})</span>
      </div>
      <div className="space-y-1">
        {result.checks.map((check, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {check.level === "error" && <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />}
            {check.level === "warn" && <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />}
            {check.level === "info" && <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />}
            <div>
              <span className="text-foreground">{check.message}</span>
              {check.hint && <p className="text-muted-foreground mt-0.5">{check.hint}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [adapterMeta, setAdapterMeta] = useState<AdapterMeta[]>([]);
  const [orgTree, setOrgTree] = useState<OrgNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    role: "",
    avatar: "",
    color: COLORS[0].value,
    tag_color: COLORS[0].tag,
    adapter_type: "claude_code" as string,
    adapter_config: "{}",
    reports_to: "" as string,
    system_prompt: "",
  });
  const { toast } = useToast();

  // Memory state
  const [selectedAgentForMemory, setSelectedAgentForMemory] = useState<Agent | null>(null);
  const [agentMemories, setAgentMemories] = useState<AgentMemory[]>([]);
  const [agentFiles, setAgentFiles] = useState<AgentFile[]>([]);
  const [memoryTab, setMemoryTab] = useState<"files" | "memories">("files");
  const [editingFile, setEditingFile] = useState<AgentFile | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  // Environment test state
  const [envTestResult, setEnvTestResult] = useState<AdapterEnvironmentTestResult | null>(null);
  const [envTestLoading, setEnvTestLoading] = useState(false);

  const startEditFile = (file: AgentFile) => {
    setEditingFile(file);
    setFileContent(file.content);
  };

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  }, []);

  const fetchAdapterMeta = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/adapters`);
      const data = await res.json();
      if (Array.isArray(data)) setAdapterMeta(data);
    } catch (error) {
      console.error("Failed to fetch adapter meta:", error);
    }
  }, []);

  const fetchOrgTree = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/org`);
      const data = await res.json();
      setOrgTree(data);
    } catch (error) {
      console.error("Failed to fetch org tree:", error);
    }
  }, []);

  const fetchAgentMemory = useCallback(async (agentId: string) => {
    try {
      const [memoriesRes, filesRes] = await Promise.all([
        fetch(`${API_URL}/api/agents/${agentId}/memories`),
        fetch(`${API_URL}/api/agents/${agentId}/files`),
      ]);
      const memories = await memoriesRes.json();
      const files = await filesRes.json();
      if (Array.isArray(memories)) setAgentMemories(memories);
      if (Array.isArray(files)) setAgentFiles(files);
    } catch (error) {
      console.error("Failed to fetch agent memory:", error);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchAdapterMeta();
    fetchOrgTree();
  }, [fetchAgents, fetchAdapterMeta, fetchOrgTree]);

  // Update adapter config when type changes
  useEffect(() => {
    if (!editingAgent) {
      const defaultConfig = DEFAULT_ADAPTER_CONFIGS[formData.adapter_type] || {};
      setFormData(prev => ({
        ...prev,
        adapter_config: JSON.stringify(defaultConfig, null, 2),
      }));
    }
  }, [formData.adapter_type, editingAgent]);

  const openMemoryModal = (agent: Agent) => {
    setSelectedAgentForMemory(agent);
    setShowMemoryModal(true);
    setMemoryTab("files");
    setEditingFile(null);
    setFileContent("");
    setMemorySearchQuery("");
    fetchAgentMemory(agent.id);
  };

  const handleSaveFile = async () => {
    if (!selectedAgentForMemory || !editingFile) return;
    try {
      const res = await fetch(
        `${API_URL}/api/agents/${selectedAgentForMemory.id}/files/${editingFile.name}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fileContent }),
        }
      );
      if (!res.ok) throw new Error("Failed to save");
      toast(`${editingFile.name} saved!`, "success");
      setEditingFile(null);
      setFileContent("");
      fetchAgentMemory(selectedAgentForMemory.id);
    } catch {
      toast("Failed to save file", "error");
    }
  };

  const handleTestEnvironment = async () => {
    if (!editingAgent && !formData.id) {
      // For new agents, create a temporary agent object
      const tempAgent: Agent = {
        id: "temp",
        name: formData.name,
        role: formData.role,
        avatar: formData.avatar || formData.name.charAt(0),
        color: formData.color,
        tag_color: formData.tag_color,
        adapter_type: formData.adapter_type as AgentAdapterType,
        adapter_config: formData.adapter_config,
        system_prompt: formData.system_prompt,
        is_active: 1,
        reports_to: formData.reports_to || null,
        model: "",
        provider: "",
        provider_config_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setEnvTestLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/agents/temp/test-environment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tempAgent),
        });
        const result = await res.json();
        setEnvTestResult(result);
      } catch {
        toast("Failed to test environment", "error");
      } finally {
        setEnvTestLoading(false);
      }
      return;
    }

    const agentId = editingAgent?.id || formData.id;
    setEnvTestLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/test-environment`, {
        method: "POST",
      });
      const result = await res.json();
      setEnvTestResult(result);
    } catch {
      toast("Failed to test environment", "error");
    } finally {
      setEnvTestLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingAgent(null);
    setEnvTestResult(null);
    setFormData({
      id: "",
      name: "",
      role: "",
      avatar: "",
      color: COLORS[0].value,
      tag_color: COLORS[0].tag,
      adapter_type: "claude_code",
      adapter_config: JSON.stringify(DEFAULT_ADAPTER_CONFIGS.claude_code, null, 2),
      reports_to: "",
      system_prompt: "",
    });
    setShowForm(true);
  };

  const openEditForm = (agent: Agent) => {
    setEditingAgent(agent);
    setEnvTestResult(null);
    setFormData({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      avatar: agent.avatar,
      color: agent.color,
      tag_color: agent.tag_color,
      adapter_type: agent.adapter_type,
      adapter_config: agent.adapter_config,
      reports_to: agent.reports_to || "",
      system_prompt: agent.system_prompt || "",
    });
    setShowForm(true);
  };

  const handleSaveAgent = async () => {
    try {
      const isEditing = !!editingAgent;
      const agentId = isEditing ? editingAgent.id : `agent-${formData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
      const url = isEditing ? `${API_URL}/api/agents/${editingAgent.id}` : `${API_URL}/api/agents`;
      const method = isEditing ? "PUT" : "POST";

      const payload = {
        ...formData,
        id: agentId,
        avatar: formData.avatar || formData.name.charAt(0).toUpperCase(),
        reports_to: formData.reports_to || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save agent");
      }

      toast(isEditing ? "Agent updated!" : "Agent created!", "success");
      setShowForm(false);
      fetchAgents();
      fetchOrgTree();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save agent", "error");
    }
  };

  const handleDeleteAgent = async (id: string) => {
    // Find child agents that report to this one
    const childAgents = agents.filter((a) => a.reports_to === id);
    let confirmMsg = "Are you sure you want to delete this agent?";
    if (childAgents.length > 0) {
      const childNames = childAgents.map((c) => c.name).join(", ");
      confirmMsg = `⚠️ Warning: Deleting this agent will also affect the following child agent(s): ${childNames}\n\nChild agents will have their reports_to field set to NULL.\n\nProceed?`;
    }
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_URL}/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast("Agent deleted", "info");
      fetchAgents();
      fetchOrgTree();
    } catch {
      toast("Failed to delete agent", "error");
    }
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      await fetch(`${API_URL}/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: agent.is_active ? 0 : 1 }),
      });
      fetchAgents();
    } catch {
      toast("Failed to toggle agent", "error");
    }
  };

  const filteredAgents = agents.filter(
    (a) =>
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.adapter_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const topLevelAgents = agents.filter(a => !a.reports_to);
  const getManagerName = (reportsTo: string | null) => {
    if (!reportsTo) return "—";
    const manager = agents.find(a => a.id === reportsTo);
    return manager ? manager.name : "—";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your AI agent team. Each agent runs on a specific adapter type.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Agent
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents by name, role, or adapter type..."
          className="w-full rounded-lg border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Agent List */}
      <div className="space-y-3">
        {filteredAgents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No agents found. Create your first agent to get started.</p>
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold", agent.color)}>
                    {agent.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <AdapterBadge type={agent.adapter_type} />
                      {!agent.is_active && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{agent.role}</span>
                      {agent.reports_to && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            Reports to {getManagerName(agent.reports_to)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openMemoryModal(agent)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    title="Memory & Files"
                  >
                    <Brain className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(agent)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    title={agent.is_active ? "Deactivate" : "Activate"}
                  >
                    {agent.is_active ? (
                      <ToggleRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => openEditForm(agent)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDeleteAgent(agent.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingAgent ? "Edit Agent" : "Create New Agent"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Luna"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Role</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g. CEO Assistant"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Avatar (letter)</label>
                  <input
                    type="text"
                    value={formData.avatar}
                    onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                    placeholder="L"
                    maxLength={2}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Reports To</label>
                  <select
                    value={formData.reports_to}
                    onChange={(e) => setFormData({ ...formData, reports_to: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">None (Top-level)</option>
                    {agents
                      .filter(a => a.id !== editingAgent?.id)
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-sm font-medium mb-1 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setFormData({ ...formData, color: c.value, tag_color: c.tag })}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        c.value.split(" ")[0],
                        formData.color === c.value ? "border-primary scale-110" : "border-transparent"
                      )}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Adapter Type */}
              <div>
                <label className="text-sm font-medium mb-1 block">Adapter Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {adapterMeta.map((meta) => (
                    <button
                      key={meta.type}
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          adapter_type: meta.type,
                          adapter_config: JSON.stringify(DEFAULT_ADAPTER_CONFIGS[meta.type] || {}, null, 2),
                        }));
                        setEnvTestResult(null);
                      }}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                        formData.adapter_type === meta.type
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{meta.label}</span>
                          {meta.recommended && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-500/10 text-green-600">
                              REC
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Adapter Config (JSON) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Adapter Config (JSON)</label>
                  <button
                    onClick={handleTestEnvironment}
                    disabled={envTestLoading}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Test Environment
                  </button>
                </div>
                <textarea
                  value={formData.adapter_config}
                  onChange={(e) => setFormData({ ...formData, adapter_config: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <EnvironmentTestResult result={envTestResult} loading={envTestLoading} />
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-sm font-medium mb-1 block">System Prompt</label>
                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  rows={4}
                  placeholder="You are a helpful AI agent..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAgent}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
              >
                <Save className="h-4 w-4" />
                {editingAgent ? "Update" : "Create"} Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory Modal */}
      {showMemoryModal && selectedAgentForMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">{selectedAgentForMemory.name}</h2>
                <p className="text-xs text-muted-foreground">Memory & Workspace Files</p>
              </div>
              <button onClick={() => setShowMemoryModal(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setMemoryTab("files")}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  memoryTab === "files" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                )}
              >
                <FileText className="h-4 w-4" />
                Files
              </button>
              <button
                onClick={() => setMemoryTab("memories")}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  memoryTab === "memories" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                )}
              >
                <Brain className="h-4 w-4" />
                Memories
              </button>
            </div>

            <div className="p-4">
              {memoryTab === "files" ? (
                <div className="space-y-3">
                  {agentFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No workspace files yet.</p>
                  ) : (
                    agentFiles.map((file) => (
                      <div key={file.id} className="rounded-lg border p-3">
                        {editingFile?.id === file.id ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{file.name}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => { setEditingFile(null); setFileContent(""); }}
                                  className="p-1 rounded hover:bg-muted"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleSaveFile}
                                  className="p-1 rounded hover:bg-muted"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={fileContent}
                              onChange={(e) => setFileContent(e.target.value)}
                              rows={8}
                              className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{file.name}</span>
                            <button
                              onClick={() => startEditFile(file)}
                              className="p-1 rounded hover:bg-muted"
                            >
                              <Edit className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={memorySearchQuery}
                      onChange={(e) => setMemorySearchQuery(e.target.value)}
                      placeholder="Search memories..."
                      className="w-full rounded-lg border bg-background pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {agentMemories.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No memories yet.</p>
                  ) : (
                    agentMemories.map((memory) => (
                      <div key={memory.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {memory.type}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(memory.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm">{memory.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
