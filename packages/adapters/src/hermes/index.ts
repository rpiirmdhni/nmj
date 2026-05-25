// Hermes adapter — spawns Hermes CLI
// System prompt: written as SOUL.md in dedicated NMJ workspace per agent

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BaseAdapter } from "../base";
import { Agent, AdapterEnvironmentTestResult, AdapterConfig } from "../../../shared/src/types";

// NMJ workspace root for agent-specific files
const WORKSPACES_DIR = join(__dirname, "../../../../packages/db/data/workspaces");

export class HermesAdapter extends BaseAdapter {
  type = "hermes";
  label = "Hermes";
  description = "Hermes AI Agent — custom agent runtime via Hermes CLI";

  async isAvailable(agent: Agent): Promise<boolean> {
    const config = this.parseConfig(agent);
    const command = config.command || "hermes";
    return this.checkCommandExists(command);
  }

  private ensureWorkspace(agent: Agent, systemPrompt?: string): string {
    const workspaceDir = join(WORKSPACES_DIR, agent.id);
    mkdirSync(workspaceDir, { recursive: true });
    if (systemPrompt) {
      writeFileSync(join(workspaceDir, "SOUL.md"), systemPrompt, "utf-8");
    }
    return workspaceDir;
  }

  async execute(agent: Agent, message: string, context?: string, systemPrompt?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command || "hermes";
    const timeoutSec = config.timeoutSec || 300;
    const args = ["run"];
    if (config.model) args.push("--model", config.model);
    const env = this.buildEnv(agent, config, { HERMES_RUN_ID: agent.id });

    // Ensure SOUL.md exists in agent workspace
    const workspaceDir = this.ensureWorkspace(agent, systemPrompt);
    const effectiveCwd = config.cwd || workspaceDir;

    const fullPrompt = context
      ? `[Context]\n${context}\n\n[Task]\n${message}`
      : message;
    const result = await this.runCommand(command, [...args, fullPrompt], {
      cwd: effectiveCwd, env, timeoutSec, graceSec: config.graceSec || 20,
    });
    if (result.timedOut) throw new Error(`Hermes timed out after ${timeoutSec}s`);
    if (result.exitCode !== 0) throw new Error(`Hermes exited with code ${result.exitCode}: ${result.stderr}`);
    return result.stdout.trim();
  }

  async executeStreaming(agent: Agent, message: string, context: string | undefined, onChunk: (chunk: string) => void, systemPrompt?: string): Promise<string> {
    const config = this.parseConfig(agent);
    const command = config.command || "hermes";
    const timeoutSec = config.timeoutSec || 300;
    const args = ["run"];
    if (config.model) args.push("--model", config.model);
    const env = this.buildEnv(agent, config, { HERMES_RUN_ID: agent.id });

    const workspaceDir = this.ensureWorkspace(agent, systemPrompt);
    const effectiveCwd = config.cwd || workspaceDir;

    const fullPrompt = context ? `[Context]\n${context}\n\n[Task]\n${message}` : message;
    let fullText = "";
    const result = await this.runCommand(command, [...args, fullPrompt], {
      cwd: effectiveCwd, env, timeoutSec, graceSec: config.graceSec || 20,
      onStdout: (data) => { fullText += data; onChunk(data); },
    });
    if (result.timedOut) throw new Error(`Hermes timed out after ${timeoutSec}s`);
    if (result.exitCode !== 0 && !fullText) throw new Error(`Hermes exited with code ${result.exitCode}: ${result.stderr}`);
    return fullText;
  }

  async testEnvironment(agent: Agent): Promise<AdapterEnvironmentTestResult> {
    const checks: any[] = [];
    const config = this.parseConfig(agent);
    const command = config.command || "hermes";
    const cliExists = await this.checkCommandExists(command);
    checks.push({ code: "cli_exists", level: cliExists ? "info" : "error", message: cliExists ? `Hermes CLI found: ${command}` : `Hermes CLI not found: ${command}`, hint: cliExists ? null : "Install Hermes CLI and ensure it's in PATH" });
    if (!cliExists) return this.createTestResult(this.type, "fail", checks);
    const hasError = checks.some((c) => c.level === "error");
    return this.createTestResult(this.type, hasError ? "fail" : "pass", checks);
  }
}