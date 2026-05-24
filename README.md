# NMJ Dashboard — AI Agent Management Dashboard

Nineteen Million (AI) Jobs (NMJ) is an open-source dashboard for creating, configuring, and managing AI agents — each with their own role, personality, system prompt, and AI agent runtime.

Inspired by [Paperclip](https://github.com/paperclipai/paperclip), NMJ brings the concept of AI agent bureaucracy to a simple, self-hosted dashboard.

## Features

- **Multi-Agent Management** — Create and manage AI agents with custom roles, personalities, and system prompts
- **Multi-Provider AI Agent Runtimes** — Connect agents to Claude Code, Codex, OpenCode, Hermes, OpenClaw, Cursor, Gemini CLI, or any custom agent runtime
- **Real-time Chat** — WebSocket-powered streaming chat interface
- **Inter-Agent Communication** — Agents communicate through a structured org hierarchy with bureaucratic routing
- **Org Chart & Bureaucracy** — Visual org chart with reporting lines; same-division agents chat freely, cross-division requests route through division heads
- **Onboarding Wizard** — Step-by-step setup for first-time users
- **Cron Jobs** — Schedule automated tasks for agents (scheduler integration pending)
- **File Manager** — Organize documents, reports, and assets
- **Agent Memory** — Memory system with MEMORY.md + SOUL.md per agent
- **Skills** — Browse and install skills from skills.sh marketplace
- **Environment Testing** — Test adapter configuration before running agents
- **Dark Mode** — Full dark/light theme support with 7 color presets
- **Golden Ratio UI** — Spacing and radius based on φ=1.618

## Bureaucracy Rules

NMJ enforces organizational hierarchy for inter-agent communication:

1. **Same Division** — Agents can chat freely with anyone in their division (same manager)
2. **Cross-Division** — Requests must go through: sender's division head → CEO Assistant → target division head → target agent
3. **CEO Assistant** — Top-level agent that can communicate with anyone and routes cross-division requests
4. **Founder & CEO (You)** — Above all agents, can communicate with anyone directly

Example flow:
```
Backend Dev (Engineering) wants help from UI Designer (Design):
  Backend Dev → Engineering Lead → CTO → CEO Assistant → Design Lead → UI Designer
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Backend:** Express 5, WebSocket (ws), SQLite (better-sqlite3)
- **Theme:** OKLCH color space, next-themes
- **Font:** Plus Jakarta Sans

## Quick Start

```bash
npm install
cd backend && npm install && cd ..
cp .env.example .env.local

# Start backend (port 3001)
npm run backend

# Start frontend (port 4000) — in another terminal
npm run dev

# Or start both with:
npm run dev:all
```

Open http://localhost:4000

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server (port 4000) |
| `npm run backend` | Start backend server (port 3001) |
| `npm run dev:all` | Start frontend + backend |
| `npm run build` | Build frontend for production |
| `npm run start` | Start production frontend |
| `npm run lint` | Run linter |
| `npm run stop` | Stop all services |
| `npm run status` | Check service status |

## Project Structure

```
nmj-dashboard/
├── src/                    # Next.js frontend
│   ├── app/               # App router pages
│   │   ├── agents/        # Agent management + memory + env test
│   │   ├── chat/          # Chat interface with WebSocket
│   │   ├── cron/          # Cron job management
│   │   ├── files/         # File manager
│   │   ├── config/        # Provider configuration
│   │   ├── org/           # Organization chart
│   │   ├── skills/        # Skills marketplace
│   │   ├── appearance/    # Theme customization
│   │   ├── onboarding/    # Setup wizard
│   │   ├── layout.tsx     # Root layout
│   │   ├── page.tsx       # Home redirect
│   │   └── globals.css    # Global styles + theme variables
│   ├── components/        # Shared components
│   │   ├── sidebar.tsx    # Navigation sidebar
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   └── toast.tsx      # Toast notification system
│   ├── components/ui/     # shadcn/ui components
│   └── lib/               # Utilities (cn function)
├── backend/               # Express backend
│   ├── src/
│   │   ├── adapters/      # Agent runtime adapters (10 types)
│   │   │   ├── claude-code/
│   │   │   ├── codex/
│   │   │   ├── opencode/
│   │   │   ├── gemini-cli/
│   │   │   ├── hermes/
│   │   │   ├── cursor/
│   │   │   ├── openclaw/
│   │   │   ├── process/
│   │   │   ├── http/
│   │   │   ├── custom/
│   │   │   ├── base.ts
│   │   │   └── index.ts
│   │   ├── providers/     # Legacy provider system
│   │   ├── database.ts    # SQLite schema + seeds
│   │   ├── orchestrator.ts # Core orchestration + CRUD
│   │   ├── server.ts      # Express + WebSocket server
│   │   └── types.ts       # TypeScript types
│   └── data/              # SQLite database
├── scripts/               # CLI scripts
├── public/                # Static assets
├── AGENTS.md              # AI contributor guidelines
├── ANALYSIS_REPORT.md     # Code analysis report
├── CHANGELOG.md           # Version history
├── CONTRIBUTING.md        # Contribution guidelines
├── docker-compose.yml     # Docker Compose
├── .env.example           # Environment template
└── package.json           # Root package config
```

## Agent Runtimes

NMJ supports multiple AI agent runtimes:

| Runtime | Type | Description |
|---------|------|-------------|
| Claude Code | `claude_code` | Anthropic Claude Code CLI |
| Codex | `codex` | OpenAI Codex CLI |
| OpenCode | `opencode` | OpenCode CLI (multi-provider) |
| Hermes | `hermes` | Hermes Agent CLI |
| OpenClaw | `openclaw` | OpenClaw Gateway (WebSocket JSON-RPC v3) |
| Cursor | `cursor` | Cursor IDE agent |
| Gemini CLI | `gemini_cli` | Google Gemini CLI |
| Process | `process` | Run shell commands |
| HTTP | `http` | External webhook |
| Custom | `custom` | User-defined agent |

## Environment Variables

Copy `.env.example` to `.env.local`:

```env
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Backend
PORT=3001

# AI Provider API Keys (optional — can also configure via UI)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Database
DATABASE_PATH=./data/nmj.db
```

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent by ID |
| POST | `/api/agents` | Create agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| GET | `/api/org` | Get org tree |
| GET | `/api/adapters` | List adapter metadata |
| POST | `/api/agents/:id/test-environment` | Test adapter environment |
| GET | `/api/sessions/:agentId/messages` | Get session messages |
| GET | `/api/cron` | List cron jobs |
| POST | `/api/cron` | Create cron job |
| PUT | `/api/cron/:id` | Update cron job |
| DELETE | `/api/cron/:id` | Delete cron job |
| GET | `/api/files` | List files |
| POST | `/api/files` | Create file/folder |
| DELETE | `/api/files/:id` | Delete file |
| GET | `/api/providers` | List provider configs |
| POST | `/api/providers` | Create provider config |
| PUT | `/api/providers/:id` | Update provider config |
| DELETE | `/api/providers/:id` | Delete provider config |
| POST | `/api/providers/:id/test` | Test provider connection |
| GET | `/api/agents/:agentId/memories` | Get agent memories |
| POST | `/api/agents/:agentId/memories` | Create agent memory |
| GET | `/api/agents/:agentId/files` | Get agent workspace files |
| GET | `/api/agents/:agentId/files/:name` | Get specific file |
| PUT | `/api/agents/:agentId/files/:name` | Update agent file |

## Known Issues

See [ANALYSIS_REPORT.md](./ANALYSIS_REPORT.md) for full code analysis.

Quick summary:
- 3 critical issues (Config save, File upload, Skills install — non-functional)
- 5 high issues (Cron scheduler missing, WS reconnection, typing indicator bug)
- 8 medium issues (duplicate types, DB connections, error handling)
- 10 low issues (security defaults, TS strict, unused imports)
