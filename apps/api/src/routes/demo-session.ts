import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { config } from '../config/index.js';
import { demoSessionLimiter } from '../middleware/rateLimiter.js';
import { createInterviewSession } from '../services/sessionService.js';
import type { CreateSessionRequest } from '@ai-interview/shared';

// ============================================
// DEMO SESSION ROUTE
// ============================================

const router: RouterType = Router();

const DEMO_SESSION_DATA: CreateSessionRequest = {
  assessment: {
    title: "Mağaza Oryantasyon Değerlendirmesi - Demo",
    introText: "Merhaba! Ben oryantasyon değerlendirme asistanınızım. Eğitim sürecinde öğrendiklerinizi ölçeceğim. Hazırsanız başlayalım.",
    closingText: "Tüm soruları tamamladık. Katılımınız için teşekkür ederim. Değerlendirme sonuçlarınız yöneticinize iletilecektir. İyi çalışmalar!"
  },
  questions: [
    {
      id: "q-1",
      order: 1,
      text: "Mağazaya gelen bir müşteriye ilk olarak nasıl yaklaşmalısınız?",
      category: "Müşteri İlişkileri",
      correctOnWrong: true,
      correctAnswer: "Müşteriye gülümseyerek yaklaşmalı, göz teması kurmalı ve 'Hoş geldiniz, size nasıl yardımcı olabilirim?' şeklinde karşılamalısınız."
    },
    {
      id: "q-2",
      order: 2,
      text: "Kasa işlemlerinde iade süreci nasıl işler?",
      category: "Operasyonel Süreçler",
      correctOnWrong: true,
      correctAnswer: "İade için fatura veya fiş gereklidir. Ürün 14 gün içinde, kullanılmamış ve etiketli olmalıdır. Sistem üzerinden iade işlemi başlatılır ve yönetici onayı alınır."
    },
    {
      id: "q-3",
      order: 3,
      text: "İş güvenliği kurallarına göre mağazada yangın çıkması durumunda ne yapmalısınız?",
      category: "İş Güvenliği",
      correctOnWrong: true,
      correctAnswer: "Önce yangın alarmını çalmalı, müşterileri sakin bir şekilde en yakın acil çıkışa yönlendirmeli ve itfaiyeyi aramalısınız. Asansör kullanılmamalıdır."
    }
  ],
  candidate: {
    name: "Demo Çalışan",
    position: "Satış Danışmanı",
    store: "İstanbul Kadıköy Mağazası"
  },
  settings: {
    maxDurationMinutes: 15,
    language: "tr"
  }
};

router.post(
  '/',
  demoSessionLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body;

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

      const response = await createInterviewSession(DEMO_SESSION_DATA);

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating demo session:', error);
      next(error);
    }
  }
);

export default router;
