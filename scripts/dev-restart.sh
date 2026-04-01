#!/bin/bash

# ============================================
# AI Interview - Development Restart Script
# ============================================
# Bu script:
# 1. Mevcut backend/frontend process'lerini durdurur
# 2. Portları temizler (3000, 3001)
# 3. Temiz build alır
# 4. Database migration'ları çalıştırır
# 5. Servisleri başlatır
# 6. Test mode session oluşturur

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Interview - Dev Restart Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# 1. STOP EXISTING PROCESSES
# ============================================
echo -e "${YELLOW}[1/5] Stopping existing processes...${NC}"

# Kill processes on port 3000 (frontend)
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "  Killing processes on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

# Kill processes on port 3001 (backend)
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "  Killing processes on port 3001..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
fi

# Kill any node processes related to our project
pkill -f "next dev" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true

sleep 1
echo -e "${GREEN}  ✓ Processes stopped${NC}"

# ============================================
# 2. CLEAN BUILD
# ============================================
echo -e "${YELLOW}[2/5] Cleaning and building frontend...${NC}"

# Clean .next folder
rm -rf apps/web/.next

# Build frontend only (backend will run with tsx)
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
# Use tsx to run TypeScript directly (shared package uses .ts files)
npx tsx src/index.ts > /tmp/ai-interview-api.log 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# Wait for backend to be ready
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

# Wait for frontend to be ready
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
# 6. CREATE TEST SESSION
# ============================================
echo -e "${YELLOW}[6/6] Creating test session...${NC}"

# ATS_API_KEY'i .env dosyasından oku (POST /sessions artık X-API-Key header'ı gerektiriyor)
ATS_API_KEY=$(grep -E '^ATS_API_KEY=' apps/api/.env 2>/dev/null | cut -d'=' -f2-)
if [ -z "$ATS_API_KEY" ]; then
    echo -e "${YELLOW}  ⚠ ATS_API_KEY boş! apps/api/.env dosyasına bir değer girin.${NC}"
    echo -e "${YELLOW}    Örnek: ATS_API_KEY=dev-secret-key${NC}"
fi

# Create test session with "test" in title for TEST MODE + camera enabled
RESPONSE=$(curl -s -X POST http://localhost:3001/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ATS_API_KEY" \
  -d '{
    "candidate": {
      "name": "Test Aday"
    },
    "position": {
      "title": "Test Mode - Hızlı Test",
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
    echo -e "${GREEN}  ✓ Test session created${NC}"
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
echo -e "${GREEN}  ✓ All services running!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Backend:  ${GREEN}http://localhost:3001${NC} (PID: $BACKEND_PID)"
echo -e "  Frontend: ${GREEN}http://localhost:3000${NC} (PID: $FRONTEND_PID)"
echo ""
echo -e "  ${YELLOW}Test Session URL:${NC}"
echo -e "  ${GREEN}http://localhost:3000/interview/$SESSION_ID${NC}"
echo ""
echo -e "  Logs:"
echo -e "    Backend:  /tmp/ai-interview-api.log"
echo -e "    Frontend: /tmp/ai-interview-web.log"
echo ""
echo -e "  ${YELLOW}To stop:${NC} pkill -f 'next start' && pkill -f 'tsx src/index.ts'"
echo ""
