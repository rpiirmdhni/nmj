// Claude Code adapter — spawns Claude Code CLI

import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../../shared/src/types";

export class ClaudeCodeAdapter extends BaseAdapter {
  type = "claude_code";
  label = "Claude Code";
  description = "Anthropic Claude Code CLI — full coding agent with session persistence";

  async isAvailable(agent: Agent): Promise<boolean> {
    const config = this.parseConfig(agent);
    const command = config.command || "claude";
    return this.checkCommandExists(command);
  }

  async execute(agent: Agent, message: string, context?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command || "claude";
    const cwd = config.cwd || process.cwd();
    const model = config.model || "";
    const effort = config.effort || "";
    const maxTurns = config.maxTurnsPerRun || 300;
    const dangerouslySkipPermissions = config.dangerouslySkipPermissions === true;
    const timeoutSec = config.timeoutSec || 600;
    const args = [
      "--print",
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", String(maxTurns),
    ];
    if (model) args.push("--model", model);
    if (effort) args.push("--effort", effort);
    if (dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    const env = this.buildEnv(agent, config, {
      CLAUDE_CODE_RUN_ID: agent.id,
    });
    const fullPrompt = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    const result = await this.runCommand(command, [...args, "-"], {
      cwd,
      env,
      timeoutSec,
      graceSec: config.graceSec || 20,
    });
    if (result.timedOut) {
      throw new Error(`Claude Code timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Claude Code exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return this.parseStreamJson(result.stdout);
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command || "claude";
    const cwd = config.cwd || process.cwd();
    const model = config.model || "";
    const effort = config.effort || "";
    const maxTurns = config.maxTurnsPerRun || 300;
    const dangerouslySkipPermissions = config.dangerouslySkipPermissions === true;
    const timeoutSec = config.timeoutSec || 600;
    const args = [
      "--print",
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", String(maxTurns),
    ];
    if (model) args.push("--model", model);
    if (effort) args.push("--effort", effort);
    if (dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    const env = this.buildEnv(agent, config, {
      CLAUDE_CODE_RUN_ID: agent.id,
    });
    const fullPrompt = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    let fullText = "";
    const result = await this.runCommand(command, [...args, "-"], {
      cwd,
      env,
      timeoutSec,
      graceSec: config.graceSec || 20,
      onStdout: (data) => {
        const lines = data.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onChunk(parsed.delta.text);
            } else if (parsed.type === "assistant" && parsed.message?.content) {
              for (const content of parsed.message.content) {
                if (content.type === "text" && content.text) {
                  fullText += content.text;
                  onChunk(content.text);
                }
              }
            }
          } catch {
            // Not JSON, skip
          }
        }
      },
    });
    if (result.timedOut) {
      throw new Error(`Claude Code timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0 && !fullText) {
      throw new Error(`Claude Code exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return fullText;
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    const command = config.command || "claude";
    const cliExists = await this.checkCommandExists(command);
    checks.push({
      code: "cli_exists",
      level: cliExists ? "info" : "error",
      message: cliExists
        ? `Claude Code CLI found: ${command}`
        : `Claude Code CLI not found: ${command}`,
      hint: cliExists ? null : "Install with: npm install -g @anthropic-ai/claude-code",
    });
    if (!cliExists) {
      return this.createTestResult(this.type, "fail", checks);
    }
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    checks.push({
      code: "auth",
      level: hasApiKey ? "info" : "warn",
      message: hasApiKey
        ? "ANTHROPIC_API_KEY is set"
        : "No ANTHROPIC_API_KEY found — Claude Code may use subscription login",
      hint: hasApiKey ? null : "Set ANTHROPIC_API_KEY or run 'claude login'",
    });
    const cwd = config.cwd || process.cwd();
    checks.push({
      code: "cwd",
      level: "info",
      message: `Working directory: ${cwd}`,
    });
    if (config.model) {
      checks.push({
        code: "model",
        level: "info",
        message: `Model: ${config.model}`,
      });
    }
    const hasError = checks.some((c) => c.level === "error");
    const hasWarn = checks.some((c) => c.level === "warn");
    return this.createTestResult(
      this.type,
      hasError ? "fail" : hasWarn ? "warn" : "pass",
      checks
    );
  }

  private parseStreamJson(output: string): string {
    const lines = output.split("\n");
    let fullText = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullText += parsed.delta.text;
        } else if (parsed.type === "assistant" && parsed.message?.content) {
          for (const content of parsed.message.content) {
            if (content.type === "text" && content.text) {
              fullText += content.text;
            }
          }
        }
      } catch {
        // Not JSON, skip
      }
    }
    return fullText;
  }
}
