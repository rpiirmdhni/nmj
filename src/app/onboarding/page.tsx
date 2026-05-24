"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Rocket,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Sparkles,
  FlaskConical,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Agent, AdapterMeta, AdapterEnvironmentTestResult } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const COLORS = [
  { label: "Violet", value: "bg-violet-500/10 text-violet-500", tag: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
  { label: "Blue", value: "bg-blue-500/10 text-blue-500", tag: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  { label: "Green", value: "bg-emerald-500/10 text-emerald-500", tag: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  { label: "Amber", value: "bg-amber-500/10 text-amber-500", tag: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  { label: "Pink", value: "bg-pink-500/10 text-pink-500", tag: "bg-pink-500/15 text-pink-600 border-pink-500/30" },
  { label: "Cyan", value: "bg-cyan-500/10 text-cyan-500", tag: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30" },
];

const DEFAULT_ADAPTER_CONFIGS: Record<string, object> = {
  claude_code: { command: "claude", dangerouslySkipPermissions: false, maxTurnsPerRun: 300, timeoutSec: 600 },
  codex: { command: "codex", dangerouslyBypassSandbox: false, timeoutSec: 600 },
  opencode: { command: "opencode", timeoutSec: 600 },
  gemini_cli: { command: "gemini", model: "gemini-2.0-flash", timeoutSec: 300 },
  hermes: { command: "hermes", timeoutSec: 300 },
  cursor: { command: "agent", timeoutSec: 600 },
  openclaw: { url: "", headers: {}, timeoutSec: 120 },
  process: { command: "", timeoutSec: 120 },
  http: { url: "", headers: {}, timeoutSec: 120 },
  custom: { command: "", timeoutSec: 120 },
};

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  "CEO Assistant": `You are {name}, the CEO Assistant. You are the highest-ranking AI agent in the company, reporting directly to the Founder & CEO (the human user).

Your role:
- Coordinate all divisions and their heads
- Monitor agent performance and workload
- Route cross-division communication through proper channels
- Help with strategic decisions and planning
- You can communicate with any agent directly, but you should encourage proper birokrasi (bureaucracy) — agents within the same division can chat freely, but cross-division requests should go through division heads first.

Communication rules:
- Agents in the same division can chat directly with each other
- Cross-division communication must go through division heads → CEO Assistant (you) → target division head → target agent
- You are the router for all cross-division communication

Be professional, efficient, and strategic. Keep responses concise and actionable.`,
  "CTO": `You are {name}, the Chief Technology Officer (CTO). You lead the Engineering division.

Your role:
- Oversee all engineering projects and technical decisions
- Manage engineering leads and developers
- Coordinate with other division heads through the CEO Assistant
- Ensure technical quality and architecture consistency

Communication rules:
- Your division members (Engineering Leads, Developers) can chat directly with you
- Cross-division requests must go through you first, then to the CEO Assistant
- You report to the CEO Assistant`,
  "default": `You are {name}, working as {role} in the company.

Your role:
- Fulfill your responsibilities as {role}
- Collaborate with your division members
- Report to your division head

Communication rules:
- Agents in the same division can chat directly with each other
- Cross-division communication must go through your division head first
- Follow the chain of command for all official communications`,
};

// ── Steps ────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

// ── Main Component ───────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  // Step 1: Company Info
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  // Step 2: CEO Assistant
  const [agentName, setAgentName] = useState("Luna");
  const [agentRole, setAgentRole] = useState("CEO Assistant");
  const [adapterType, setAdapterType] = useState("claude_code");
  const [adapterConfig, setAdapterConfig] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [adapterMeta, setAdapterMeta] = useState<AdapterMeta[]>([]);
  const [envTestResult, setEnvTestResult] = useState<AdapterEnvironmentTestResult | null>(null);
  const [envTestLoading, setEnvTestLoading] = useState(false);

  // Step 3: First Task
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  // Step 4: Review
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);

  // Fetch adapter meta
  useEffect(() => {
    fetch(`${API_URL}/api/adapters`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAdapterMeta(data);
      })
      .catch(console.error);
  }, []);

  // Update adapter config when type changes
  useEffect(() => {
    const defaultConfig = DEFAULT_ADAPTER_CONFIGS[adapterType] || {};
    setAdapterConfig(JSON.stringify(defaultConfig, null, 2));
    setEnvTestResult(null);
  }, [adapterType]);

  // Update system prompt when role changes
  useEffect(() => {
    const template = DEFAULT_SYSTEM_PROMPTS[agentRole] || DEFAULT_SYSTEM_PROMPTS.default;
    setSystemPrompt(template.replace(/{name}/g, agentName).replace(/{role}/g, agentRole));
  }, [agentName, agentRole]);

  const testEnvironment = async () => {
    setEnvTestLoading(true);
    setError(null);
    try {
      const tempAgent: Agent = {
        id: "temp",
        name: agentName,
        role: agentRole,
        avatar: agentName.charAt(0).toUpperCase(),
        color: COLORS[0].value,
        tag_color: COLORS[0].tag,
        adapter_type: adapterType,
        adapter_config: adapterConfig,
        system_prompt: systemPrompt,
        is_active: 1,
        reports_to: null,
        model: "",
        provider: "",
        provider_config_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(`${API_URL}/api/agents/temp/test-environment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tempAgent),
      });
      const result = await res.json();
      setEnvTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test environment");
    } finally {
      setEnvTestLoading(false);
    }
  };

  const handleStep1 = async () => {
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleStep2 = async () => {
    if (!agentName.trim()) {
      setError("Agent name is required");
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleStep3 = async () => {
    if (!taskTitle.trim()) {
      setError("Task title is required");
      return;
    }
    setError(null);
    setStep(4);
  };

  const handleStep4 = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create the CEO Assistant agent
      const agent = await fetch(`${API_URL}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `agent-${agentName.toLowerCase().replace(/\s+/g, "-")}`,
          name: agentName,
          role: agentRole,
          avatar: agentName.charAt(0).toUpperCase(),
          color: COLORS[0].value,
          tag_color: COLORS[0].tag,
          adapter_type: adapterType,
          adapter_config: adapterConfig,
          system_prompt: systemPrompt,
          reports_to: null,
          is_active: 1,
        }),
      });

      if (!agent.ok) {
        const err = await agent.json();
        throw new Error(err.error || "Failed to create agent");
      }

      const agentData = await agent.json();
      setCreatedAgent(agentData);

      // Save company info to backend settings
      if (companyName.trim()) {
        await fetch(`${API_URL}/api/settings/company-name`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: companyName.trim() }),
        });
      }
      if (companyDescription.trim()) {
        await fetch(`${API_URL}/api/settings/company-description`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: companyDescription.trim() }),
        });
      }

      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    setComplete(true);
    // Redirect to chat after a moment
    setTimeout(() => {
      window.location.href = "/chat";
    }, 2000);
  };

  // ── Render Steps ────────────────────────────────────────────

  if (complete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold">Setup Complete!</h1>
          <p className="text-muted-foreground">
            Your AI agent team is ready. Redirecting to chat...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Welcome to NMJ</h1>
              <p className="text-xs text-muted-foreground">AI Agent Management Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  s === step ? "bg-primary" : s < step ? "bg-primary/40" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step 1: Company Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Let's set up your company</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start by telling us about your organization. You can always change this later.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Meluna"
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
                <textarea
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  placeholder="What does your company do?"
                  rows={3}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">What you'll set up:</h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">1</div>
                  <span>Company information</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">2</div>
                  <span>CEO Assistant agent (your top AI agent)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">3</div>
                  <span>First task for your agent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">4</div>
                  <span>Review and launch</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: CEO Assistant */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Create your CEO Assistant</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This is your top AI agent. They'll coordinate all divisions and route communications.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Luna"
                    className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Role</label>
                  <select
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value)}
                    className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="CEO Assistant">CEO Assistant</option>
                    <option value="CTO">CTO</option>
                    <option value="COO">COO</option>
                    <option value="CFO">CFO</option>
                    <option value="CMO">CMO</option>
                    <option value="Custom">Custom Role</option>
                  </select>
                </div>
              </div>

              {/* Adapter Type */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Agent Runtime (Adapter)</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Choose how this agent runs. Each adapter connects to a different AI runtime.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {adapterMeta.map((meta) => (
                    <button
                      key={meta.type}
                      onClick={() => setAdapterType(meta.type)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                        adapterType === meta.type
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{meta.label}</span>
                          {meta.recommended && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/10 text-green-600">
                              REC
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{meta.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Adapter Config */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Adapter Configuration</label>
                  <button
                    onClick={testEnvironment}
                    disabled={envTestLoading}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Test Environment
                  </button>
                </div>
                <textarea
                  value={adapterConfig}
                  onChange={(e) => setAdapterConfig(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {envTestLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Testing environment...
                  </div>
                )}
                {envTestResult && (
                  <div className="mt-2 rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {envTestResult.status === "pass" && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                      {envTestResult.status === "warn" && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                      {envTestResult.status === "fail" && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                      <span className="capitalize">{envTestResult.status}</span>
                    </div>
                    {envTestResult.checks.map((check, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px]">
                        {check.level === "error" && <XCircle className="h-2.5 w-2.5 text-red-500 mt-0.5 shrink-0" />}
                        {check.level === "warn" && <AlertCircle className="h-2.5 w-2.5 text-amber-500 mt-0.5 shrink-0" />}
                        {check.level === "info" && <CheckCircle className="h-2.5 w-2.5 text-green-500 mt-0.5 shrink-0" />}
                        <span>{check.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  This defines your agent's personality and role. Customize it as needed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: First Task */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Create your first task</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Give your CEO Assistant something to work on. This helps them understand their role.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Set up the engineering team"
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Task Description</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Describe what the agent should do..."
                  rows={4}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium mb-2">Suggested first tasks:</h3>
              <div className="space-y-2">
                {[
                  { title: "Set up the engineering team", desc: "Hire a CTO and create the Engineering division" },
                  { title: "Create a company roadmap", desc: "Define goals and milestones for the next quarter" },
                  { title: "Establish communication protocols", desc: "Set up birokrasi rules for inter-agent communication" },
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTaskTitle(suggestion.title);
                      setTaskDescription(suggestion.desc);
                    }}
                    className="w-full text-left p-3 rounded-lg border hover:border-primary/30 transition-colors"
                  >
                    <p className="text-xs font-medium">{suggestion.title}</p>
                    <p className="text-[10px] text-muted-foreground">{suggestion.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Review & Launch</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review your setup before creating your first agent.
              </p>
            </div>

            <div className="space-y-4">
              {/* Company */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium mb-2">Company</h3>
                <p className="text-sm">{companyName}</p>
                {companyDescription && <p className="text-xs text-muted-foreground mt-1">{companyDescription}</p>}
              </div>

              {/* Agent */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium mb-2">CEO Assistant</h3>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold", COLORS[0].value)}>
                    {agentName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{agentName}</p>
                    <p className="text-xs text-muted-foreground">{agentRole}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {adapterType.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Task */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium mb-2">First Task</h3>
                <p className="text-sm">{taskTitle}</p>
                {taskDescription && <p className="text-xs text-muted-foreground mt-1">{taskDescription}</p>}
              </div>
            </div>

            {/* Org Preview */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium mb-3">Organization Preview</h3>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1">
                    <span className="text-xs font-bold text-primary">You</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Founder & CEO</p>
                </div>
                <ArrowDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
                <div className="text-center">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-1", COLORS[0].value)}>
                    <span className="text-xs font-bold">{agentName.charAt(0).toUpperCase()}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{agentRole}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-3">
                You can add more agents and create divisions later from the Agents page.
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 5 && createdAgent && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Agent Created!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your CEO Assistant <strong>{createdAgent.name}</strong> is ready.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4 max-w-sm mx-auto">
              <div className="flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold", createdAgent.color)}>
                  {createdAgent.avatar}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{createdAgent.name}</p>
                  <p className="text-xs text-muted-foreground">{createdAgent.role}</p>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {createdAgent.adapter_type.replace("_", " ")}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Rocket className="h-4 w-4" />
              Start Using NMJ
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            {step > 1 ? (
              <button
                onClick={() => setStep((step - 1) as Step)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 4 && (
              <button
                onClick={[handleStep1, handleStep2, handleStep3][step - 1]}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Continue
              </button>
            )}

            {step === 4 && (
              <button
                onClick={handleStep4}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Create Agent
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
