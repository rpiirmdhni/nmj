#!/usr/bin/env node
// nmj — Nineteen Million (AI) Jobs CLI
// Cross-platform start, stop, and manage the NMJ Dashboard
// Compatible with: Linux, macOS, Windows

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { request } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "..");
const SERVER_DIR = resolve(PROJECT_DIR, "server");
const DB_DIR = resolve(PROJECT_DIR, "packages", "db");

// ── Colors (cross-platform ANSI, supported on Win10+, macOS, Linux) ──────────
const C = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const log = (msg) => console.log(`${C.blue}[nmj]${C.reset} ${msg}`);
const ok  = (msg) => console.log(`${C.green}[nmj]${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}[nmj]${C.reset} ${msg}`);
const err  = (msg) => console.error(`${C.red}[nmj]${C.reset} ${msg}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Spawn a child process — cross-platform.
 *
 * Problem: On Windows, `spawn(cmd, args, { shell: true })` concatenates
 * cmd + args into a single shell command string. If any arg contains spaces
 * (e.g. a path like "C:\Users\A WEB GATAU\..."), the shell splits on them
 * and the path gets truncated. Node.js v24 also emits a DeprecationWarning
 * when args are passed alongside shell:true.
 *
 * Fix: Build the full command string ourselves, quoting any token that
 * contains whitespace, then pass it as the sole command with an empty args
 * array. This avoids both issues.
 */
function spawnService(cmd, args, cwd, opts = {}) {
  // Quote tokens that contain whitespace so the shell doesn't split them.
  const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
  const fullCmd = [cmd, ...args].map(quote).join(" ");

  return spawn(fullCmd, {
    cwd,
    stdio: opts.stdio ?? "inherit",
    shell: true,
  });
}

/** Kill all processes listening on a port (cross-platform via kill-port pkg) */
async function killPort(port) {
  return new Promise((res) => {
    const proc = spawnService("npx", ["kill-port", String(port)], PROJECT_DIR, {
      stdio: "ignore",
    });
    proc.on("close", res);
    // Safety timeout — port may already be free
    setTimeout(res, 3000);
  });
}

/** HTTP health check — returns true if the endpoint responds */
function healthCheck(url) {
  return new Promise((res) => {
    try {
      const req = request(url, { timeout: 2000 }, (r) => {
        res(r.statusCode >= 200 && r.statusCode < 500);
      });
      req.on("error", () => res(false));
      req.on("timeout", () => { req.destroy(); res(false); });
      req.end();
    } catch {
      res(false);
    }
  });
}

/** Wait for a service to become healthy, up to maxSeconds */
async function waitForHealth(url, maxSeconds = 30) {
  for (let i = 0; i < maxSeconds; i++) {
    if (await healthCheck(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Cross-platform confirmation prompt */
function confirm(question) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${C.yellow}[nmj]${C.reset} ${question} [y/N] `, (answer) => {
      rl.close();
      res(answer.toLowerCase() === "y");
    });
  });
}

/** Run a command and resolve with its exit code */
function runAndWait(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const proc = spawnService(cmd, args, cwd);
    proc.on("close", (code) => res(code));
    proc.on("error", rej);
  });
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function checkDeps() {
  // Root node_modules
  if (!existsSync(resolve(PROJECT_DIR, "node_modules"))) {
    warn("Root dependencies not found. Installing...");
    await runAndWait("npm", ["install"], PROJECT_DIR);
  }

  // Server node_modules
  if (!existsSync(resolve(SERVER_DIR, "node_modules"))) {
    warn("Server dependencies not found. Installing...");
    await runAndWait("npm", ["install"], SERVER_DIR);
  }

  // Ensure DB data directory exists
  const dbDataDir = resolve(DB_DIR, "data");
  if (!existsSync(dbDataDir)) mkdirSync(dbDataDir, { recursive: true });

  // Always run the seed — database.ts is fully idempotent:
  //   CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE
  // This handles fresh installs, empty DB files, and schema migrations safely.
  // Run from DB_DIR with a relative path to avoid passing absolute paths
  // with spaces as shell arguments (breaks on Windows).
  log("Initializing database...");
  const code = await runAndWait("npx", ["tsx", "src/database.ts"], DB_DIR);
  if (code !== 0) {
    err("Database initialization failed. Cannot start services.");
    process.exit(1);
  }
}


async function cmdStart() {
  await checkDeps();

  log("Clearing ports 3001 and 4000...");
  await Promise.all([killPort(3001), killPort(4000)]);

  console.log("");
  log("Starting Nineteen Million (AI) Jobs...");
  console.log("");

  // Start backend
  log("Starting backend on port 3001...");
  const backend = spawnService("npx", ["tsx", "src/server.ts"], SERVER_DIR);

  // Wait for backend to be healthy before starting frontend
  const backendReady = await waitForHealth("http://localhost:3001/api/health");
  if (backendReady) {
    ok("Backend ready!");
  } else {
    warn("Backend health check timed out — it may still be starting.");
  }

  // Start frontend
  log("Starting frontend on port 4000...");
  const frontend = spawnService("npm", ["run", "dev"], PROJECT_DIR);

  console.log("");
  ok("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  ok("  Nineteen Million (AI) Jobs is running!");
  ok("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  ok("  Frontend:  http://localhost:4000");
  ok("  Backend:   http://localhost:3001");
  ok("  WebSocket: ws://localhost:3001");
  ok("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  warn("Press Ctrl+C to stop all services");
  console.log("");

  // Graceful shutdown on Ctrl+C
  const shutdown = () => {
    log("Shutting down...");
    try { backend.kill(); } catch {}
    try { frontend.kill(); } catch {}
    ok("Stopped.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

async function cmdStop() {
  log("Stopping all services...");
  await Promise.all([killPort(3001), killPort(4000)]);
  ok("Stopped all services.");
}

async function cmdStatus() {
  console.log("");
  const [backendUp, frontendUp] = await Promise.all([
    healthCheck("http://localhost:3001/api/health"),
    healthCheck("http://localhost:4000"),
  ]);
  console.log(
    backendUp
      ? `${C.green}[nmj]${C.reset} Backend:  ✅ Running (port 3001)`
      : `${C.red}[nmj]${C.reset} Backend:  ❌ Not running`
  );
  console.log(
    frontendUp
      ? `${C.green}[nmj]${C.reset} Frontend: ✅ Running (port 4000)`
      : `${C.red}[nmj]${C.reset} Frontend: ❌ Not running`
  );
  console.log("");
}

async function cmdDbSeed() {
  log("Seeding database...");
  // Run from DB_DIR with relative path — safe on all platforms (no space issues)
  const code = await runAndWait("npx", ["tsx", "src/database.ts"], DB_DIR);
  if (code !== 0) {
    err("Seeding failed.");
    process.exit(1);
  }
  ok("Database seeded!");
}

async function cmdDbReset() {
  const confirmed = await confirm("This will delete all data. Continue?");
  if (!confirmed) {
    log("Cancelled.");
    return;
  }

  const { unlinkSync } = await import("node:fs");
  const dbDataDir = resolve(DB_DIR, "data");
  for (const ext of ["", "-shm", "-wal"]) {
    const f = resolve(dbDataDir, `nmj.db${ext}`);
    if (existsSync(f)) unlinkSync(f);
  }

  await cmdDbSeed();
  ok("Database reset and seeded!");
}

function printHelp() {
  console.log("");
  console.log("  nmj — Nineteen Million (AI) Jobs");
  console.log("");
  console.log("  Usage: node scripts/nmj.mjs <command>");
  console.log("      or: npm run <command>");
  console.log("");
  console.log("  Commands:");
  console.log("    start      Start frontend + backend (default)");
  console.log("    stop       Stop all services");
  console.log("    restart    Restart all services");
  console.log("    status     Check service status");
  console.log("    db:seed    Seed database with default data");
  console.log("    db:reset   Reset and reseed database");
  console.log("");
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const action = process.argv[2] ?? "start";

switch (action) {
  case "start":
    await cmdStart();
    break;
  case "stop":
    await cmdStop();
    break;
  case "restart":
    await cmdStop();
    await new Promise((r) => setTimeout(r, 1500));
    await cmdStart();
    break;
  case "status":
    await cmdStatus();
    break;
  case "db:seed":
    await cmdDbSeed();
    break;
  case "db:reset":
    await cmdDbReset();
    break;
  default:
    err(`Unknown command: "${action}"`);
    printHelp();
    process.exit(1);
}
