import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { transcribeLimiter } from '../middleware/rateLimiter.js';
import { saveChunk, updateChunkDuration } from '../services/audioRecordingService.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================
// WHISPER TRANSCRIPTION ENDPOINT
// ============================================

const router: Router = Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
  },
});

// Initialize OpenAI client (uses same API key as Claude - or separate)
const openai = new OpenAI({
  apiKey: config.openaiApiKey || config.anthropicApiKey,
});

/**
 * POST /transcribe
 * Transcribe audio using OpenAI Whisper
 * Rate limited: 30 req/dk per IP
 */
router.post('/', transcribeLimiter, upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    const language = (req.body.language as string) || 'tr';
    const contextPrompt = (req.body.prompt as string) || '';
    const sessionId = (req.body.sessionId as string) || '';
    const timestampMs = parseInt(req.body.timestampMs || '0', 10);
    const inputSize = req.file.size;
    
    console.log(`[Transcribe] Processing audio: ${inputSize} bytes, language: ${language}`);

    // Audio chunk'ı recording için kaydet (fire-and-forget, hata interview'ı etkilemesin)
    if (sessionId) {
      try {
        await saveChunk(sessionId, req.file.buffer, timestampMs);
      } catch (err) {
        console.error(`[Transcribe] saveChunk error for session ${sessionId}:`, err);
      }
    }

    // Write buffer to temp file (Whisper API requires file)
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `whisper-${Date.now()}.webm`);
    fs.writeFileSync(tempFile, req.file.buffer);

    try {
      // Build prompt for better transcription accuracy
      // Include Turkish context and common interview terminology
      const basePrompt = language === 'tr' 
        ? 'Bu bir iş görüşmesi kaydıdır. Türkçe konuşulmaktadır. Şirket isimleri, pozisyonlar ve teknik terimler doğru yazılmalıdır.'
        : 'This is a job interview recording.';
      
      const fullPrompt = contextPrompt 
        ? `${basePrompt} Bağlam: ${contextPrompt}`
        : basePrompt;

      // Call Whisper API with verbose_json to get actual duration
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
        language: language,
        response_format: 'verbose_json',
        prompt: fullPrompt,
        temperature: 0,
      });

      const durationMs = Date.now() - startTime;
      
      // Extract text and duration from verbose_json response
      let transcriptText = transcription.text || '';
      const audioLengthSeconds = transcription.duration || 0;
      const audioLengthMs = Math.round(audioLengthSeconds * 1000);
      
      // Whisper'dan gelen duration'ı manifest'e yaz
      if (sessionId && audioLengthMs > 0) {
        updateChunkDuration(sessionId, audioLengthMs);
      }

      // --- Hallucination detection ---
      const segments = (transcription as any).segments || [];
      const avgNoSpeechProb = segments.length > 0
        ? segments.reduce((sum: number, s: any) => sum + (s.no_speech_prob || 0), 0) / segments.length
        : 0;

      const HALLUCINATION_PATTERNS = [
        /^altyaz[ıi]/i,
        /^(alt yazı|altyazılar|subtitles)/i,
        /^\.{3,}$/,
        /^www\./i,
        /^https?:\/\//i,
      ];
      const isKnownHallucination = HALLUCINATION_PATTERNS.some(p => p.test(transcriptText.trim()));

      if (avgNoSpeechProb > 0.7) {
        console.warn(`[Transcribe] High no_speech_prob (${avgNoSpeechProb.toFixed(2)}), discarding: "${transcriptText.substring(0, 50)}"`);
        transcriptText = '';
      } else if (isKnownHallucination) {
        console.warn(`[Transcribe] Hallucination pattern detected: "${transcriptText.substring(0, 50)}"`);
        transcriptText = '';
      }

      const outputSize = transcriptText.length;
      console.log(`[Transcribe] Result (${durationMs}ms): "${transcriptText.substring(0, 100)}${transcriptText.length > 100 ? '...' : ''}" (${audioLengthSeconds.toFixed(1)}s audio, noSpeech: ${avgNoSpeechProb.toFixed(2)})`);

      res.json({
        success: true,
        text: transcriptText,
        metric: {
          service: 'whisper',
          operation: 'speech_to_text',
          durationMs,
          inputSize,
          outputSize,
          model: 'whisper-1',
          audioLengthMs: audioLengthMs,
        },
      });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('[Transcribe] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Transcription failed',
    });
  }
});

export default router;
