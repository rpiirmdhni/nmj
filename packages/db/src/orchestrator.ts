import { v4 as uuidv4 } from "uuid";
import { join } from "path";
import cron, { type ScheduledTask } from "node-cron";
import db from "./db";
import {
  Agent,
  Session,
  Message,
  ChatMessagePayload,
  ChatResponsePayload,
  TypingPayload,
  WSMessage,
  CronJob,
  FileItem,
  ProviderConfig,
  OrgNode,
  RoutingResult,
} from "../../shared/src/types";
import {
  executeAdapter,
  executeAdapterStreaming,
  testAdapterEnvironment,
  getAdapter,
} from "../../adapters/src/index";

type BroadcastFn = (message: WSMessage) => void;

class StreamBuffer {
  private buffer: string = "";
  private onFlush: (chunk: string) => void;

  constructor(onFlush: (chunk: string) => void) {
    this.onFlush = onFlush;
  }

  write(chunk: string): void {
    this.buffer += chunk;
    if (/\s/.test(this.buffer) || this.buffer.length >= 6) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer) {
      this.onFlush(this.buffer);
      this.buffer = "";
    }
  }
}

export class Orchestrator {
  private db;
  private broadcast: BroadcastFn;
  private cronJobs: Map<string, ScheduledTask> = new Map();

  constructor(broadcast: BroadcastFn) {
    this.db = db;
    this.broadcast = broadcast;
    this.initCronJobs();
  }

  // ── Cron Scheduler ──────────────────────────────────────────

  private initCronJobs(): void {
    const jobs = this.getAllCronJobs();
    for (const job of jobs) {
      if (job.is_active) {
        this.scheduleCronJob(job);
      }
    }
    console.log(`[Cron] Initialized ${this.cronJobs.size} active cron job(s)`);
  }

  private scheduleCronJob(job: CronJob): void {
    // Stop existing scheduled task if any
    this.unscheduleCronJob(job.id);

    if (!cron.validate(job.schedule)) {
      console.warn(`[Cron] Invalid cron expression for job "${job.name}": ${job.schedule}`);
      return;
    }

    const task = cron.schedule(job.schedule, async () => {
      console.log(`[Cron] Executing job: ${job.name}`);
      const agent = this.getAgent(job.agent_id);
      if (!agent) {
        console.error(`[Cron] Agent ${job.agent_id} not found for job "${job.name}"`);
        return;
      }

      // Update last_run_at and calculate next_run_at
      const now = new Date().toISOString();
      this.db.prepare(
        "UPDATE cron_jobs SET last_run_at = @now WHERE id = @id"
      ).run({ now, id: job.id });

      this.broadcast({
        type: "cron:triggered",
        payload: { jobId: job.id, jobName: job.name, agentId: job.agent_id },
        timestamp: now,
      });

      try {
        // Create a session for this cron job
        const session = this.getOrCreateSession(job.agent_id);
        const cronMessages = this.getSessionMessages(session.id, 10);
        const { systemPrompt, contextBlock } = this.buildAgentContext(agent, cronMessages);
        const response = await executeAdapter(agent, job.prompt, contextBlock, systemPrompt);

        this.db.prepare(`
          INSERT INTO messages (id, session_id, agent_id, sender_type, sender_name, content)
          VALUES (@id, @sessionId, @agentId, 'agent', @senderName, @content)
        `).run({
          id: uuidv4(),
          sessionId: session.id,
          agentId: job.agent_id,
          senderName: agent.name,
          content: `[Cron: ${job.name}]\n${response}`,
        });

        this.broadcast({
          type: "cron:completed",
          payload: { jobId: job.id, jobName: job.name, response: response.substring(0, 200) },
          timestamp: new Date().toISOString(),
        });

        console.log(`[Cron] Job "${job.name}" completed`);
      } catch (error) {
        console.error(`[Cron] Job "${job.name}" failed:`, error);
        this.broadcast({
          type: "cron:failed",
          payload: { jobId: job.id, jobName: job.name, error: error instanceof Error ? error.message : "Unknown error" },
          timestamp: new Date().toISOString(),
        });
      }
    }, {
      timezone: "Asia/Jakarta",
    });

    this.cronJobs.set(job.id, task);
    console.log(`[Cron] Scheduled job "${job.name}" with schedule: ${job.schedule}`);
  }

  private unscheduleCronJob(jobId: string): void {
    const existing = this.cronJobs.get(jobId);
    if (existing) {
      existing.stop();
      this.cronJobs.delete(jobId);
    }
  }

  rescheduleAllCronJobs(): void {
    for (const task of this.cronJobs.values()) {
      task.stop();
    }
    this.cronJobs.clear();
    this.initCronJobs();
  }

  destroyAllCronJobs(): void {
    for (const task of this.cronJobs.values()) {
      task.stop();
    }
    this.cronJobs.clear();
  }

  // ── Org Helpers ─────────────────────────────────────────────

  /** Get agent by ID */
  private getAgent(id: string): Agent | undefined {
    const agent = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Agent | undefined;
    if (agent && agent.reports_to) {
      const manager = this.db.prepare("SELECT name FROM agents WHERE id = ?").get(agent.reports_to) as { name: string } | undefined;
      agent.reports_to_name = manager ? manager.name : null;
    }
    return agent;
  }

  /** Get direct reports of an agent */
  private getDirectReports(agentId: string): Agent[] {
    const agents = this.db.prepare("SELECT * FROM agents WHERE reports_to = ?").all(agentId) as Agent[];
    const manager = this.db.prepare("SELECT name FROM agents WHERE id = ?").get(agentId) as { name: string } | undefined;
    if (manager) {
      for (const agent of agents) {
        agent.reports_to_name = manager.name;
      }
    }
    return agents;
  }

  /** Get the manager of an agent */
  private getManager(agentId: string): Agent | undefined {
    const agent = this.getAgent(agentId);
    if (!agent || !agent.reports_to) return undefined;
    return this.getAgent(agent.reports_to);
  }

  /** Get the root agent (CEO Assistant — reports_to is null) */
  private getRootAgent(): Agent | undefined {
    return this.db.prepare("SELECT * FROM agents WHERE reports_to IS NULL LIMIT 1").get() as Agent | undefined;
  }

  /** Get all ancestors up to root (for chain of command) */
  private getAncestors(agentId: string): Agent[] {
    const ancestors: Agent[] = [];
    let current = this.getAgent(agentId);
    while (current && current.reports_to) {
      const manager = this.getAgent(current.reports_to);
      if (!manager) break;
      ancestors.push(manager);
      current = manager;
    }
    return ancestors;
  }

  /** Get all descendants (full subtree) */
  private getDescendants(agentId: string): Agent[] {
    const descendants: Agent[] = [];
    const queue = [agentId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const reports = this.getDirectReports(current);
      for (const report of reports) {
        descendants.push(report);
        queue.push(report.id);
      }
    }
    return descendants;
  }

  /** Check if two agents are in the same division (share the same manager) */
  private areInSameDivision(agentId1: string, agentId2: string): boolean {
    if (agentId1 === agentId2) return true;

    const agent1 = this.getAgent(agentId1);
    const agent2 = this.getAgent(agentId2);
    if (!agent1 || !agent2) return false;

    // CEO Assistant (reports_to null) is above all divisions
    if (!agent1.reports_to || !agent2.reports_to) return false;

    // Same direct manager = same division
    if (agent1.reports_to === agent2.reports_to) return true;

    // Check if one is the manager of the other's division
    if (agent1.reports_to === agentId2 || agent2.reports_to === agentId1) return true;

    return false;
  }

  /** Get the division head for an agent (first ancestor with reports_to = null, or the agent itself if it's a direct report of root) */
  private getDivisionHead(agentId: string): Agent | undefined {
    const agent = this.getAgent(agentId);
    if (!agent) return undefined;

    // If this agent reports to root or is root, they ARE the division head
    if (!agent.reports_to) return agent; // CEO Assistant

    // Walk up until we find someone who reports to root
    let current = agent;
    while (current.reports_to) {
      const manager = this.getAgent(current.reports_to);
      if (!manager) break;
      if (!manager.reports_to) {
        // manager reports to null = manager is CEO Assistant, so current is division head
        return current;
      }
      current = manager;
    }

    return current;
  }

  /** Build org tree */
  private buildOrgTree(): OrgNode | null {
    const root = this.getRootAgent();
    if (!root) return null;

    const buildNode = (agent: Agent): OrgNode => {
      const children = this.getDirectReports(agent.id).map(buildNode);
      return {
        agent,
        children,
        division: agent.reports_to ? this.getDivisionHead(agent.id)?.id || null : null,
      };
    };

    return buildNode(root);
  }

  /** Calculate routing path for cross-division communication */
  private calculateRouting(fromAgentId: string, toAgentId: string): RoutingResult {
    // Same agent
    if (fromAgentId === toAgentId) {
      return { allowed: true, path: [fromAgentId] };
    }

    const fromAgent = this.getAgent(fromAgentId);
    const toAgent = this.getAgent(toAgentId);
    if (!fromAgent || !toAgent) {
      return { allowed: false, path: [], reason: "Agent not found" };
    }

    // CEO Assistant can reach anyone directly
    if (!fromAgent.reports_to) {
      return { allowed: true, path: [fromAgentId, toAgentId] };
    }

    // Same division — direct communication allowed
    if (this.areInSameDivision(fromAgentId, toAgentId)) {
      return { allowed: true, path: [fromAgentId, toAgentId] };
    }

    // Cross-division: route up to division head, then to CEO Assistant, then down
    const fromDivisionHead = this.getDivisionHead(fromAgentId);
    const toDivisionHead = this.getDivisionHead(toAgentId);
    const root = this.getRootAgent();

    if (!fromDivisionHead || !toDivisionHead || !root) {
      return { allowed: false, path: [], reason: "Cannot determine routing path" };
    }

    const path: string[] = [fromAgentId];

    // Up to division head
    if (fromAgentId !== fromDivisionHead.id) {
      path.push(fromDivisionHead.id);
    }

    // To CEO Assistant (root)
    if (fromDivisionHead.id !== root.id) {
      path.push(root.id);
    }

    // To target division head
    if (toDivisionHead.id !== root.id && toDivisionHead.id !== path[path.length - 1]) {
      path.push(toDivisionHead.id);
    }

    // Down to target
    if (toAgentId !== path[path.length - 1]) {
      path.push(toAgentId);
    }

    return { allowed: true, path };
  }

  // ── Agent CRUD ──────────────────────────────────────────────

  getAllAgents(): Agent[] {
    const agents = this.db.prepare("SELECT * FROM agents ORDER BY name").all() as Agent[];
    for (const agent of agents) {
      if (agent.reports_to) {
        const manager = this.db.prepare("SELECT name FROM agents WHERE id = ?").get(agent.reports_to) as { name: string } | undefined;
        agent.reports_to_name = manager ? manager.name : null;
      }
    }
    return agents;
  }

  getAgentById(id: string): Agent | undefined {
    return this.getAgent(id);
  }

  createAgent(data: Omit<Agent, "created_at" | "updated_at">): Agent {
    const id = data.id || uuidv4();

    // BUG-4: Prevent self-referencing reports_to
    if (data.reports_to && data.reports_to === id) {
      throw new Error("Agent cannot report to itself (reports_to cannot equal id)");
    }

    // BUG-3: Validate FK reference before insert
    if (data.reports_to) {
      const parent = this.getAgent(data.reports_to);
      if (!parent) {
        throw new Error(`Referenced agent '${data.reports_to}' does not exist`);
      }
    }

    try {
      this.db.prepare(`
        INSERT INTO agents (id, name, role, avatar, color, tag_color, adapter_type, adapter_config, system_prompt, reports_to)
        VALUES (@id, @name, @role, @avatar, @color, @tag_color, @adapter_type, @adapter_config, @system_prompt, @reports_to)
      `).run({ ...data, id });
    } catch (e: any) {
      if (e.message?.includes("FOREIGN KEY")) {
        throw new Error(`Referenced agent '${data.reports_to}' does not exist`);
      }
      throw e;
    }
    return this.getAgent(id)!;
  }

  updateAgent(id: string, data: Partial<Agent>): Agent | undefined {
    const agent = this.getAgent(id);
    if (!agent) return undefined;

    const updated = { ...agent, ...data, updated_at: new Date().toISOString() };
    this.db.prepare(`
      UPDATE agents SET name=@name, role=@role, avatar=@avatar, color=@color,
      tag_color=@tag_color, adapter_type=@adapter_type, adapter_config=@adapter_config,
      system_prompt=@system_prompt, reports_to=@reports_to, is_active=@is_active,
      updated_at=@updated_at WHERE id=@id
    `).run(updated);
    return this.getAgent(id);
  }

  deleteAgent(id: string): boolean {
    const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  getOrgTree(): OrgNode | null {
    return this.buildOrgTree();
  }

  // ── Adapter Operations ──────────────────────────────────────

  async testAgentEnvironment(agentIdOrAgent: string | Agent): Promise<any> {
    let agent: Agent | undefined;
    if (typeof agentIdOrAgent === "string") {
      agent = this.getAgent(agentIdOrAgent);
    } else {
      agent = agentIdOrAgent;
    }
    if (!agent) throw new Error("Agent not found");
    return testAdapterEnvironment(agent);
  }

  getAdapterMeta(): any[] {
    const { listAdapterMeta } = require("../../adapters/src/index");
    return listAdapterMeta();
  }

  // ── Session Management ──────────────────────────────────────

  getOrCreateSession(agentId: string): Session {
    const existing = this.db.prepare(
      "SELECT * FROM sessions WHERE agent_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1"
    ).get(agentId) as Session | undefined;

    if (existing) return existing;

    const sessionId = uuidv4();
    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, status) VALUES (@id, @agentId, 'active')
    `).run({ id: sessionId, agentId });

    return this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Session;
  }

  closeSession(sessionId: string): void {
    this.db.prepare("UPDATE sessions SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(sessionId);
  }

  getSessionMessages(sessionId: string, limit = 50): Message[] {
    return this.db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(sessionId, limit) as Message[];
  }

  // ── Agent Context Builder ───────────────────────────────────

  /**
   * Builds the full context block for an agent call:
   *   1. Long-term memories (facts)
   *   2. Commitments (behavioral rules)
   *   3. SKILLS.md from agent_files
   *   4. Org awareness — peers, hierarchy, and tagging rules
   *   5. Recent conversation history
   *
   * Returns { systemPrompt, contextBlock } to be passed separately to adapters.
   */
  private buildAgentContext(
    agent: Agent,
    sessionMessages: Message[]
  ): { systemPrompt: string; contextBlock: string } {
    const parts: string[] = [];

    // 1. Long-term memories
    const longTermMemories = this.db.prepare(
      `SELECT content FROM agent_memories
       WHERE agent_id = ? AND type = 'long_term'
       ORDER BY importance DESC, created_at DESC LIMIT 20`
    ).all(agent.id) as { content: string }[];
    if (longTermMemories.length > 0) {
      parts.push(`=== LONG-TERM MEMORY ===\n${longTermMemories.map((m) => `- ${m.content}`).join("\n")}`);
    }

    // 2. Commitments (behavioural rules that always apply)
    const commitments = this.db.prepare(
      `SELECT content FROM agent_memories
       WHERE agent_id = ? AND type = 'commitment'
       ORDER BY importance DESC, created_at DESC LIMIT 10`
    ).all(agent.id) as { content: string }[];
    if (commitments.length > 0) {
      parts.push(`=== COMMITMENTS ===\n${commitments.map((m) => `- ${m.content}`).join("\n")}`);
    }

    // 3. Skills from agent_files ("SKILLS.md")
    const skillsFile = this.db.prepare(
      `SELECT content FROM agent_files WHERE agent_id = ? AND name = 'SKILLS.md'`
    ).get(agent.id) as { content: string } | undefined;
    if (skillsFile?.content?.trim()) {
      parts.push(`=== SKILLS & CAPABILITIES ===\n${skillsFile.content.trim()}`);
    }

    // 4. Org awareness — who this agent is, who they work with, and tagging rules
    const orgBlock = this.buildOrgAwarenessBlock(agent);
    if (orgBlock) {
      parts.push(orgBlock);
    }

    // 5. Conversation history (chronological, last 10)
    const history = [...sessionMessages]
      .reverse()
      .map((m) => {
        const name = m.sender_type === "user" ? "User" : m.sender_name || "Agent";
        return `${name}: ${m.content}`;
      })
      .join("\n");
    if (history) {
      parts.push(`=== CONVERSATION HISTORY ===\n${history}`);
    }

    return {
      systemPrompt: agent.system_prompt || "You are a helpful AI agent.",
      contextBlock: parts.join("\n\n"),
    };
  }

  /**
   * Builds the ORG AWARENESS context block for an agent.
   * Informs the agent: who they are, who they report to, their direct reports,
   * the full org tree, same-division peers, and explicit @-tagging routing rules.
   */
  private buildOrgAwarenessBlock(agent: Agent): string {
    const allAgents = this.getAllAgents();
    if (allAgents.length <= 1) return ""; // Solo agent — no org context needed

    const lines: string[] = [];

    lines.push(`=== ORG AWARENESS ===`);
    lines.push(`You are ${agent.name} (${agent.role}).`);
    lines.push(``);

    // ── Position in hierarchy ────────────────────────────────
    lines.push(`YOUR POSITION IN THE ORGANIZATION:`);

    const manager = agent.reports_to
      ? allAgents.find((a) => a.id === agent.reports_to)
      : null;

    if (!manager) {
      lines.push(`- You are at the TOP of the organization. All agents report (directly or indirectly) to you.`);
    } else {
      lines.push(`- You report to: ${manager.name} (${manager.role})`);
    }

    const directReports = allAgents.filter((a) => a.reports_to === agent.id);
    if (directReports.length > 0) {
      lines.push(`- Your direct reports: ${directReports.map((a) => `${a.name} (${a.role})`).join(", ")}`);
    } else {
      lines.push(`- You have no direct reports.`);
    }

    // ── Full org tree ────────────────────────────────────────
    lines.push(``);
    lines.push(`FULL ORGANIZATION CHART:`);

    const renderTree = (agentId: string, prefix: string, isLast: boolean): string[] => {
      const a = allAgents.find((x) => x.id === agentId);
      if (!a) return [];
      const marker = prefix === "" ? "" : (isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ");
      const selfTag = a.id === agent.id ? " \u2190 YOU" : "";
      const childPrefix = prefix === "" ? "" : (isLast ? "    " : "\u2502   ");
      const children = allAgents.filter((x) => x.reports_to === agentId);
      const nodeLines: string[] = [`${prefix}${marker}${a.name} (${a.role})${selfTag}`];
      children.forEach((child, idx) => {
        nodeLines.push(...renderTree(child.id, prefix + childPrefix, idx === children.length - 1));
      });
      return nodeLines;
    };

    const roots = allAgents.filter((a) => !a.reports_to);
    roots.forEach((root) => lines.push(...renderTree(root.id, "", true)));

    // ── Same-division peers ──────────────────────────────────
    const peers = allAgents.filter(
      (a) => a.id !== agent.id && a.reports_to === agent.reports_to && a.reports_to !== null
    );
    if (peers.length > 0) {
      lines.push(``);
      lines.push(`SAME-DIVISION PEERS (direct tagging allowed):`);
      peers.forEach((p) => lines.push(`- @${p.name} (${p.role})`));
    }

    // ── Tagging & routing rules ──────────────────────────────
    lines.push(``);
    lines.push(`TAGGING & ROUTING RULES:`);
    lines.push(`- Tag an agent by writing @[Name] in your message to route a task to them.`);
    lines.push(`- Example: "@Atlas please check the server health"`);
    if (!manager) {
      lines.push(`- As the top-level agent, you can tag ANY agent directly.`);
    } else {
      lines.push(`- You can tag DIRECTLY: your manager (@${manager.name}) and your direct reports.`);
      if (peers.length > 0) {
        lines.push(`- Same-division peers you can tag directly: ${peers.map((p) => `@${p.name}`).join(", ")}.`);
      }
      lines.push(`- For agents OUTSIDE your division, tag @${manager.name} first — they will route it up.`);
    }

    // ── Full agent directory ─────────────────────────────────
    lines.push(``);
    lines.push(`ALL AGENTS IN THE SYSTEM:`);
    allAgents
      .filter((a) => a.id !== agent.id)
      .forEach((a) => {
        const rel = a.reports_to === agent.id
          ? " [your direct report]"
          : a.id === agent.reports_to
          ? " [your manager]"
          : "";
        lines.push(`- @${a.name} — ${a.role}${rel}`);
      });

    return lines.join("\n");
  }

  // ── Inter-Agent Communication (with birokrasi) ─────────────

  async sendInterAgentMessage(
    fromAgentId: string,
    toAgentId: string,
    message: string,
    originalSessionId: string,
    _depth: number = 0
  ): Promise<string> {
    // Prevent infinite recursion in inter-agent messaging
    const MAX_INTER_AGENT_DEPTH = 2;
    if (_depth >= MAX_INTER_AGENT_DEPTH) {
      console.warn(`[Birokrasi] Max inter-agent depth (${MAX_INTER_AGENT_DEPTH}) reached, stopping chain`);
      return "[System: Max inter-agent message chain depth reached]";
    }

    const fromAgent = this.getAgent(fromAgentId);
    const toAgent = this.getAgent(toAgentId);

    if (!fromAgent || !toAgent) {
      throw new Error("Agent not found");
    }

    // Check routing
    const routing = this.calculateRouting(fromAgentId, toAgentId);
    if (!routing.allowed) {
      throw new Error(`Communication not allowed: ${routing.reason}`);
    }

    // If cross-division, log the routing
    if (routing.path.length > 2) {
      console.log(`[Birokrasi] Cross-division message routed: ${routing.path.join(" → ")}`);
    }

    const logId = uuidv4();
    this.db.prepare(`
      INSERT INTO inter_agent_logs (id, from_agent_id, to_agent_id, session_id, message, status)
      VALUES (@id, @fromId, @toId, @sessionId, @message, 'processing')
    `).run({ id: logId, fromId: fromAgentId, toId: toAgentId, sessionId: originalSessionId, message });

    const targetSession = this.getOrCreateSession(toAgentId);
    const targetMessages = this.getSessionMessages(targetSession.id, 10);
    const { systemPrompt, contextBlock } = this.buildAgentContext(toAgent, targetMessages);

    // Clear message format so target agent understands who is contacting them and why
    const interAgentPrompt = `[MESSAGE FROM ${fromAgent.name.toUpperCase()} (${fromAgent.role})]:\n${message}\n\nRespond directly to ${fromAgent.name}. If you need to delegate or escalate to another agent, append exactly one line at the end: [ROUTE: AgentName].`;
    const streamId = uuidv4();

    this.broadcast({
      type: "chat:typing",
      payload: { sessionId: originalSessionId, agentId: toAgentId, isTyping: true } as TypingPayload,
      timestamp: new Date().toISOString(),
    });

    try {
      const streamBuffer = new StreamBuffer((flushedChunk: string) => {
        this.broadcast({
          type: "chat:response",
          payload: {
            streamId,
            sessionId: originalSessionId,
            fromAgentId: toAgentId,
            fromAgentName: toAgent.name,
            content: flushedChunk,
            isInterAgent: true,
            isDone: false,
          } as ChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      });

      // Stream so the response appears live in the chat UI
      const response = await executeAdapterStreaming(
        toAgent,
        interAgentPrompt,
        contextBlock,
        (chunk: string) => {
          streamBuffer.write(chunk);
        },
        systemPrompt
      );
      streamBuffer.flush();

      // Strip [ROUTE: ...] tag from inter-agent response before storing/broadcasting
      const routeMatch = response.match(/\[ROUTE:\s*([^\]]+)\]/i);
      const delegateToName = routeMatch ? routeMatch[1].trim() : null;
      const cleanResponse = response.replace(/\[ROUTE:\s*[^\]]+\]\s*/gi, "").trimEnd();

      this.db.prepare(
        "UPDATE inter_agent_logs SET response = @response, status = 'completed', completed_at = datetime('now') WHERE id = @id"
      ).run({ response: cleanResponse, id: logId });

      // Persist incoming message in target session
      this.db.prepare(`
        INSERT INTO messages (id, session_id, agent_id, sender_type, sender_name, content, tagged_agent_ids)
        VALUES (@id, @sessionId, @agentId, 'user', @senderName, @content, @taggedIds)
      `).run({
        id: uuidv4(),
        sessionId: targetSession.id,
        agentId: toAgentId,
        senderName: fromAgent.name,
        content: interAgentPrompt,
        taggedIds: JSON.stringify([toAgentId]),
      });

      // Persist target agent's clean response
      this.db.prepare(`
        INSERT INTO messages (id, session_id, agent_id, sender_type, sender_name, content, tagged_agent_ids)
        VALUES (@id, @sessionId, @agentId, 'agent', @senderName, @content, @taggedIds)
      `).run({
        id: uuidv4(),
        sessionId: targetSession.id,
        agentId: toAgentId,
        senderName: toAgent.name,
        content: cleanResponse,
        taggedIds: null,
      });

      // Final broadcast with clean response
      this.broadcast({
        type: "chat:response",
        payload: {
          streamId,
          sessionId: originalSessionId,
          fromAgentId: toAgentId,
          fromAgentName: toAgent.name,
          content: cleanResponse,
          isInterAgent: true,
          isDone: true,
        } as ChatResponsePayload,
        timestamp: new Date().toISOString(),
      });

      this.broadcast({
        type: "chat:typing",
        payload: { sessionId: originalSessionId, agentId: toAgentId, isTyping: false } as TypingPayload,
        timestamp: new Date().toISOString(),
      });

      // Chain: agent-initiated delegation via [ROUTE: AgentName] (only first, only if not self)
      if (delegateToName && _depth + 1 < MAX_INTER_AGENT_DEPTH) {
        const allAgents = this.getAllAgents();
        const next = allAgents.find(
          (a) => a.name.toLowerCase() === delegateToName.toLowerCase()
        );
        if (next && next.id !== toAgentId && next.id !== fromAgentId) {
          await this.sendInterAgentMessage(toAgentId, next.id, cleanResponse, originalSessionId, _depth + 1);
        }
      }

      return cleanResponse;
    } catch (error) {
      this.db.prepare(
        "UPDATE inter_agent_logs SET status = 'failed', completed_at = datetime('now') WHERE id = @id"
      ).run({ id: logId });

      this.broadcast({
        type: "chat:typing",
        payload: { sessionId: originalSessionId, agentId: toAgentId, isTyping: false } as TypingPayload,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  // ── Main Chat Handler ───────────────────────────────────────

  async handleChatMessage(payload: ChatMessagePayload): Promise<void> {
    const { sessionId, agentId, content, taggedAgentIds } = payload;

    const agent = this.getAgent(agentId);
    if (!agent) {
      this.broadcast({
        type: "error",
        payload: { message: `Agent ${agentId} not found` },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const session = this.getOrCreateSession(agentId);

    // Store user message
    const userMsgId = uuidv4();
    this.db.prepare(`
      INSERT INTO messages (id, session_id, agent_id, sender_type, sender_name, content, tagged_agent_ids)
      VALUES (@id, @sessionId, @agentId, 'user', 'User', @content, @taggedIds)
    `).run({
      id: userMsgId,
      sessionId: session.id,
      agentId,
      content,
      taggedIds: JSON.stringify(taggedAgentIds),
    });

    this.db.prepare(
      "UPDATE sessions SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(session.id);

    this.broadcast({
      type: "chat:typing",
      payload: { sessionId, agentId, isTyping: true } as TypingPayload,
      timestamp: new Date().toISOString(),
    });

    try {
      const recentMessages = this.getSessionMessages(session.id, 10);
      const { systemPrompt, contextBlock } = this.buildAgentContext(agent, recentMessages);

      // Unique stream ID so client can match chunks in multi-agent scenarios
      const streamId = uuidv4();

      const streamBuffer = new StreamBuffer((flushedChunk: string) => {
        this.broadcast({
          type: "chat:response",
          payload: {
            streamId,
            sessionId: session.id,
            fromAgentId: agentId,
            content: flushedChunk,
            isInterAgent: false,
            isDone: false,
          } as ChatResponsePayload,
          timestamp: new Date().toISOString(),
        });
      });

      // Use adapter system with full personality + memory + skills context
      const response = await executeAdapterStreaming(
        agent,
        content,
        contextBlock,
        (chunk: string) => {
          streamBuffer.write(chunk);
        },
        systemPrompt
      );
      streamBuffer.flush();

      this.broadcast({
        type: "chat:typing",
        payload: { sessionId: session.id, agentId, isTyping: false } as TypingPayload,
        timestamp: new Date().toISOString(),
      });

      // Strip [ROUTE: ...] tag from response before storing/broadcasting
      const routeMatch = response.match(/\[ROUTE:\s*([^\]]+)\]/i);
      const delegateToName = routeMatch ? routeMatch[1].trim() : null;
      const cleanResponse = response.replace(/\[ROUTE:\s*[^\]]+\]\s*/gi, "").trimEnd();

      // Store agent response (clean, without routing tag)
      const agentMsgId = uuidv4();
      this.db.prepare(`
        INSERT INTO messages (id, session_id, agent_id, sender_type, sender_name, content, tagged_agent_ids)
        VALUES (@id, @sessionId, @agentId, 'agent', @senderName, @content, @taggedIds)
      `).run({
        id: agentMsgId,
        sessionId: session.id,
        agentId,
        senderName: agent.name,
        content: cleanResponse,
        taggedIds: null,
      });

      // Final broadcast with clean response
      this.broadcast({
        type: "chat:response",
        payload: {
          streamId,
          sessionId: session.id,
          fromAgentId: agentId,
          content: cleanResponse,
          isInterAgent: false,
          isDone: true,
        } as ChatResponsePayload,
        timestamp: new Date().toISOString(),
      });

      // Fix 3a: Orchestrator-controlled sequential routing for remaining user-tagged agents
      // This runs REGARDLESS of model output — guarantees all tagged agents get called in order
      const remainingTaggedAgents = (taggedAgentIds || []).filter((id: string) => id !== agentId);
      let lastContext = cleanResponse;
      for (const nextAgentId of remainingTaggedAgents) {
        lastContext = await this.sendInterAgentMessage(agentId, nextAgentId, lastContext, session.id);
      }

      // Fix 3b: Agent-initiated delegation via [ROUTE: AgentName] in response
      // Only runs if no user-tagged agents remain (avoid double-routing)
      if (delegateToName && remainingTaggedAgents.length === 0) {
        const allAgents = this.getAllAgents();
        const delegateAgent = allAgents.find(
          (a) => a.name.toLowerCase() === delegateToName.toLowerCase()
        );
        if (delegateAgent && delegateAgent.id !== agentId) {
          await this.sendInterAgentMessage(agentId, delegateAgent.id, cleanResponse, session.id);
        }
      }
    } catch (error) {
      this.broadcast({
        type: "chat:typing",
        payload: { sessionId, agentId, isTyping: false } as TypingPayload,
        timestamp: new Date().toISOString(),
      });

      this.broadcast({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── Supported Provider Definitions ──────────────────────────

  getSupportedProviders(): Array<{
    id: string;
    name: string;
    baseUrl: string;
    envVar: string;
    supportsModelList: boolean;
    defaultModel: string;
  }> {
    return [
      { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", envVar: "OPENAI_API_KEY", supportsModelList: true, defaultModel: "gpt-4o" },
      { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com", envVar: "ANTHROPIC_API_KEY", supportsModelList: false, defaultModel: "claude-sonnet-4-20250514" },
      { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envVar: "OPENROUTER_API_KEY", supportsModelList: true, defaultModel: "openrouter/auto" },
      { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1", envVar: "", supportsModelList: true, defaultModel: "llama3" },
      { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", envVar: "GEMINI_API_KEY", supportsModelList: true, defaultModel: "gemini-2.0-flash" },
      { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", envVar: "DEEPSEEK_API_KEY", supportsModelList: true, defaultModel: "deepseek-chat" },
      { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", envVar: "GROQ_API_KEY", supportsModelList: true, defaultModel: "llama-3.3-70b-versatile" },
      { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", envVar: "MISTRAL_API_KEY", supportsModelList: true, defaultModel: "mistral-large-latest" },
      { id: "together", name: "Together AI", baseUrl: "https://api.together.xyz/v1", envVar: "TOGETHER_API_KEY", supportsModelList: true, defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
      { id: "fireworks", name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", envVar: "FIREWORKS_API_KEY", supportsModelList: true, defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
      { id: "perplexity", name: "Perplexity", baseUrl: "https://api.perplexity.ai", envVar: "PERPLEXITY_API_KEY", supportsModelList: false, defaultModel: "sonar-pro" },
      { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", envVar: "NVIDIA_API_KEY", supportsModelList: true, defaultModel: "meta/llama-3.3-70b-instruct" },
      { id: "xai", name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", envVar: "XAI_API_KEY", supportsModelList: true, defaultModel: "grok-2-latest" },
      { id: "custom", name: "Custom", baseUrl: "", envVar: "", supportsModelList: false, defaultModel: "" },
    ];
  }

  async fetchProviderModels(id: string): Promise<Array<{ id: string; name: string }>> {
    const config = this.db.prepare("SELECT * FROM provider_configs WHERE id = ?").get(id) as ProviderConfig | undefined;
    if (!config) throw new Error("Provider not found");
    if (!config.base_url) throw new Error("Provider has no base URL configured");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.api_key) headers["Authorization"] = `Bearer ${config.api_key}`;

    const baseUrl = config.base_url.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    // Handle OpenAI-style { data: [...] } and Ollama-style { models: [...] }
    const models = (data.data || data.models || []) as unknown[];
    if (!Array.isArray(models)) throw new Error("Unexpected models response format");
    return models.map((m: unknown) => {
      const model = m as Record<string, unknown>;
      const id = String(model.id || model.name || m);
      return { id, name: id };
    });
  }

  // ── Provider Config CRUD (legacy) ───────────────────────────

  getAllProviderConfigs(): ProviderConfig[] {
    return this.db.prepare("SELECT * FROM provider_configs ORDER BY name").all() as ProviderConfig[];
  }

  createProviderConfig(data: Omit<ProviderConfig, "created_at" | "updated_at">): ProviderConfig {
    const id = data.id || uuidv4();
    this.db.prepare(`
      INSERT INTO provider_configs (id, name, type, base_url, api_key, is_active)
      VALUES (@id, @name, @type, @baseUrl, @apiKey, @isActive)
    `).run({
      id,
      name: data.name,
      type: data.type,
      baseUrl: data.base_url || null,
      apiKey: data.api_key || null,
      isActive: data.is_active ?? 1,
    });
    return this.db.prepare("SELECT * FROM provider_configs WHERE id = ?").get(id) as ProviderConfig;
  }

  updateProviderConfig(id: string, data: Partial<ProviderConfig>): ProviderConfig | undefined {
    const config = this.db.prepare("SELECT * FROM provider_configs WHERE id = ?").get(id) as ProviderConfig | undefined;
    if (!config) return undefined;

    const updated = {
      ...config,
      ...data,
      base_url: data.base_url !== undefined ? data.base_url : config.base_url,
      api_key: data.api_key !== undefined ? data.api_key : config.api_key,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare(`
      UPDATE provider_configs SET name=@name, type=@type, base_url=@base_url,
      api_key=@api_key, is_active=@is_active, updated_at=@updated_at WHERE id=@id
    `).run(updated);

    return this.db.prepare("SELECT * FROM provider_configs WHERE id = ?").get(id) as ProviderConfig;
  }

  deleteProviderConfig(id: string): boolean {
    const result = this.db.prepare("DELETE FROM provider_configs WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async testProvider(id: string): Promise<{ success: boolean; message: string }> {
    const config = this.db.prepare("SELECT * FROM provider_configs WHERE id = ?").get(id) as ProviderConfig | undefined;
    if (!config) return { success: false, message: "Provider not found" };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.api_key) headers["Authorization"] = `Bearer ${config.api_key}`;

      const baseUrl = (config.base_url || "").replace(/\/v1$/, "");
      const res = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(10000) });
      return {
        success: res.ok,
        message: res.ok ? `✅ ${config.name} is reachable` : `❌ ${config.name} is not reachable`,
      };
    } catch (e) {
      return {
        success: false,
        message: `❌ Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      };
    }
  }

  // ── Cron Jobs ───────────────────────────────────────────────

  getAllCronJobs(): CronJob[] {
    return this.db.prepare("SELECT * FROM cron_jobs ORDER BY name").all() as CronJob[];
  }

  createCronJob(data: Omit<CronJob, "created_at" | "updated_at">): CronJob {
    const id = data.id || uuidv4();
    this.db.prepare(`
      INSERT INTO cron_jobs (id, name, agent_id, schedule, prompt, is_active)
      VALUES (@id, @name, @agentId, @schedule, @prompt, @isActive)
    `).run({
      id,
      name: data.name,
      agentId: data.agent_id,
      schedule: data.schedule,
      prompt: data.prompt,
      isActive: data.is_active ?? 1,
    });
    return this.db.prepare("SELECT * FROM cron_jobs WHERE id = ?").get(id) as CronJob;
  }

  updateCronJob(id: string, data: Partial<CronJob>): CronJob | undefined {
    const job = this.db.prepare("SELECT * FROM cron_jobs WHERE id = ?").get(id) as CronJob | undefined;
    if (!job) return undefined;

    const updated = { ...job, ...data, updated_at: new Date().toISOString() };
    this.db.prepare(`
      UPDATE cron_jobs SET name=@name, agent_id=@agentId, schedule=@schedule,
      prompt=@prompt, is_active=@is_active, updated_at=@updated_at WHERE id=@id
    `).run(updated);
    return this.db.prepare("SELECT * FROM cron_jobs WHERE id = ?").get(id) as CronJob;
  }

  deleteCronJob(id: string): boolean {
    const result = this.db.prepare("DELETE FROM cron_jobs WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── File Manager ────────────────────────────────────────────

  getAllFiles(): FileItem[] {
    return this.db.prepare("SELECT * FROM files ORDER BY type DESC, name").all() as FileItem[];
  }

  getFile(id: string): FileItem | undefined {
    return this.db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileItem | undefined;
  }

  createFile(data: Omit<FileItem, "created_at" | "updated_at">): FileItem {
    const id = data.id || uuidv4();
    this.db.prepare(`
      INSERT INTO files (id, name, type, mime_type, size, path, parent_id, uploaded_by)
      VALUES (@id, @name, @type, @mimeType, @size, @path, @parentId, @uploadedBy)
    `).run({
      id,
      name: data.name,
      type: data.type,
      mimeType: data.mime_type,
      size: data.size,
      path: data.path,
      parentId: data.parent_id,
      uploadedBy: data.uploaded_by,
    });
    return this.getFile(id)!;
  }

  deleteFile(id: string): boolean {
    const result = this.db.prepare("DELETE FROM files WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Agent Memory ────────────────────────────────────────────

  getAgentMemories(agentId: string, type?: string): any[] {
    if (type) {
      return this.db.prepare(
        "SELECT * FROM agent_memories WHERE agent_id = ? AND type = ? ORDER BY importance DESC, created_at DESC"
      ).all(agentId, type);
    }
    return this.db.prepare(
      "SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY importance DESC, created_at DESC"
    ).all(agentId);
  }

  createAgentMemory(data: {
    agent_id: string;
    type: string;
    content: string;
    importance?: number;
    tags?: string;
    source?: string;
    session_id?: string;
  }): any {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO agent_memories (id, agent_id, type, content, importance, tags, source, session_id)
      VALUES (@id, @agentId, @type, @content, @importance, @tags, @source, @sessionId)
    `).run({
      id,
      agentId: data.agent_id,
      type: data.type,
      content: data.content,
      importance: data.importance ?? 0.5,
      tags: data.tags || null,
      source: data.source || "auto",
      sessionId: data.session_id || null,
    });
    return this.db.prepare("SELECT * FROM agent_memories WHERE id = ?").get(id);
  }

  // ── Agent Workspace Files ───────────────────────────────────

  getAgentFiles(agentId: string): any[] {
    return this.db.prepare("SELECT * FROM agent_files WHERE agent_id = ?").all(agentId);
  }

  getAgentFile(agentId: string, name: string): any {
    return this.db.prepare("SELECT * FROM agent_files WHERE agent_id = ? AND name = ?").get(agentId, name);
  }

  upsertAgentFile(agentId: string, name: string, content: string): any {
    const existing = this.getAgentFile(agentId, name);
    if (existing) {
      this.db.prepare(
        "UPDATE agent_files SET content = @content, updated_at = datetime('now') WHERE agent_id = @agentId AND name = @name"
      ).run({ content, agentId, name });
    } else {
      const id = uuidv4();
      this.db.prepare(
        "INSERT INTO agent_files (id, agent_id, name, content) VALUES (@id, @agentId, @name, @content)"
      ).run({ id, agentId, name, content });
    }
    return this.getAgentFile(agentId, name);
  }

  // ── Settings ────────────────────────────────────────────────

  getAllSettings(): Array<{ key: string; value: string }> {
    return this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))"
    ).run({ key, value });
  }
}
