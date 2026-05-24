# NMJ Dashboard — Multi-stage Dockerfile
# Builds both Next.js frontend and Express backend

# ── Stage 1: Dependencies ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package-lock.json* ./backend/

# Install dependencies
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
RUN cd backend && npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# ── Stage 2: Build frontend ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY . .

# Build Next.js frontend
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Copy frontend build
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy backend
COPY --from=builder /app/backend ./backend

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Expose ports
# 4000 = Next.js frontend
# 3001 = Express backend + WebSocket
EXPOSE 4000 3001

# Start both frontend and backend
CMD ["sh", "-c", "cd /app/backend && npx tsx src/server.ts & cd /app && npx next start -p 4000"]
