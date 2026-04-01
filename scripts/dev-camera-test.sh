#!/bin/bash

# ============================================
# AI Interview - Camera Feature Test Script
# ============================================
# dev-restart.sh ile aynı akış, kamera testi için.
# 1. Mevcut process'leri durdurur
# 2. Portları temizler (3000, 3001)
# 3. Temiz build alır
# 4. Database migration'ları çalıştırır
# 5. Servisleri başlatır
# 6. Kamera etkin test session oluşturur

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Interview - Camera Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# 1. STOP EXISTING PROCESSES
# ============================================
echo -e "${YELLOW}[1/6] Stopping existing processes...${NC}"

if lsof -ti:3000 > /dev/null 2>&1; then
    echo "  Killing processes on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

if lsof -ti:3001 > /dev/null 2>&1; then
    echo "  Killing processes on port 3001..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
fi

pkill -f "next dev" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true

sleep 1
echo -e "${GREEN}  ✓ Processes stopped${NC}"

# ============================================
# 2. CLEAN BUILD
# ============================================
echo -e "${YELLOW}[2/6] Cleaning and building frontend...${NC}"

rm -rf apps/web/.next

echo "  Building frontend..."
cd apps/web && pnpm build
cd "$PROJECT_ROOT"

echo -e "${GREEN}  ✓ Build completed${NC}"

# ============================================
# 3. RUN DATABASE MIGRATIONS
# ============================================
echo -e "${YELLOW}[3/6] Running database migrations...${NC}"

cd apps/api
npx tsx scripts/migrate.ts
cd "$PROJECT_ROOT"

echo -e "${GREEN}  ✓ Migrations applied${NC}"

# ============================================
# 4. START BACKEND
# ============================================
echo -e "${YELLOW}[4/6] Starting backend...${NC}"

cd apps/api
npx tsx src/index.ts > /tmp/ai-interview-api.log 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

echo "  Waiting for backend (port 3001)..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Backend started (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}  ✗ Backend failed to start. Check /tmp/ai-interview-api.log${NC}"
    exit 1
fi

# ============================================
# 5. START FRONTEND
# ============================================
echo -e "${YELLOW}[5/6] Starting frontend...${NC}"

cd apps/web
pnpm start > /tmp/ai-interview-web.log 2>&1 &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"

echo "  Waiting for frontend (port 3000)..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Frontend started (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${RED}  ✗ Frontend failed to start. Check /tmp/ai-interview-web.log${NC}"
    exit 1
fi

# ============================================
# 6. CREATE CAMERA TEST SESSION
# ============================================
echo -e "${YELLOW}[6/6] Creating camera test session...${NC}"

ATS_API_KEY=$(grep -E '^ATS_API_KEY=' apps/api/.env 2>/dev/null | cut -d'=' -f2-)
if [ -z "$ATS_API_KEY" ]; then
    echo -e "${YELLOW}  ⚠ ATS_API_KEY boş! apps/api/.env dosyasına bir değer girin.${NC}"
fi

RESPONSE=$(curl -s -X POST http://localhost:3001/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ATS_API_KEY" \
  -d '{
    "candidate": {
      "name": "Kamera Test Adayı"
    },
    "position": {
      "title": "Test Mode - Kamera Test",
      "company": {
        "name": "Test Şirketi"
      },
      "responsibilities": ["Test görevi"],
      "requirements": ["Test gereksinimi"]
    },
    "interview_topics": [
      {
        "category": "technical",
        "topic": "Genel Test"
      }
    ],
    "settings": {
      "camera": {
        "enabled": true,
        "recordVideo": true
      }
    }
  }')

SESSION_ID=$(echo $RESPONSE | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}  ✓ Camera test session created${NC}"
else
    echo -e "${RED}  ✗ Failed to create session${NC}"
    echo "  Response: $RESPONSE"
    exit 1
fi

# ============================================
# SUMMARY
# ============================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  ✓ Camera Test Environment Ready!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Backend:  ${GREEN}http://localhost:3001${NC} (PID: $BACKEND_PID)"
echo -e "  Frontend: ${GREEN}http://localhost:3000${NC} (PID: $FRONTEND_PID)"
echo ""
echo -e "  ${YELLOW}Camera Test Session:${NC}"
echo -e "  ${GREEN}http://localhost:3000/interview/$SESSION_ID${NC}"
echo ""
echo -e "  ${BLUE}Kamera Test Detayları:${NC}"
echo -e "    • Kamera: ${GREEN}Etkin${NC}"
echo -e "    • Video Kaydı: ${GREEN}Etkin${NC}"
echo -e "    • Face Detection: ${GREEN}MediaPipe Face Landmarker${NC}"
echo -e "    • Debug Overlay: ${GREEN}Test modunda otomatik görünür${NC}"
echo ""
echo -e "  Logs:"
echo -e "    Backend:  /tmp/ai-interview-api.log"
echo -e "    Frontend: /tmp/ai-interview-web.log"
echo ""
echo -e "  ${YELLOW}Konsol'da kontrol edin:${NC}"
echo -e "    • '[Interview] Camera video ready' log'u çıkmalı"
echo -e "    • MediaPipe: ✓ loaded olmalı"
echo -e "    • FPS > 0 olmalı"
echo ""
echo -e "  ${YELLOW}To stop:${NC} pkill -f 'next start' && pkill -f 'tsx src/index.ts'"
echo ""
