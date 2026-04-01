import { Router } from 'express';
import type { Router as RouterType } from 'express';
import healthRouter from './health.js';
import sessionsRouter from './sessions.js';
import mockAtsRouter from './mock-ats.js';
import transcribeRouter from './transcribe.js';
import demoSessionRouter from './demo-session.js';
import videoUploadRouter from './videoUpload.js';

const router: RouterType = Router();

// Health check
router.use('/health', healthRouter);

// Session management
router.use('/sessions', sessionsRouter);

// Video upload (mounted under /sessions for REST consistency)
router.use('/sessions', videoUploadRouter);

// Demo session (access code protected)
router.use('/demo-session', demoSessionRouter);

// Mock ATS (for testing)
router.use('/mock-ats', mockAtsRouter);

// Whisper transcription
router.use('/transcribe', transcribeRouter);

export default router;
