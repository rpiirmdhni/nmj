// Custom adapter — fallback for user-defined agent type

import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../types";

export class CustomAdapter extends BaseAdapter {
  type = "custom";
  label = "Custom";
  description = "Custom agent adapter — configure your own command or script";

  async isAvailable(agent: Agent): Promise<boolean> {
    const config = this.parseConfig(agent);
    if (config.command) {
      return this.checkCommandExists(config.command);
    }
    if (config.url) {
      try {
        const res = await fetch(config.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        return res.ok || res.status < 500;
      } catch {
        return false;
      }
    }
    return false;
  }

  async execute(agent: Agent, message: string, context?: string): Promise<string> {
    const config = this.parseConfig(agent);
    if (config.url) {
      return this.executeHttp(agent, message, context, config);
    }
    return this.executeProcess(agent, message, context, config);
  }

  async executeStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const config = this.parseConfig(agent);
    if (config.url) {
      return this.executeHttpStreaming(agent, message, context, config, onChunk);
    }
    return this.executeProcessStreaming(agent, message, context, config, onChunk);
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    if (!config.command && !config.url) {
      checks.push({
        code: "config_missing",
        level: "error",
        message: "Neither 'command' nor 'url' is configured",
        hint: "Set 'command' for process mode or 'url' for HTTP mode",
      });
      return this.createTestResult(this.type, "fail", checks);
    }
    if (config.command) {
      const cmdExists = await this.checkCommandExists(config.command);
      checks.push({
        code: "command_exists",
        level: cmdExists ? "info" : "error",
        message: cmdExists
          ? `Command found: ${config.command}`
          : `Command not found: ${config.command}`,
      });
    }
    if (config.url) {
      checks.push({
        code: "url",
        level: "info",
        message: `URL: ${config.url}`,
      });
    }
    const hasError = checks.some((c) => c.level === "error");
    return this.createTestResult(this.type, hasError ? "fail" : "pass", checks);
  }

  private async executeHttp(
    agent: Agent,
    message: string,
    context: string | undefined,
    config: AdapterConfig
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };
    if (config.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    }
    const res = await fetch(config.url!, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: context
          ? `[Context]\n${context}\n\n[Task]\n${message}`
          : message,
        agentId: agent.id,
      }),
      signal: AbortSignal.timeout((config.timeoutSec || 120) * 1000),
    });
    if (!res.ok) {
      throw new Error(`Custom HTTP error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as Record<string, unknown>;
    return (data.response as string) || (data.content as string) || "";
  }

  private async executeHttpStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    config: AdapterConfig,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };
    if (config.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    }
    const res = await fetch(config.url!, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: context
          ? `[Context]\n${context}\n\n[Task]\n${message}`
          : message,
        agentId: agent.id,
        stream: true,
      }),
      signal: AbortSignal.timeout((config.timeoutSec || 120) * 1000),
    });
    if (!res.ok) {
      throw new Error(`Custom HTTP error ${res.status}: ${await res.text()}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || parsed.delta || parsed.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch { /* skip */ }
      }
    }
    return fullText;
  }

  private async executeProcess(
    agent: Agent,
    message: string,
    context: string | undefined,
    config: AdapterConfig
  ): Promise<string> {
    const command = config.command;
    if (!command) throw new Error("No command configured");
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
      throw new Error(`Custom process timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Custom process exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private async executeProcessStreaming(
    agent: Agent,
    message: string,
    context: string | undefined,
    config: AdapterConfig,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const command = config.command;
    if (!command) throw new Error("No command configured");
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
      throw new Error(`Custom process timed out after ${timeoutSec}s`);
    }
    if (result.exitCode !== 0 && !fullText) {
      throw new Error(`Custom process exited with code ${result.exitCode}: ${result.stderr}`);
    }
    return fullText;
  }
}
