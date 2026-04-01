import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import routes from './routes/index.js';

// ============================================
// EXPRESS APP SETUP
// ============================================

export function createApp(): Express {
  const app = express();

  // ---------- MIDDLEWARE ----------

  // Trust proxy (Railway, Docker, reverse proxy arkasında çalışırken gerekli)
  app.set('trust proxy', 1);

  // CORS
  app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
  }));

  // JSON body parser (1MB limit)
  app.use(express.json({ limit: '1mb' }));

  // Global rate limiter (100 req/dk per IP)
  app.use(globalLimiter);

  // Request logging (development only)
  if (config.isDevelopment) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
      next();
    });
  }

  // ---------- ROUTES ----------

  // Mount routes at root level (backward compatibility for scripts)
  app.use(routes);
  
  // Also mount under /api prefix (standard API convention)
  app.use('/api', routes);

  // ---------- ERROR HANDLING ----------

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: config.isDevelopment ? err.message : 'Internal server error',
      },
    });
  });

  return app;
}
