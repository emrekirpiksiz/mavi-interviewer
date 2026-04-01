import { Router, type Request, type Response } from 'express';
import type { Router as RouterType } from 'express';
import { testConnection } from '../db/index.js';
import { config } from '../config/index.js';

const router: RouterType = Router();

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  services: {
    database: 'ok' | 'error' | 'not_configured';
    websocket: 'ok' | 'not_started';
  };
}

interface PingResponse {
  pong: true;
  serverTime: number;
  timestamp: string;
}

// Full health check with database
router.get('/', async (_req: Request, res: Response<HealthResponse>) => {
  let dbStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';

  if (config.databaseUrl) {
    try {
      const connected = await testConnection();
      dbStatus = connected ? 'ok' : 'error';
    } catch {
      dbStatus = 'error';
    }
  }

  const response: HealthResponse = {
    status: dbStatus === 'error' ? 'error' : 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      websocket: 'not_started', // Will be updated in Task 3.1
    },
  };

  res.json(response);
});

// Lightweight ping endpoint for latency measurement
router.get('/ping', (_req: Request, res: Response<PingResponse>) => {
  res.json({
    pong: true,
    serverTime: Date.now(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
