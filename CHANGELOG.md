# Changelog

All notable changes to NMJ Dashboard will be documented in this file.

## [Unreleased]

### Added
- Code analysis report (`ANALYSIS_REPORT.md`) — 26 issues documented
- Golden ratio UI system applied to all pages (spacing: 4,8,13,21,34,55px, radius: 6,10,16,26px)

### Known Issues (from analysis)
- Config "Save All" button is non-functional (visual only)
- File upload button has no handler
- Skills install is simulated (no real integration)
- Cron jobs have no actual scheduler running
- WebSocket has no reconnection logic
- Duplicate TypeScript types across frontend pages

## [0.2.0] - 2026-05-20

### Added
- Multi-provider AI agent runtime system (Claude Code, Codex, OpenCode, Hermes, OpenClaw, Cursor, Gemini CLI, Process, HTTP, Custom)
- Org chart with hierarchical reporting structure (`reports_to`)
- Bureaucratic inter-agent communication routing
- Agent adapter system (`backend/src/adapters/`)
- Agent memory system (`agent_memories` + `agent_files`)
- Agent workspace files (MEMORY.md, SOUL.md per agent)
- File manager for organizing documents and assets
- Cron job scheduling for agents (CRUD only)
- Skills page with popular skills from skills.sh
- Dark/light theme support with 7 color presets
- WebSocket-powered real-time chat
- REST API for agent, session, cron, file, and settings management
- Environment test endpoint for adapter validation

### Changed
- Migrated from multi-provider AI model to multi-provider AI agent runtime architecture
- Updated database schema to support agent types, org hierarchy, and adapter configs
- Reorganized project structure for open-source readiness

### Bugs Fixed (5 total)
- BUG-1: OpenClaw adapter WebSocket protocol (rewrote to proper JSON-RPC v3)
- BUG-2: Cron job SQL parameter mismatch
- BUG-3: FK constraint error handling on agent create
- BUG-4: Self-referencing reports_to validation
- BUG-5: Inter-agent recursion depth limit (max 5 levels)

## [0.1.0] - 2026-05-19

### Added
- Initial release
- Multi-provider AI model support (OpenAI, Anthropic, OpenRouter, Ollama, Gemini, DeepSeek, and more)
- Agent CRUD with roles, personalities, and system prompts
- Real-time chat with WebSocket streaming
- Inter-agent communication via @mentions
- Session management
- Settings and provider configuration
- Next.js 16 + React 19 + Tailwind CSS frontend
- Express + WebSocket backend
- SQLite database
- `nmj` CLI for start/stop/restart
- Docker support (docker-compose.yml)
