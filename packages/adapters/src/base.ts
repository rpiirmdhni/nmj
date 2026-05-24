// Base adapter class with common functionality

import { spawn, ChildProcess } from "child_process";
import { Agent, AgentAdapter, AdapterEnvironmentTestResult, AdapterConfig, AgentAdapterType } from "@nmj/shared/types";

export class BaseAdapter implements AgentAdapter {
  type: string = "custom";
  label = "Base";
  description = "Base adapter";

  async execute(agent: Agent, message: string, context?: string): Promise<string> {
    throw new Error("execute() not implemented");
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
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

  public async checkCommandExists(command: string): Promise<boolean> {
    const result = await this.runCommand("which", [command], { timeoutSec: 5 });
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
}
