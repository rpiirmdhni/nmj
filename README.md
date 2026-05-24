# Nineteen Million (AI) Jobs

**Nineteen Million (AI) Jobs** is an open-source AI agent management dashboard. It lets you create, configure, and manage a workforce of AI agents — each with their own role, personality, system prompt, and agent runtime — organized in a structured hierarchy with enforced communication rules.

Inspired by [Paperclip](https://github.com/paperclipai/paperclip).

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Table of Contents

- [Features](#features)
- [Bureaucracy System](#bureaucracy-system)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Agent Runtimes](#agent-runtimes)
- [Environment Configuration](#environment-configuration)
- [REST API Reference](#rest-api-reference)
- [Docker Deployment](#docker-deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Multi-Agent Management** — Create and organize AI agents with custom roles, personalities, avatars, system prompts, and runtime adapters
- **Agent Runtimes** — 10 supported runtimes: Claude Code, Codex, OpenCode, Hermes, OpenClaw, Cursor, Gemini CLI, Process, HTTP, and Custom
- **Real-time Chat** — WebSocket-powered streaming chat interface with typing indicators
- **Inter-Agent Communication** — Agents communicate through a structured org hierarchy with configurable routing rules
- **Organization Chart** — Visual org tree with reporting lines, division grouping, and chain-of-command display
- **Cron Job Scheduler** — Schedule automated tasks per agent using cron expressions with preset shortcuts
- **File Manager** — Organize documents, reports, and assets in a folder structure
- **Agent Memory System** — Persistent per-agent memory (short-term, long-term, commitment, episodic) plus workspace files (MEMORY.md, SOUL.md, etc.)
- **Skills** — Browse and install skills from the skills.sh marketplace
- **Environment Testing** — Test adapter configuration and connectivity before assigning to agents
- **Cron Jobs** — Schedule automated tasks with full node-cron integration
- **Theming** — Dark/light mode with OKLCH color space, golden ratio spacing (φ=1.618), and Plus Jakarta Sans typography

## Bureaucracy System

Nineteen Million (AI) Jobs enforces organizational hierarchy for inter-agent communication:

1. **Same Division** — Agents can chat freely with anyone sharing the same direct manager
2. **Cross-Division** — Requests must route through: sender's division head → CEO Assistant → target division head → target agent
3. **CEO Assistant** — The top-level agent that can communicate with anyone directly and routes all cross-division requests
4. **Founder & CEO (You)** — Above the entire agent hierarchy, can communicate with any agent directly

Example cross-division flow:

```
Backend Dev (Engineering) → Engineering Lead → CTO → CEO Assistant → Design Lead → UI Designer
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Express 5, WebSocket (ws), node-cron |
| Database | SQLite via better-sqlite3 |
| Theming | OKLCH color space, next-themes |
| Fonts | Plus Jakarta Sans |
| Protocol | WebSocket JSON-RPC v3 (OpenClaw) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
git clone https://github.com/rpiirmdhni/nmj.git
cd nmj
npm install
cd server && npm install && cd ..
cp .env.example .env.local
```

### Running

```bash
# Start both frontend (4000) and backend (3001)
npm run dev:all

# Or separately:
cd server && npx tsx src/server.ts  # Backend
npm run dev                        # Frontend (another terminal)
```

Open http://localhost:4000

### CLI Commands

| Command | Description |
|---------|-------------|
| `npm run dev:all` | Start frontend + backend |
| `npm run dev` | Frontend dev server only |
| `npm run build` | Production build |
| `npm run stop` | Stop all services |
| `npm run status` | Service health check |
| `npm run db:seed` | Seed database |
| `npm run db:reset` | Reset + reseed database |

## Project Structure

```
nmj/
├── app/                          # Next.js frontend
│   ├── agents/                   # Agent CRUD, memory, environment test
│   ├── appearance/               # Theme customization
│   ├── chat/                     # WebSocket chat interface
│   ├── config/                   # System configuration
│   ├── cron/                     # Cron job management
│   ├── files/                    # File manager
│   ├── onboarding/               # Setup wizard
│   ├── org/                      # Organization chart
│   ├── skills/                   # Skills marketplace
│   ├── layout.tsx                # Root layout (sidebar, theme, error boundary)
│   ├── page.tsx                  # Home redirect
│   ├── globals.css               # OKLCH theme variables, golden ratio spacing
│   ├── components/
│   │   ├── error-boundary.tsx    # Global error boundary
│   │   ├── sidebar.tsx           # Collapsible navigation
│   │   ├── toast.tsx             # Toast notification system
│   │   ├── theme-provider.tsx    # next-themes provider
│   │   ├── theme-toggle.tsx      # Light/dark/system switcher
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── types.ts              # Frontend-specific type extensions
│       └── utils.ts              # cn() utility
├── server/                       # Express backend
│   └── src/
│       ├── server.ts             # HTTP + WebSocket server, REST API
│       └── providers/            # Legacy provider system
├── packages/
│   ├── shared/                   # Shared types & constants
│   │   └── src/types.ts          # Agent, Session, Message, CronJob, etc.
│   ├── adapters/                 # Agent runtime adapters
│   │   ├── base.ts               # BaseAdapter class (command runner, health check)
│   │   └── [10 runtime adapter implementations]
│   └── db/                       # Database layer
│       ├── db.ts                 # SQLite singleton (WAL mode, FK enabled)
│       ├── database.ts           # Schema + seed data
│       └── orchestrator.ts       # Core business logic, CRUD, scheduling
├── scripts/nmj.sh                # CLI management script
├── docker-compose.yml            # Production Docker config
├── Dockerfile                    # Multi-stage build
├── AGENTS.md                     # AI contributor guidelines
├── ANALYSIS_REPORT.md            # Code audit report
├── CONTRIBUTING.md               # Contribution guidelines
└── .env.example                  # Environment template
```

## Agent Runtimes

Nineteen Million (AI) Jobs supports 10 agent runtime adapters:

| Runtime | Type | Description |
|---------|------|-------------|
| Claude Code | `claude_code` | Anthropic Claude Code CLI |
| Codex | `codex` | OpenAI Codex CLI |
| OpenCode | `opencode` | OpenCode (multi-provider CLI) |
| Gemini CLI | `gemini_cli` | Google Gemini CLI |
| Hermes | `hermes` | Hermes Agent CLI |
| Cursor | `cursor` | Cursor IDE agent |
| OpenClaw | `openclaw` | OpenClaw Gateway (WebSocket JSON-RPC v3) |
| Process | `process` | Run arbitrary shell commands |
| HTTP | `http` | External service webhook |
| Custom | `custom` | User-defined agent implementation |

Each adapter implements the `AgentAdapter` interface with `execute()`, `executeStreaming()`, `testEnvironment()`, and `healthCheck()` methods.

## Environment Configuration

Copy `.env.example` to `.env.local`:

```env
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Backend
PORT=3001

# Gateway
OPENCLAW_GATEWAY_TOKEN=
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
```

## REST API Reference

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent by ID |
| POST | `/api/agents` | Create agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| GET | `/api/org` | Get organization tree |
| GET | `/api/adapters` | List adapter metadata |
| POST | `/api/agents/:id/test-environment` | Test adapter environment |

### Agent Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/:id/memories` | List memories (filter by `?type=`) |
| POST | `/api/agents/:id/memories` | Create memory |
| GET | `/api/agents/:id/files` | List workspace files |
| GET | `/api/agents/:id/files/:name` | Get file content |
| PUT | `/api/agents/:id/files/:name` | Upsert file content |

### Cron Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cron` | List all cron jobs |
| POST | `/api/cron` | Create cron job |
| PUT | `/api/cron/:id` | Update cron job |
| DELETE | `/api/cron/:id` | Delete cron job |

### Files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files` | List files/folders |
| POST | `/api/files` | Create file or folder |
| DELETE | `/api/files/:id` | Delete file/folder |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions/:agentId/messages` | Get session message history |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills/proxy` | CORS proxy for fetching skill files from GitHub |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings/:key` | Set a setting value |

## Docker Deployment

```bash
docker-compose up -d
```

The Dockerfile uses a multi-stage build:
1. **deps** — Installs all dependencies
2. **builder** — Compiles Next.js frontend
3. **runner** — Production image with frontend + backend

Ports:
- `4000` — Next.js frontend
- `3001` — Express backend + WebSocket

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](./AGENTS.md) for AI contributor guidance.

## License

MIT License

Copyright (c) 2026 Rafie Restu Ramadhani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
