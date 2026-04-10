#!/bin/bash
# ============================================
# Mavi Oryantasyon - Dev Start Script
# ============================================
# Portları temizler, shared paketi build eder,
# backend ve frontend'i başlatır.
#
# Portlar:
#   Frontend: 2222
#   Backend:  2223

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FRONTEND_PORT=2222
BACKEND_PORT=2223

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[mavi]${NC} $1"; }
ok()    { echo -e "${GREEN}[mavi]${NC} $1"; }
warn()  { echo -e "${YELLOW}[mavi]${NC} $1"; }
err()   { echo -e "${RED}[mavi]${NC} $1"; }

# ---- 1. Kill existing processes on ports ----
log "Portlar temizleniyor..."

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    warn "Port $port üzerindeki process'ler durduruldu"
  else
    ok "Port $port temiz"
  fi
}

kill_port $FRONTEND_PORT
kill_port $BACKEND_PORT

sleep 1

# ---- 2. Install dependencies ----
log "Bağımlılıklar kontrol ediliyor..."
cd "$PROJECT_ROOT"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ---- 3. Build shared package ----
log "Shared paket build ediliyor..."
cd "$PROJECT_ROOT/packages/shared"
pnpm run build
ok "Shared paket build tamamlandı"

# ---- 4. Clear Next.js cache ----
log "Next.js cache temizleniyor..."
rm -rf "$PROJECT_ROOT/apps/web/.next"
ok "Cache temizlendi"

# ---- 5. Start backend ----
log "Backend başlatılıyor (port $BACKEND_PORT)..."
cd "$PROJECT_ROOT/apps/api"
pnpm run dev > /tmp/mavi-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 30); do
  if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    ok "Backend hazır (PID: $BACKEND_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    err "Backend $BACKEND_PORT portunda başlatılamadı!"
    err "Log: /tmp/mavi-backend.log"
    cat /tmp/mavi-backend.log
    exit 1
  fi
  sleep 1
done

# ---- 6. Start frontend ----
log "Frontend başlatılıyor (port $FRONTEND_PORT)..."
cd "$PROJECT_ROOT/apps/web"
pnpm run dev > /tmp/mavi-frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to be ready
for i in $(seq 1 30); do
  if curl -s "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    ok "Frontend hazır (PID: $FRONTEND_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    warn "Frontend henüz yanıt vermiyor, ama başlatıldı (PID: $FRONTEND_PID)"
    break
  fi
  sleep 1
done

# ---- 7. Summary ----
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Mavi Oryantasyon Dev Server             ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Frontend:  http://localhost:${FRONTEND_PORT}           ║${NC}"
echo -e "${GREEN}║  Backend:   http://localhost:${BACKEND_PORT}           ║${NC}"
echo -e "${GREEN}║  WebSocket: ws://localhost:${BACKEND_PORT}/ws         ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Backend PID:  ${BACKEND_PID}                          ║${NC}"
echo -e "${GREEN}║  Frontend PID: ${FRONTEND_PID}                          ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Logs:                                     ║${NC}"
echo -e "${GREEN}║    Backend:  /tmp/mavi-backend.log         ║${NC}"
echo -e "${GREEN}║    Frontend: /tmp/mavi-frontend.log        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Durdurmak için:${NC} kill $BACKEND_PID $FRONTEND_PID"
echo -e "${CYAN}Veya:${NC} lsof -ti:$FRONTEND_PORT,:$BACKEND_PORT | xargs kill -9"
echo ""

# Keep script alive - forward signals to children
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
