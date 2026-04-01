#!/bin/bash

# ============================================
# AI Interview - Development Restart Script
# ============================================
# Bu script:
# 1. Mevcut backend/frontend process'lerini durdurur
# 2. Portları temizler (3000, 3001)
# 3. Temiz build alır
# 4. Servisleri başlatır
# 5. Test mode session oluşturur

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
