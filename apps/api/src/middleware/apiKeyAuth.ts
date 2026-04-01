import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

// ============================================
// API KEY AUTH MIDDLEWARE
// ============================================

/**
 * ATS/MatchMind istekleri için API key doğrulama middleware'i.
 * X-API-Key header'ını config.atsApiKey ile karşılaştırır.
 *
 * Kullanım: POST /sessions endpoint'inde (server-to-server)
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key',
      },
    });
    return;
  }

  if (apiKey !== config.atsApiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
    return;
  }

  next();
}
