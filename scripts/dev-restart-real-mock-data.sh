#!/bin/bash

# ============================================
# AI Interview - Development Restart Script (Real Mode)
# ============================================
# Bu script:
# 1. Mevcut backend/frontend process'lerini durdurur
# 2. Portları temizler (3000, 3001)
# 3. Temiz build alır
# 4. Database migration'ları çalıştırır
# 5. Servisleri başlatır
# 6. GERÇEK MODE session oluşturur (TEST MODE DEĞİL!)
#
# Örnek Data: Nuevo - Senior Project Manager (Serkan Acar)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Interview - Dev Restart Script${NC}"
echo -e "${CYAN}  🎯 GERÇEK MODE (Full Interview)${NC}"
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
# 4. START FRONTEND
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
# 5. CREATE REAL MODE SESSION
# ============================================
echo -e "${YELLOW}[6/6] Creating REAL MODE session...${NC}"
echo -e "${CYAN}  📋 Nuevo - Senior Project Manager${NC}"

# ATS_API_KEY'i .env dosyasından oku (POST /sessions artık X-API-Key header'ı gerektiriyor)
ATS_API_KEY=$(grep -E '^ATS_API_KEY=' apps/api/.env 2>/dev/null | cut -d'=' -f2-)
if [ -z "$ATS_API_KEY" ]; then
    echo -e "${YELLOW}  ⚠ ATS_API_KEY boş! apps/api/.env dosyasına bir değer girin.${NC}"
    echo -e "${YELLOW}    Örnek: ATS_API_KEY=dev-secret-key${NC}"
fi

# Create REAL MODE session - Nuevo Senior Project Manager
# NOT: Title'da "test" kelimesi YOK - bu GERÇEK MODE demek!
RESPONSE=$(curl -s -X POST http://localhost:3001/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ATS_API_KEY" \
  -d '{
    "position": {
      "company": {
        "name": "Havaş Holding",
        "industry": "Yazılım / Enterprise Solutions",
        "size": "50-200 çalışan",
        "tech_stack": [".NET", "SQL Server", "Azure DevOps", "JIRA"]
      },
      "title": "Senior Project Manager",
      "responsibilities": [
        "2-3 concurrent projenin end-to-end yönetimi (kapsam, zaman, maliyet, kalite, risk)",
        "Müşteri ilişkileri yönetimi: düzenli statü toplantıları, raporlama, beklenti yönetimi",
        "8-15 kişilik cross-functional ekiplerin koordinasyonu ve performans takibi",
        "Bütçe ve kaynak planlaması, forecasting, financial reporting",
        "Proje dokümantasyonu: proje planı, risk/issue log, status report, lesson learned"
      ],
      "requirements": [
        "En az 7 yıl yazılım projesi yönetimi deneyimi",
        "Hibrit metodoloji deneyimi: Waterfall/PRINCE2 ve Agile/Scrum",
        "PMP, PRINCE2 veya Scrum Master sertifikalarından en az biri tercih sebebi",
        "MS Project, JIRA, Azure DevOps araçlarında ileri seviye deneyim",
        "Çok iyi seviye İngilizce (yazılı ve sözlü)",
        "Budget management, risk yönetimi, stakeholder yönetimi deneyimi",
        "Banking, fintech veya sağlık sektörü proje deneyimi tercih sebebi"
      ]
    },
    "interview_topics": [
      {
        "category": "experience",
        "topic": "Enterprise Proje Yönetimi",
        "description": "End-to-end proje yönetimi, concurrent proje deneyimi, bütçe yönetimi",
        "scoring": { "scale": "0-10", "minimum_expected": 7, "importance": 5 },
        "evaluation_guide": "300K-1.5M€ bütçeli projelerde deneyim, 2-3 projeyi aynı anda yönetme kapasitesi"
      },
      {
        "category": "technical",
        "topic": "Metodoloji ve Araçlar",
        "description": "Agile/Scrum, Waterfall, JIRA, Azure DevOps kullanımı",
        "scoring": { "scale": "0-10", "minimum_expected": 6, "importance": 4 },
        "evaluation_guide": "Hibrit metodoloji deneyimi, hangi durumda hangi yaklaşımı tercih ettiği"
      },
      {
        "category": "experience",
        "topic": "Sektör Deneyimi",
        "description": "Fintech, banking, enterprise müşteri deneyimi",
        "scoring": { "scale": "0-10", "minimum_expected": 6, "importance": 4 },
        "evaluation_guide": "Finansal kurum projeleri, compliance gereksinimleri, kurumsal müşteri yönetimi"
      },
      {
        "category": "soft_skills",
        "topic": "Stakeholder Yönetimi",
        "description": "Müşteri ilişkileri, beklenti yönetimi, raporlama",
        "scoring": { "scale": "0-10", "minimum_expected": 7, "importance": 5 },
        "evaluation_guide": "Zor müşteri durumları, escalation yönetimi, C-level iletişim"
      },
      {
        "category": "soft_skills",
        "topic": "Risk ve Problem Çözme",
        "description": "Risk yönetimi, issue resolution, change request yönetimi",
        "scoring": { "scale": "0-10", "minimum_expected": 6, "importance": 4 },
        "evaluation_guide": "Kritik risk örnekleri, nasıl yönettiği, proaktif yaklaşım"
      }
    ],
    "candidate": {
      "name": "Emre Kirpiksiz",
      "experiences": [
        {
          "title": "Senior FinTech Project Manager",
          "company": "Digital Bank",
          "duration": "Eki 2021 - Halen (4 yıl 3 ay)",
          "description": "Open banking API platform geliştirme. PSD2 compliance. 150+ TPP onboarding."
        },
        {
          "title": "Project Manager - Payment Systems",
          "company": "Payment Solutions Inc",
          "duration": "Nis 2017 - Eyl 2021 (4 yıl 6 ay)",
          "description": "Payment gateway ve switch sistemleri. Visa, Mastercard, Troy entegrasyonları. 3DS 2.0, fraud detection."
        },
        {
          "title": "Business Analyst",
          "company": "Banking Software",
          "duration": "Ara 2014 - Mar 2017 (2 yıl 4 ay)",
          "description": "Core banking sistemi analizi. BDDK raporlama gereksinimleri."
        }
      ],
      "education": [
        {
          "degree": "Lisans - Bilgisayar Mühendisliği",
          "school": "İstanbul Teknik Üniversitesi",
          "duration": "2010 - 2014",
          "gpa": "3.32/4.0"
        }
      ],
      "skills": [
        "FinTech (11 yıl)",
        "Payment Systems",
        "Open Banking / PSD2",
        "PCI-DSS Compliance",
        "Project Management",
        "PMP Sertifikalı",
        "Certified Scrum Master",
        "API Management"
      ]
    }
  }')

SESSION_ID=$(echo $RESPONSE | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}  ✓ REAL MODE session created${NC}"
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
echo -e "${CYAN}  ─────────────────────────────────────${NC}"
echo -e "${CYAN}  📋 GÖRÜŞME BİLGİLERİ${NC}"
echo -e "${CYAN}  ─────────────────────────────────────${NC}"
echo -e "  Şirket:   ${YELLOW}Nuevo${NC}"
echo -e "  Pozisyon: ${YELLOW}Senior Project Manager${NC}"
echo -e "  Aday:     ${YELLOW}Serkan Acar${NC}"
echo -e "  Mode:     ${GREEN}GERÇEK MODE (Full Interview)${NC}"
echo ""
echo -e "  ${YELLOW}Interview URL:${NC}"
echo -e "  ${GREEN}http://localhost:3000/interview/$SESSION_ID${NC}"
echo ""
echo -e "  Logs:"
echo -e "    Backend:  /tmp/ai-interview-api.log"
echo -e "    Frontend: /tmp/ai-interview-web.log"
echo ""
echo -e "  ${YELLOW}To stop:${NC} pkill -f 'next start' && pkill -f 'tsx src/index.ts'"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${CYAN}  📜 BACKEND LOGLARI (tail -f)${NC}"
echo -e "${CYAN}  Çıkmak için: Ctrl+C${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Backend loglarını sürekli göster
tail -f /tmp/ai-interview-api.log
