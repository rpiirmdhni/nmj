# NMJ Dashboard — Agent Contributor Guidelines

This document provides guidance for AI agents and human contributors working on the NMJ Dashboard project.

## First Run

If `node_modules/` is missing, run `npm install` in both root and `backend/` directories.

## Project Structure

- `src/` — Next.js 16 frontend (React 19, Tailwind CSS, shadcn/ui)
- `backend/` — Express backend (WebSocket, SQLite)
- `scripts/` — CLI helper scripts
- `public/` — Static assets

## Frontend (Next.js)

- Use the App Router (`src/app/`)
- Components in `src/components/`
- Utility functions in `src/lib/`
- Always use `"use client"` directive for interactive components
- Use `cn()` from `@/lib/utils` for conditional class names
- Use Lucide React icons
- Use shadcn/ui components from `src/components/ui/`
- Use golden ratio spacing: 4, 8, 13, 21, 34, 55px
- Use golden ratio radius: 6, 10, 16, 26px
- Sidebar: 280px expanded / 68px collapsed

## Backend (Express)

- Entry point: `backend/src/server.ts`
- Database: `backend/src/database.ts` (SQLite via better-sqlite3)
- Orchestrator: `backend/src/orchestrator.ts`
- Types: `backend/src/types.ts`
- Adapters: `backend/src/adapters/` (agent runtime adapters)
- Run with: `cd backend && npx tsx src/server.ts`

## Database

- SQLite database at `backend/data/nmj.db`
- Schema defined in `backend/src/database.ts`
- Seed with: `cd backend && npx tsx src/database.ts`
- Reset with: `nmj db:reset`

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_API_URL` — Backend URL (default: http://localhost:3001)
- `NEXT_PUBLIC_WS_URL` — WebSocket URL (default: ws://localhost:3001)
- `PORT` — Backend port (default: 3001)
- Provider API keys (optional, can be configured via UI)

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
- See `backend/src/orchestrator.ts` for routing logic

## Adding a New Agent Runtime Adapter

1. Create `backend/src/adapters/{type}/` directory
2. Implement the `AgentAdapter` interface (see `backend/src/types.ts`)
3. Register in `backend/src/adapters/index.ts`
4. Add to `AGENT_TYPES` constant

## Testing

- Start services: `nmj start`
- Check health: `curl http://localhost:3001/api/health`
- Test WebSocket: Connect to `ws://localhost:3001`

## Important Notes

- This is Next.js 16 — APIs may differ from older versions
- The backend uses CommonJS (`"type": "commonjs"` in package.json)
- Frontend uses ESM (Next.js default)
- Always use `npx tsx` to run TypeScript files in backend
- SSR guard pattern: `typeof window !== "undefined"` check before document access

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
