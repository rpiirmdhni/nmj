# NMJ Dashboard — Agent Contributor Guidelines

This document provides guidance for AI agents and human contributors working on the NMJ Dashboard project.

## First Run

If `node_modules/` is missing, run `npm install` in both root and `server/` directories.

```bash
npm install          # root (Next.js frontend)
cd server && npm install  # Express backend
```

## Project Structure

```
nmj/
├── app/             — Next.js 16 App Router pages & components
├── server/          — Express backend (WebSocket, SQLite)
├── packages/
│   ├── db/          — SQLite schema & seed (better-sqlite3)
│   ├── adapters/    — Agent runtime adapter packages
│   └── shared/      — Shared types & utilities
├── scripts/
│   └── nmj.mjs     — Cross-platform CLI (Linux / Windows / macOS)
└── public/          — Static assets
```

## Frontend (Next.js)

- Use the App Router (`app/`)
- Components in `app/components/`
- Utility functions in `app/lib/`
- Always use `"use client"` directive for interactive components
- Use `cn()` from `@/lib/utils` for conditional class names
- Use Lucide React icons
- Use shadcn/ui components from `app/components/ui/`
- Use golden ratio spacing: 4, 8, 13, 21, 34, 55px
- Use golden ratio radius: 6, 10, 16, 26px
- Sidebar: 280px expanded / 68px collapsed

## Backend (Express)

- Entry point: `server/src/server.ts`
- Database: `packages/db/src/database.ts` (SQLite via better-sqlite3)
- Orchestrator: `packages/db/src/orchestrator.ts`
- Adapters: `packages/adapters/src/` (agent runtime adapters)
- Run with: `npm run server` (cross-platform)

## Database

- SQLite database at `packages/db/data/nmj.db`
- Schema defined in `packages/db/src/database.ts`
- Seed with: `npm run db:seed`
- Reset with: `npm run db:reset`

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_API_URL` — Backend URL (default: http://localhost:3001)
- `NEXT_PUBLIC_WS_URL` — WebSocket URL (default: ws://localhost:3001)
- `PORT` — Backend port (default: 3001)
- Provider API keys (optional, can be configured via UI)

## Running the Project

All commands work on **Linux, macOS, and Windows** — no bash required.

```bash
npm run dev        # Frontend only (Next.js, port 4000)
npm run server     # Backend only (Express, port 3001)
npm run dev:all    # Both frontend + backend (recommended)
npm run stop       # Stop all services
npm run status     # Check if services are running
npm run restart    # Restart all services
```

> The CLI is implemented in `scripts/nmj.mjs` (Node.js ESM) for full cross-platform compatibility.

## Key Conventions

- Agent IDs are lowercase, URL-safe strings (e.g., `luna`, `atlas`)
- Agent adapter types: `claude_code`, `codex`, `opencode`, `gemini_cli`, `hermes`, `cursor`, `openclaw`, `process`, `http`, `custom`
- Agent status: `active`, `paused`, `idle`, `running`, `error`, `terminated`
- Session status: `active`, `idle`, `closed`, `error`
- Message sender_type: `user`, `agent`, `system`

## Inter-Agent Communication

Agents communicate through org hierarchy:
- `reports_to` field defines the org tree
- Agents can only directly message their direct manager
- Cross-division requests route up to common manager, then down
- See `packages/db/src/orchestrator.ts` for routing logic

## Adding a New Agent Runtime Adapter

1. Create `packages/adapters/src/{type}/` directory
2. Implement the `AgentAdapter` interface (see `packages/shared/src/types.ts`)
3. Register in `packages/adapters/src/index.ts`
4. Add to `AGENT_TYPES` constant

## Testing

- Start services: `npm run dev:all`
- Check health: `curl http://localhost:3001/api/health`
- Check status: `npm run status`
- Test WebSocket: Connect to `ws://localhost:3001`

## Important Notes

- This is Next.js 16 — APIs may differ from older versions
- The backend uses CommonJS (`"type": "commonjs"` in `server/package.json`)
- Frontend uses ESM (Next.js default)
- Always use `npx tsx` to run TypeScript files in backend
- SSR guard pattern: `typeof window !== "undefined"` check before document access
- The CLI (`scripts/nmj.mjs`) is pure Node.js ESM — **do not use bash-specific syntax**

## Known Issues (from code analysis)

### Critical
- **Config "Save All"** — Button is visual-only, doesn't actually save
- **File Upload** — Upload button has no handler or file input
- **Skills Install** — Simulated with setTimeout, no real integration

### High
- **Cron Scheduler** — No actual scheduler library running (CRUD only)
- **WebSocket** — No reconnection logic
- **Typing Indicator** — Uses wrong sessionId for inter-agent messages

### Medium
- **Duplicate Types** — Agent/Message interfaces duplicated across frontend pages
- **DB Connections** — Two separate SQLite connections (database.ts + orchestrator.ts)
- **No Error Boundaries** — Missing React error boundaries

See `ANALYSIS_REPORT.md` for full details.
