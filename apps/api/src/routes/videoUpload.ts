import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import multer from 'multer';
import { sessionIdParamSchema, validateParams } from '../middleware/validation.js';
import { getSessionById } from '../db/queries/sessions.js';
import { processVideoUpload } from '../services/videoRecordingService.js';
import { REST_ERROR_CODES } from '@ai-interview/shared';

// ============================================
// VIDEO UPLOAD ENDPOINT
// ============================================

const router: RouterType = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max (video can be large)
  },
});

// POST /sessions/:sessionId/video
router.post(
  '/:sessionId/video',
  validateParams(sessionIdParamSchema),
  upload.single('video'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params as unknown as { sessionId: string };

      const session = await getSessionById(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: {
            code: REST_ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Görüşme bulunamadı',
          },
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_VIDEO',
            message: 'Video dosyası gerekli',
          },
        });
        return;
      }

      // Upload asynchronously, return immediately
      processVideoUpload(sessionId, req.file.buffer).catch((err) => {
        console.error(`[VideoUpload] Background processing failed for ${sessionId}:`, err);
      });

      res.status(202).json({
        success: true,
        data: {
          message: 'Video kaydı yükleme başlatıldı',
          sessionId,
        },
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      next(error);
    }
  }
);

export default router;
