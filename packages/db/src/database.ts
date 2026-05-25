import Database from "better-sqlite3";
import { join } from "path";
import db from "./db";

// Re-export the shared instance so seed script uses the same connection
export { db };

db.exec(`
  -- Agent configuration
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'bg-gray-500/10 text-gray-500',
    tag_color TEXT NOT NULL DEFAULT 'bg-gray-500/15 text-gray-600 border-gray-500/30',
    adapter_type TEXT NOT NULL DEFAULT 'custom' CHECK(adapter_type IN ('claude_code', 'codex', 'opencode', 'gemini_cli', 'hermes', 'cursor', 'openclaw', 'process', 'http', 'custom')),
    adapter_config TEXT NOT NULL DEFAULT '{}',
    system_prompt TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    -- Org hierarchy (null = top-level, i.e. CEO Assistant)
    reports_to TEXT,
    -- Legacy fields (kept for backward compat)
    model TEXT NOT NULL DEFAULT 'gpt-4o',
    provider TEXT NOT NULL DEFAULT 'openai',
    provider_config_id TEXT,
    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reports_to) REFERENCES agents(id) ON DELETE SET NULL
  );

  -- Agent sessions (active conversations)
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'idle', 'closed', 'error')),
    context TEXT,
    session_params TEXT,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  -- Chat messages
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    agent_id TEXT,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'agent', 'system')),
    sender_name TEXT,
    content TEXT NOT NULL,
    tagged_agent_ids TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );

  -- Inter-agent communication logs
  CREATE TABLE IF NOT EXISTS inter_agent_logs (
    id TEXT PRIMARY KEY,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    session_id TEXT,
    message TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (from_agent_id) REFERENCES agents(id),
    FOREIGN KEY (to_agent_id) REFERENCES agents(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );

  -- Cron jobs
  CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    schedule TEXT NOT NULL,
    prompt TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  -- File manager
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('folder', 'file')),
    mime_type TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    parent_id TEXT,
    uploaded_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE
  );

  -- Settings / config
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Provider configurations (legacy, kept for backward compat)
  CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('openai', 'anthropic', 'openrouter', 'ollama', 'gemini', 'deepseek', 'groq', 'mistral', 'together', 'fireworks', 'perplexity', 'nvidia', 'xai', 'custom')),
    base_url TEXT,
    api_key TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Agent memory system
  CREATE TABLE IF NOT EXISTS agent_memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('short_term', 'long_term', 'commitment', 'episodic')),
    content TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5 CHECK(importance >= 0 AND importance <= 1),
    tags TEXT,
    source TEXT NOT NULL DEFAULT 'auto' CHECK(source IN ('auto', 'manual', 'file')),
    session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );

  -- Agent workspace files (MEMORY.md, SOUL.md, etc.)
  CREATE TABLE IF NOT EXISTS agent_files (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    UNIQUE(agent_id, name)
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_inter_agent_from ON inter_agent_logs(from_agent_id);
  CREATE INDEX IF NOT EXISTS idx_inter_agent_to ON inter_agent_logs(to_agent_id);
  CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
  CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent ON cron_jobs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON agent_memories(agent_id);
  CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(type);
  CREATE INDEX IF NOT EXISTS idx_memories_importance ON agent_memories(importance);
  CREATE INDEX IF NOT EXISTS idx_memories_created ON agent_memories(created_at);
  CREATE INDEX IF NOT EXISTS idx_agent_files_agent ON agent_files(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to);
`);

// ── Seed Data ────────────────────────────────────────────────
// No agents seeded — fresh install goes through onboarding flow.
// Users create their first agent (CEO Assistant) via /onboarding.

// Seed default settings
const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)
`);

insertSetting.run({ key: "gateway_url", value: "ws://127.0.0.1:4001" });
insertSetting.run({ key: "gateway_token", value: "" });
insertSetting.run({ key: "max_active_sessions", value: "10" });
insertSetting.run({ key: "session_idle_timeout_minutes", value: "30" });

// Seed file manager root folders
const insertFile = db.prepare(`
  INSERT OR IGNORE INTO files (id, name, type, path) VALUES (@id, @name, @type, @path)
`);

insertFile.run({ id: "root-reports", name: "reports", type: "folder", path: "/reports" });
insertFile.run({ id: "root-contracts", name: "contracts", type: "folder", path: "/contracts" });
insertFile.run({ id: "root-releases", name: "releases", type: "folder", path: "/releases" });
insertFile.run({ id: "root-marketing", name: "marketing-assets", type: "folder", path: "/marketing-assets" });

console.log("✅ Database seeded successfully");
console.log(`   Agents: 0 (create your first agent via onboarding)`);
console.log(`   Settings: 4`);
console.log(`   Root folders: 4`);

// NOTE: Intentionally NOT calling db.close() here.
// The Orchestrator uses the same shared db instance.
// Closing here would cause "database is closed" errors at runtime.
