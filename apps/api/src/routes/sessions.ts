import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import {
  createSessionSchema,
  sessionIdParamSchema,
  validateBody,
  validateParams,
  type CreateSessionBody,
  type SessionIdParams,
} from '../middleware/validation.js';
import { validateApiKey } from '../middleware/apiKeyAuth.js';
import { createSessionLimiter } from '../middleware/rateLimiter.js';
import {
  createInterviewSession,
  getSession,
  getSessionTranscript,
  createSessionEvent,
} from '../services/sessionService.js';
import { REST_ERROR_CODES } from '@ai-interview/shared';

// ============================================
// SESSION ROUTES
// ============================================

const router: RouterType = Router();

// ---------- POST /sessions ----------

router.post(
  '/',
  createSessionLimiter,
  validateApiKey,
  validateBody(createSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateSessionBody;

      const response = await createInterviewSession({
        assessment: body.assessment,
        questions: body.questions,
        candidate: body.candidate,
        settings: body.settings,
        externalId: body.externalId,
        callbackUrl: body.callbackUrl,
      });

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating session:', error);
      next(error);
    }
  }
);

// ---------- GET /sessions/:sessionId ----------

router.get(
  '/:sessionId',
  validateParams(sessionIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as unknown as SessionIdParams;

      const response = await getSession(sessionId);

      if (!response) {
        res.status(404).json({
          success: false,
          error: {
            code: REST_ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Değerlendirme oturumu bulunamadı',
          },
        });
        return;
      }

      res.json(response);
    } catch (error) {
      console.error('Error getting session:', error);
      next(error);
    }
  }
);

// ---------- GET /sessions/:sessionId/transcript ----------

router.get(
  '/:sessionId/transcript',
  validateParams(sessionIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as unknown as SessionIdParams;

      const response = await getSessionTranscript(sessionId);

      if (!response) {
        res.status(404).json({
          success: false,
          error: {
            code: REST_ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Değerlendirme oturumu bulunamadı',
          },
        });
        return;
      }

      if (response.data.status !== 'completed') {
        res.status(400).json({
          success: false,
          error: {
            code: REST_ERROR_CODES.SESSION_NOT_COMPLETED,
            message: 'Değerlendirme henüz tamamlanmadı',
          },
        });
        return;
      }

      res.json(response);
    } catch (error) {
      console.error('Error getting transcript:', error);
      next(error);
    }
  }
);

// ---------- POST /sessions/:sessionId/disconnect ----------

router.post(
  '/:sessionId/disconnect',
  validateParams(sessionIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params as unknown as SessionIdParams;
      const { reason } = req.body || {};

      await createSessionEvent({
        sessionId,
        eventType: 'browser_close_detected',
        eventData: {
          reason: reason || 'browser_close',
          method: 'beacon',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error logging disconnect event:', error);
      res.status(200).json({ success: true });
    }
  }
);

export default router;
