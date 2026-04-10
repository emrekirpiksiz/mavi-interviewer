import { Router } from 'express';
import type { Router as RouterType } from 'express';
import healthRouter from './health.js';
import sessionsRouter from './sessions.js';
import transcribeRouter from './transcribe.js';
import demoSessionRouter from './demo-session.js';
import videoUploadRouter from './videoUpload.js';

const router: RouterType = Router();

router.use('/health', healthRouter);
router.use('/sessions', sessionsRouter);
router.use('/sessions', videoUploadRouter);
router.use('/demo-session', demoSessionRouter);
router.use('/transcribe', transcribeRouter);

export default router;
