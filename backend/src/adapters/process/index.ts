// Process adapter — executes arbitrary shell command

import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../types";

export class ProcessAdapter extends BaseAdapter {
  type = "process";
  label = "Process";
  description = "Execute arbitrary shell commands — for custom scripts and tools";

  async isAvailable(_agent: Agent): Promise<boolean> {
    return true;
  }

  async execute(agent: Agent, message: string, context?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command;
    if (!command) throw new Error("Process adapter requires a 'command' in adapter config");
    const cwd = config.cwd || process.cwd();
    const timeoutSec = config.timeoutSec || 120;
    const args = config.extraArgs || [];
    const env = this.buildEnv(agent, config);
    const fullPrompt = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    const result = await this.runCommand(command, [...args, fullPrompt], {
      cwd,
      env,
      timeoutSec,
      graceSec: config.graceSec || 10,
    });
    if (result.timedOut) {
      throw new Error(`Process timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Process exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command;
    if (!command) throw new Error("Process adapter requires a 'command' in adapter config");
    const cwd = config.cwd || process.cwd();
    const timeoutSec = config.timeoutSec || 120;
    const args = config.extraArgs || [];
    const env = this.buildEnv(agent, config);
    const fullPrompt = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    let fullText = "";
    const result = await this.runCommand(command, [...args, fullPrompt], {
      cwd,
      env,
      timeoutSec,
      graceSec: config.graceSec || 10,
      onStdout: (data) => {
        fullText += data;
        onChunk(data);
      },
    });
    if (result.timedOut) {
      throw new Error(`Process timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0 && !fullText) {
      throw new Error(`Process exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return fullText;
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    const command = config.command;
    if (!command) {
      checks.push({
        code: "command_missing",
        level: "error",
        message: "No command configured",
        hint: "Set 'command' in adapter config (e.g., 'bash', 'python', 'node')",
      });
      return this.createTestResult(this.type, "fail", checks);
    }
    const cmdExists = await this.checkCommandExists(command);
    checks.push({
      code: "command_exists",
      level: cmdExists ? "info" : "error",
      message: cmdExists
        ? `Command found: ${command}`
        : `Command not found: ${command}`,
      hint: cmdExists ? null : `Ensure '${command}' is installed and in PATH`,
    });
    if (config.cwd) {
      checks.push({
        code: "cwd",
        level: "info",
        message: `Working directory: ${config.cwd}`,
      });
    }
    const hasError = checks.some((c) => c.level === "error");
    return this.createTestResult(this.type, hasError ? "fail" : "pass", checks);
  }
}
