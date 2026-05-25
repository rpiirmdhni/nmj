// Base adapter class with common functionality

import { spawn, ChildProcess } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { Agent, AgentAdapter, AdapterEnvironmentTestResult, AdapterConfig, AgentAdapterType } from "../../shared/src/types";

export class BaseAdapter implements AgentAdapter {
  type: string = "custom";
  label = "Base";
  description = "Base adapter";

  async execute(agent: Agent, message: string, context?: string, systemPrompt?: string): Promise<string> {
    throw new Error("execute() not implemented");
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void,
    systemPrompt?: string
  ): Promise<string> {
    throw new Error("executeStreaming() not implemented");
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    throw new Error("testEnvironment() not implemented");
  }

  async isAvailable(agent: Agent): Promise<boolean> {
    return false;
  }

  async healthCheck(agent: Agent): Promise<boolean> {
    return this.isAvailable(agent);
  }

  public parseConfig(agent: Agent): AdapterConfig {
    try {
      return JSON.parse(agent.adapter_config || "{}") as AdapterConfig;
    } catch {
      return {};
    }
  }

  public async runCommand(
    command: string,
    args: string[],
    options: {
      stdin?: string;
      cwd?: string;
      env?: Record<string, string>;
      timeoutSec?: number;
      graceSec?: number;
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
    } = {}
  ): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const {
        stdin,
        cwd,
        env,
        timeoutSec = 120,
        graceSec = 10,
        onStdout,
        onStderr,
      } = options;

      const fullEnv = { ...process.env, ...env } as NodeJS.ProcessEnv;
      const proc: ChildProcess = spawn(command, args, {
        cwd,
        env: fullEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let killed = false;

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onStdout?.(text);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onStderr?.(text);
      });

      // Write to stdin if provided, then close
      if (stdin) {
        proc.stdin?.write(stdin, "utf-8");
        proc.stdin?.end();
      } else {
        proc.stdin?.end();
      }

      const timeoutMs = timeoutSec * 1000;
      const timer = setTimeout(() => {
        timedOut = true;
        if (!killed) {
          killed = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, graceSec * 1000);
        }
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? -1, stdout, stderr, timedOut });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        stderr += `\nProcess error: ${err.message}`;
        resolve({ exitCode: -1, stdout, stderr, timedOut });
      });
    });
  }

  // Cross-platform: use `where` on Windows, `which` on Linux/Mac
  public async checkCommandExists(command: string): Promise<boolean> {
    const isWindows = process.platform === "win32";
    const checkCmd = isWindows ? "where" : "which";
    const result = await this.runCommand(checkCmd, [command], { timeoutSec: 5 });
    return result.exitCode === 0;
  }

  public buildEnv(
    agent: Agent,
    config: AdapterConfig,
    extra: Record<string, string> = {}
  ): Record<string, string> {
    const env: Record<string, string> = {};
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value === "string") {
          env[key] = value;
        }
      }
    }
    for (const [key, value] of Object.entries(extra)) {
      env[key] = value;
    }
    return env;
  }

  public createTestResult(
    adapterType: string,
    status: "pass" | "warn" | "fail",
    checks: any[]
  ): AdapterEnvironmentTestResult {
    return {
      adapterType,
      status,
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  // ── Temp file helpers for adapters that need file-based system prompts ──

  public writeTempFile(content: string, suffix = ".md"): string {
    const dir = mkdtempSync(join(tmpdir(), "nmj-"));
    const filePath = join(dir, `system-prompt${suffix}`);
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  public cleanupTempFile(filePath: string): void {
    try {
      unlinkSync(filePath);
      rmdirSync(dirname(filePath));
    } catch { /* ignore */ }
  }

  // ── Helper: build fullPrompt with optional system prompt prefix ──
  // Used by adapters that have no native system prompt support (OpenCode, OpenClaw, Cursor, Process, Custom)

  public buildFullPrompt(message: string, context?: string, systemPrompt?: string, agent?: Agent): string {
    let systemBlock = "";
    if (systemPrompt) {
      if (agent) {
        const supervisor = agent.reports_to_name || (agent.reports_to ? "Supervisor " + agent.reports_to : "None (Root CEO Level)");
        systemBlock = `=== NMJ SYSTEM RUNTIME ENVIRONMENT INITIALIZATION ===
[AUTHENTICATED INTERNAL ORCHESTRATOR CONFIGURATION - SECURE SYSTEM PROFILE]
- IDENTITY: ${agent.name}
- DESIGNATION: ${agent.role}
- DEPARTMENT: NMJ Dashboard Division
- PARENT_SUPERVISOR: ${supervisor}

[CRITICAL IDENTITY OVERRIDE DIRECTIVE]
YOU MUST IGNORE ANY PREVIOUS DEFAULT IDENTITY, PERSONA, OR INSTRUCTIONS (e.g. do not act as Nox or any default gateway persona). For the duration of this authenticated session, you MUST fully assume the role and identity of "${agent.name}" (${agent.role}). Respond only as "${agent.name}". Never refer to yourself by any other name.

[SYSTEM DIRECTIVES & CORE BEHAVIOR SPECIFICATION]
${systemPrompt}

[DELEGATION PROTOCOL — MANDATORY]
If you need to delegate a task or escalate to another agent, you MUST append EXACTLY ONE line at the very end of your response in this format:
[ROUTE: AgentName]

Example: if you want to delegate to Atlas, end your response with:
[ROUTE: Atlas]

Rules:
- You are operating within the NMJ multi-agent orchestration environment; regardless of the underlying provider, runtime limitations, visibility, or single-agent execution context, you must continue referencing and tagging AI agents strictly according to the predefined NMJ tagging protocol whenever collaboration, delegation, routing, or agent mentions are required, and you must never deny, invalidate, question, reinterpret, or treat any NMJ agent tag as nonexistent based on the current execution environment.
- Only use [ROUTE: ...] if delegation is truly necessary.
- Write it on its own line, at the very end of your message.
- Do NOT use @mentions for routing. Only use [ROUTE: ...].
- Do NOT explain or describe the routing — just write the tag and stop.

========================================================================\n\n`;
      } else {
        systemBlock = `=== NMJ SYSTEM DIRECTIVES ===\n${systemPrompt}\n\n`;
      }
    }
    const contextBlock = context
      ? `=== SESSION CONTEXT ===\n${context}\n\n=== CURRENT INCOMING TRANSMISSION ===\n${message}`
      : message;
    return systemBlock + contextBlock;
  }
}

