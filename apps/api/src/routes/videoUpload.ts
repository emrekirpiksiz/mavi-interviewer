import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import multer from 'multer';
import { sessionIdParamSchema, validateParams } from '../middleware/validation.js';
import { getSessionById } from '../db/queries/sessions.js';
import { stageVideoChunk, commitVideoUpload } from '../services/videoRecordingService.js';
import { REST_ERROR_CODES } from '@ai-interview/shared';

// ============================================
// VIDEO UPLOAD ENDPOINTS — CHUNKED
// ============================================
// Two-phase upload: stage individual chunks during the interview,
// then commit all blocks at the end.

const router: RouterType = Router();

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per chunk (5s @ 1Mbps ≈ 625KB, generous headroom)
  },
});

// ---------- POST /sessions/:sessionId/video/chunk?seq=N ----------

router.post(
  '/:sessionId/video/chunk',
  validateParams(sessionIdParamSchema),
  chunkUpload.single('chunk'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as unknown as { sessionId: string };
      const seq = parseInt(req.query['seq'] as string, 10);

      if (isNaN(seq) || seq < 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_SEQ', message: 'seq query parameter is required and must be a non-negative integer' },
        });
        return;
      }

      const session = await getSessionById(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: { code: REST_ERROR_CODES.SESSION_NOT_FOUND, message: 'Görüşme bulunamadı' },
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_CHUNK', message: 'Video chunk verisi gerekli' },
        });
        return;
      }

      await stageVideoChunk(sessionId, seq, req.file.buffer);

      res.status(202).json({
        success: true,
        data: { sessionId, seq, size: req.file.buffer.length },
      });
    } catch (error) {
      console.error('Error staging video chunk:', error);
      next(error);
    }
  }
);

// ---------- POST /sessions/:sessionId/video/commit ----------

router.post(
  '/:sessionId/video/commit',
  validateParams(sessionIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as unknown as { sessionId: string };

      const session = await getSessionById(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: { code: REST_ERROR_CODES.SESSION_NOT_FOUND, message: 'Görüşme bulunamadı' },
        });
        return;
      }

      const videoUrl = await commitVideoUpload(sessionId);

      res.status(200).json({
        success: true,
        data: { sessionId, videoUrl },
      });
    } catch (error) {
      console.error('Error committing video:', error);
      next(error);
    }
  }
);

export default router;
