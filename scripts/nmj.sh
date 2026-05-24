#!/bin/bash
# nmj — Nineteen Million (AI) Jobs CLI
# Start, stop, and manage the NMJ Dashboard

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_DIR"
BACKEND_DIR="$PROJECT_DIR/backend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[nmj]${NC} $1"; }
ok()   { echo -e "${GREEN}[nmj]${NC} $1"; }
warn() { echo -e "${YELLOW}[nmj]${NC} $1"; }
err()  { echo -e "${RED}[nmj]${NC} $1"; }

# Check dependencies
check_deps() {
    if ! command -v node &> /dev/null; then
        err "Node.js is not installed. Please install Node.js 18+."
        exit 1
    fi

    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        warn "Frontend dependencies not found. Installing..."
        cd "$FRONTEND_DIR" && npm install
    fi

    if [ ! -d "$BACKEND_DIR/node_modules" ]; then
        warn "Backend dependencies not found. Installing..."
        cd "$BACKEND_DIR" && npm install
    fi

    mkdir -p "$BACKEND_DIR/data"

    if [ ! -f "$BACKEND_DIR/data/nmj.db" ]; then
        log "Seeding database..."
        cd "$BACKEND_DIR" && npx tsx src/database.ts
    fi
}

# Graceful shutdown
cleanup() {
    log "Shutting down..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    ok "Stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

ACTION="${1:-start}"

case "$ACTION" in
    start)
        check_deps

        log "Checking for existing processes..."
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
        lsof -ti:4000 | xargs kill -9 2>/dev/null || true
        pkill -f "next dev" 2>/dev/null || true
        pkill -f "next start" 2>/dev/null || true
        pkill -f "tsx src/server" 2>/dev/null || true
        sleep 2

        log "Starting Nineteen Million (AI) Jobs..."
        echo ""

        log "Starting backend on port 3001..."
        cd "$BACKEND_DIR"
        npx tsx src/server.ts &
        BACKEND_PID=$!

        for i in $(seq 1 30); do
            if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
                ok "Backend ready!"
                break
            fi
            sleep 1
        done

        log "Starting frontend on port 4000..."
        cd "$FRONTEND_DIR"
        npm run dev &
        FRONTEND_PID=$!

        echo ""
        ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ok "  Nineteen Million (AI) Jobs is running!"
        ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ok "  Frontend:  http://localhost:4000"
        ok "  Backend:   http://localhost:3001"
        ok "  WebSocket: ws://localhost:3001"
        ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        warn "Press Ctrl+C to stop"
        echo ""

        wait
        ;;

    stop)
        log "Stopping all services..."
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
        lsof -ti:4000 | xargs kill -9 2>/dev/null || true
        pkill -f "next dev" 2>/dev/null || true
        pkill -f "next start" 2>/dev/null || true
        pkill -f "tsx src/server" 2>/dev/null || true
        sleep 1
        ok "Stopped all services."
        ;;

    status)
        echo ""
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            ok "Backend:  ✅ Running (port 3001)"
        else
            err "Backend:  ❌ Not running"
        fi

        if curl -s http://localhost:4000 > /dev/null 2>&1; then
            ok "Frontend: ✅ Running (port 4000)"
        else
            err "Frontend: ❌ Not running"
        fi
        echo ""
        ;;

    restart)
        $0 stop
        sleep 2
        $0 start
        ;;

    build)
        check_deps
        log "Building frontend..."
        cd "$FRONTEND_DIR"
        npm run build
        ok "Build complete!"
        ;;

    lint)
        cd "$FRONTEND_DIR"
        npm run lint
        ;;

    db:seed)
        log "Seeding database..."
        cd "$BACKEND_DIR"
        npx tsx src/database.ts
        ok "Database seeded!"
        ;;

    db:reset)
        warn "This will delete all data. Continue? [y/N]"
        read -r confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            rm -f "$BACKEND_DIR/data/nmj.db" "$BACKEND_DIR/data/nmj.db-shm" "$BACKEND_DIR/data/nmj.db-wal"
            cd "$BACKEND_DIR"
            npx tsx src/database.ts
            ok "Database reset and seeded!"
        else
            log "Cancelled."
        fi
        ;;

    *)
        echo ""
        echo "  nmj — Nineteen Million (AI) Jobs"
        echo ""
        echo "  Usage: nmj <command>"
        echo ""
        echo "  Commands:"
        echo "    start     Start frontend and backend (default)"
        echo "    stop      Stop all services"
        echo "    restart   Restart all services"
        echo "    status    Check service status"
        echo "    build     Build frontend for production"
        echo "    lint      Run linter"
        echo "    db:seed   Seed database with default data"
        echo "    db:reset  Reset and reseed database"
        echo ""
        ;;
esac
