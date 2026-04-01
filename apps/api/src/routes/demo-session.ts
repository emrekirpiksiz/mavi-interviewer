import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { config } from '../config/index.js';
import { demoSessionLimiter } from '../middleware/rateLimiter.js';
import { createInterviewSession } from '../services/sessionService.js';
import type { CreateSessionRequest } from '@ai-interview/shared';

// ============================================
// DEMO SESSION ROUTE
// ============================================
// Access code ile korunan demo session endpoint'i

const router: RouterType = Router();

// Demo session verileri
const DEMO_SESSION_DATA: CreateSessionRequest = {
  position: {
    company: {
      name: "Havaş Holding",
      industry: "Yazılım / Enterprise Solutions",
      size: "50-200 çalışan",
      tech_stack: [".NET", "SQL Server", "Azure DevOps", "JIRA"]
    },
    title: "Senior Project Manager",
    responsibilities: [
      "2-3 concurrent projenin end-to-end yönetimi (kapsam, zaman, maliyet, kalite, risk)",
      "Müşteri ilişkileri yönetimi: düzenli statü toplantıları, raporlama, beklenti yönetimi",
      "8-15 kişilik cross-functional ekiplerin koordinasyonu ve performans takibi",
      "Bütçe ve kaynak planlaması, forecasting, financial reporting",
      "Proje dokümantasyonu: proje planı, risk/issue log, status report, lesson learned"
    ],
    requirements: [
      "En az 7 yıl yazılım projesi yönetimi deneyimi",
      "Hibrit metodoloji deneyimi: Waterfall/PRINCE2 ve Agile/Scrum",
      "PMP, PRINCE2 veya Scrum Master sertifikalarından en az biri tercih sebebi",
      "MS Project, JIRA, Azure DevOps araçlarında ileri seviye deneyim",
      "Çok iyi seviye İngilizce (yazılı ve sözlü)",
      "Budget management, risk yönetimi, stakeholder yönetimi deneyimi",
      "Banking, fintech veya sağlık sektörü proje deneyimi tercih sebebi"
    ]
  },
  interview_topics: [
    {
      category: "experience",
      topic: "Enterprise Proje Yönetimi",
      description: "End-to-end proje yönetimi, concurrent proje deneyimi, bütçe yönetimi",
      scoring: { scale: "0-10", minimum_expected: 7, importance: 5 },
      evaluation_guide: "300K-1.5M€ bütçeli projelerde deneyim, 2-3 projeyi aynı anda yönetme kapasitesi"
    },
    {
      category: "technical",
      topic: "Metodoloji ve Araçlar",
      description: "Agile/Scrum, Waterfall, JIRA, Azure DevOps kullanımı",
      scoring: { scale: "0-10", minimum_expected: 6, importance: 4 },
      evaluation_guide: "Hibrit metodoloji deneyimi, hangi durumda hangi yaklaşımı tercih ettiği"
    },
    {
      category: "experience",
      topic: "Sektör Deneyimi",
      description: "Fintech, banking, enterprise müşteri deneyimi",
      scoring: { scale: "0-10", minimum_expected: 6, importance: 4 },
      evaluation_guide: "Finansal kurum projeleri, compliance gereksinimleri, kurumsal müşteri yönetimi"
    },
    {
      category: "soft_skills",
      topic: "Stakeholder Yönetimi",
      description: "Müşteri ilişkileri, beklenti yönetimi, raporlama",
      scoring: { scale: "0-10", minimum_expected: 7, importance: 5 },
      evaluation_guide: "Zor müşteri durumları, escalation yönetimi, C-level iletişim"
    },
    {
      category: "soft_skills",
      topic: "Risk ve Problem Çözme",
      description: "Risk yönetimi, issue resolution, change request yönetimi",
      scoring: { scale: "0-10", minimum_expected: 6, importance: 4 },
      evaluation_guide: "Kritik risk örnekleri, nasıl yönettiği, proaktif yaklaşım"
    }
  ],
  candidate: {
    name: "Demo Aday",
    experiences: [
      {
        title: "Senior FinTech Project Manager",
        company: "Digital Bank",
        duration: "Eki 2021 - Halen (4 yıl 3 ay)",
        description: "Open banking API platform geliştirme. PSD2 compliance. 150+ TPP onboarding."
      },
      {
        title: "Project Manager - Payment Systems",
        company: "Payment Solutions Inc",
        duration: "Nis 2017 - Eyl 2021 (4 yıl 6 ay)",
        description: "Payment gateway ve switch sistemleri. Visa, Mastercard, Troy entegrasyonları. 3DS 2.0, fraud detection."
      },
      {
        title: "Business Analyst",
        company: "Banking Software",
        duration: "Ara 2014 - Mar 2017 (2 yıl 4 ay)",
        description: "Core banking sistemi analizi. BDDK raporlama gereksinimleri."
      }
    ],
    education: [
      {
        degree: "Lisans - Bilgisayar Mühendisliği",
        school: "İstanbul Teknik Üniversitesi",
        duration: "2010 - 2014",
        gpa: "3.32/4.0"
      }
    ],
    skills: [
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
};

// ---------- POST /demo-session ----------
// Access code ile demo session oluştur
// Rate limited: 5 req/dk per IP (brute-force engeli)

router.post(
  '/',
  demoSessionLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body;

      // Kod kontrolü
      if (!code || typeof code !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Katılım kodu gereklidir',
          },
        });
        return;
      }

      const normalizedCode = code.trim().toUpperCase();

      // Kod doğrulama
      if (!config.demoAccessCodes.includes(normalizedCode)) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_ACCESS_CODE',
            message: 'Geçersiz katılım kodu',
          },
        });
        return;
      }

      // Demo session oluştur
      const response = await createInterviewSession(DEMO_SESSION_DATA);

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating demo session:', error);
      next(error);
    }
  }
);

export default router;
