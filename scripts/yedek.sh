#!/bin/bash

# ============================================
# AI Interview - Development Restart Script (Real Mode)
# ============================================
# Bu script:
# 1. Mevcut backend/frontend process'lerini durdurur
# 2. Portları temizler (3000, 3001)
# 3. Temiz build alır
# 4. Servisleri başlatır
# 5. GERÇEK MODE session oluşturur (TEST MODE DEĞİL!)
#
# Örnek Data: Havaş Holding - IT Project Manager

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
# 3. START BACKEND
# ============================================
echo -e "${YELLOW}[3/5] Starting backend...${NC}"

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
echo -e "${YELLOW}[4/5] Starting frontend...${NC}"

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
echo -e "${YELLOW}[5/5] Creating REAL MODE session...${NC}"
echo -e "${CYAN}  📋 Havaş Holding - IT Project Manager${NC}"

# ATS_API_KEY'i .env dosyasından oku (POST /sessions artık X-API-Key header'ı gerektiriyor)
ATS_API_KEY=$(grep -E '^ATS_API_KEY=' apps/api/.env 2>/dev/null | cut -d'=' -f2-)
if [ -z "$ATS_API_KEY" ]; then
    echo -e "${YELLOW}  ⚠ ATS_API_KEY boş! apps/api/.env dosyasına bir değer girin.${NC}"
    echo -e "${YELLOW}    Örnek: ATS_API_KEY=dev-secret-key${NC}"
fi

# Create REAL MODE session - Havaş Holding IT Project Manager
# NOT: Title'da "test" kelimesi YOK - bu GERÇEK MODE demek!
RESPONSE=$(curl -s -X POST http://localhost:3001/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ATS_API_KEY" \
  -d '{
    "position": {
      "company": {
        "name": "Havaş Holding",
        "industry": "Havacılık ve Yer Hizmetleri",
        "size": "5000+ çalışan",
        "tech_stack": ["SAP", "Oracle", "Microsoft Azure", "Power BI", "Jira", "Confluence", "ServiceNow"]
      },
      "title": "Senior IT Project Manager",
      "responsibilities": [
        "Kurumsal IT projelerinin uçtan uca yönetimi ve koordinasyonu",
        "Proje bütçesi, zaman planı ve kaynak yönetimi",
        "Paydaş yönetimi ve üst yönetime raporlama",
        "IT altyapı modernizasyonu ve dijital dönüşüm projelerinin liderliği",
        "Dış tedarikçi ve danışmanlık firmalarıyla koordinasyon",
        "Risk yönetimi ve sorun çözümleme",
        "Agile ve Waterfall metodolojilerinin hibrit uygulanması",
        "Proje ekiplerinin motivasyonu ve performans takibi"
      ],
      "requirements": [
        "En az 7 yıl IT sektöründe deneyim",
        "En az 4 yıl proje yönetimi deneyimi",
        "PMP veya PRINCE2 sertifikası",
        "Büyük ölçekli kurumsal projelerde deneyim (bütçe >1M TL)",
        "SAP veya Oracle ERP projelerinde deneyim tercih sebebi",
        "Agile (Scrum, Kanban) ve Waterfall metodolojilerine hakimiyet",
        "İyi derecede İngilizce (yazılı ve sözlü)",
        "MS Project, Jira, Confluence gibi araçlara hakimiyet",
        "Güçlü iletişim ve liderlik becerileri"
      ]
    },
    "interview_topics": [
      {
        "category": "experience",
        "topic": "Proje Yönetimi Deneyimi",
        "description": "Büyük ölçekli IT projelerinde liderlik deneyimi, bütçe ve zaman yönetimi",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 7,
          "importance": 5
        },
        "evaluation_guide": "Yönettiği en büyük projenin bütçesi ve süresi neydi? Kaç kişilik ekip yönetti? Proje başarı metrikleri nelerdi? Başarısız proje deneyimi var mı, ne öğrendi? Minimum 7 puan bekleniyor."
      },
      {
        "category": "technical",
        "topic": "Proje Yönetimi Metodolojileri",
        "description": "Agile, Scrum, Kanban, Waterfall, hibrit yaklaşımlar",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 7,
          "importance": 5
        },
        "evaluation_guide": "Hangi metodolojileri kullandı? Agile ve Waterfall farkını nasıl açıklıyor? Hangi durumda hangisini tercih eder? Sprint planning, retrospective deneyimi sor. 7 altı zayıf."
      },
      {
        "category": "technical",
        "topic": "Proje Yönetim Araçları",
        "description": "MS Project, Jira, Confluence, Azure DevOps, ServiceNow",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 6,
          "importance": 4
        },
        "evaluation_guide": "Hangi araçları aktif kullanıyor? Jira ile iş akışı nasıl kurdu? Raporlama ve dashboard deneyimi sor. 6 altı kabul edilebilir ama gelişim beklenir."
      },
      {
        "category": "experience",
        "topic": "ERP ve Kurumsal Sistem Projeleri",
        "description": "SAP, Oracle veya benzeri büyük ölçekli sistem implementasyonları",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 5,
          "importance": 4
        },
        "evaluation_guide": "ERP projesi yönetti mi? Hangi modüller? Go-live deneyimi var mı? Entegrasyon zorlukları nasıl çözdü? Havaş için SAP deneyimi önemli."
      },
      {
        "category": "technical",
        "topic": "Risk Yönetimi",
        "description": "Proje risklerinin tespiti, analizi ve yönetimi",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 6,
          "importance": 4
        },
        "evaluation_guide": "Risk register kullanıyor mu? Risk matrisi oluşturmuş mu? Gerçekleşen bir riskte nasıl aksiyon aldı? Proaktif mi reaktif mi?"
      },
      {
        "category": "soft_skills",
        "topic": "Paydaş Yönetimi",
        "description": "Üst yönetim, iş birimleri ve teknik ekiplerle iletişim",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 7,
          "importance": 5
        },
        "evaluation_guide": "C-level raporlama deneyimi var mı? Çatışan paydaş beklentilerini nasıl yönetti? Zor bir paydaş örneği iste. PM için kritik yetkinlik, 7 altı zayıf."
      },
      {
        "category": "soft_skills",
        "topic": "Liderlik ve Ekip Yönetimi",
        "description": "Ekip motivasyonu, performans yönetimi, mentorluk",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 7,
          "importance": 5
        },
        "evaluation_guide": "Kaç kişilik ekip yönetti? Düşük performanslı ekip üyesiyle nasıl başa çıktı? Motivasyon teknikleri neler? Uzaktan ekip yönetimi deneyimi var mı?"
      },
      {
        "category": "experience",
        "topic": "Bütçe ve Kaynak Yönetimi",
        "description": "Proje bütçesi planlama, takip ve optimizasyonu",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 6,
          "importance": 4
        },
        "evaluation_guide": "En büyük bütçeli projesi ne kadardı? Bütçe aşımı yaşadı mı, nasıl yönetti? Kaynak planlaması nasıl yapıyor? Cost-benefit analizi deneyimi sor."
      },
      {
        "category": "soft_skills",
        "topic": "Problem Çözme ve Karar Alma",
        "description": "Kritik durumlarda hızlı ve etkili karar alma yeteneği",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 7,
          "importance": 5
        },
        "evaluation_guide": "Projede yaşadığı en kritik problem neydi? Nasıl çözdü? Baskı altında karar alma örneği iste. Analitik mi sezgisel mi karar alıyor?"
      },
      {
        "category": "soft_skills",
        "topic": "İletişim Becerileri",
        "description": "Yazılı ve sözlü iletişim, sunum ve raporlama",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 6,
          "importance": 4
        },
        "evaluation_guide": "Görüşme boyunca gözlemle. Karmaşık teknik konuları yönetim diline çevirebiliyor mu? Sunuş becerisi nasıl? Raporlama alışkanlıkları sor."
      },
      {
        "category": "technical",
        "topic": "IT Altyapı Bilgisi",
        "description": "Cloud, network, security, database temel bilgisi",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 5,
          "importance": 3
        },
        "evaluation_guide": "Cloud migration projesi yönetti mi? Teknik ekiple nasıl iletişim kuruyor? Temel IT kavramlarına hakimiyeti ölç. PM için derin teknik bilgi şart değil ama anlayış gerekli."
      },
      {
        "category": "motivation",
        "topic": "Motivasyon ve Kariyer Hedefleri",
        "description": "Havaş ve havacılık sektörüne ilgi, kariyer planları",
        "scoring": {
          "scale": "0-10",
          "minimum_expected": 6,
          "importance": 3
        },
        "evaluation_guide": "Neden Havaş? Havacılık sektörüne ilgisi var mı? 5 yıllık kariyer hedefi ne? Şirket kültürüne uyum önemli."
      }
    ],
    "candidate": {
      "name": "Emre Kirpiksiz",
      "experiences": [
        {
          "title": "IT Project Manager",
          "company": "Turkcell (Telekom)",
          "duration": "Ocak 2021 - Halen (4 yıl)",
          "description": "Kurumsal dijital dönüşüm projelerinin yönetimi. 15M TL bütçeli CRM modernizasyonu projesini 12 aylık sürede başarıyla tamamladım. 8 kişilik cross-functional ekip liderliği. Agile/Scrum metodolojisi ile sprint bazlı teslimatlar. SAP entegrasyonu ve data migration projelerinde aktif rol."
        },
        {
          "title": "Senior Business Analyst / Jr. Project Manager",
          "company": "Akbank (Finans)",
          "duration": "Mart 2018 - Aralık 2020 (2 yıl 10 ay)",
          "description": "Core banking modernizasyonu projesinde iş analizi ve proje koordinasyonu. Gereksinim toplama, süreç modelleme ve test koordinasyonu. 5 kişilik BA ekibinin teknik lideri. PMP sertifikası bu dönemde alındı."
        },
        {
          "title": "IT Business Analyst",
          "company": "Eczacıbaşı Holding (Sanayi)",
          "duration": "Haziran 2015 - Şubat 2018 (2 yıl 9 ay)",
          "description": "SAP MM ve SD modülleri için iş analizi. Üretim ve lojistik süreçlerinin dijitalleştirilmesi. Kullanıcı kabul testleri koordinasyonu. 3 farklı fabrika için ERP roll-out projelerinde yer aldım."
        }
      ],
      "education": [
        {
          "degree": "Yüksek Lisans - MBA",
          "school": "Koç Üniversitesi",
          "duration": "2019 - 2021",
          "gpa": "3.6/4.0"
        },
        {
          "degree": "Lisans - Endüstri Mühendisliği",
          "school": "Boğaziçi Üniversitesi",
          "duration": "2011 - 2015",
          "gpa": "3.3/4.0"
        }
      ],
      "skills": [
        "PMP Sertifikası (2019)",
        "PRINCE2 Foundation (2020)",
        "Scrum Master Certified (2021)",
        "MS Project (8 yıl)",
        "Jira & Confluence (6 yıl)",
        "SAP (5 yıl - MM, SD, FI modülleri)",
        "Agile/Scrum (5 yıl)",
        "Waterfall (8 yıl)",
        "Power BI (3 yıl)",
        "Azure DevOps (2 yıl)",
        "İngilizce - Akıcı (TOEFL 105)"
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
echo -e "  Şirket:   ${YELLOW}Havaş Holding${NC}"
echo -e "  Pozisyon: ${YELLOW}Senior IT Project Manager${NC}"
echo -e "  Aday:     ${YELLOW}Mehmet Kaya${NC}"
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
