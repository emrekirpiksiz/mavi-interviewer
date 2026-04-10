import { createWebhookLog } from '../db/queries/webhookLogs.js';
import { getSessionTranscript, getSessionWithConfig } from './sessionService.js';
import { getCameraViolationEvents, getMediaUrls } from '../db/queries/sessions.js';
import type { TranscriptEntryResponse } from '@ai-interview/shared';

// ============================================
// CALLBACK SERVICE - POST RESULTS TO ADMIN APP
// ============================================

// ---------- Types ----------

type CallbackTranscriptType = 'intro' | 'free' | 'question' | 'answer' | 'correction' | 'closing';

interface CallbackTranscriptEntry {
  speaker: 'avatar' | 'candidate';
  text: string;
  timestamp: string;
  type: CallbackTranscriptType;
  questionId?: string;
}

interface CallbackCameraViolation {
  type: string;
  label: string;
  timestampSeconds: number;
}

interface CallbackPayload {
  sessionId: string;
  externalId: string | null;
  status: 'completed';
  completedAt: string;
  duration: string;
  transcript: CallbackTranscriptEntry[];
  media: {
    videoUrl: string | null;
    audioUrl: string | null;
  };
  cameraViolations: CallbackCameraViolation[];
}

// ---------- Constants ----------

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const CAMERA_VIOLATION_LABELS: Record<string, string> = {
  camera_face_lost: 'Yüz Algılanmadı',
  camera_gaze_away: 'Göz Kaçırma',
  camera_multi_face: 'Birden Fazla Kişi',
};

const CAMERA_VIOLATION_TYPE_MAP: Record<string, string> = {
  camera_face_lost: 'no_face',
  camera_gaze_away: 'eye_contact_lost',
  camera_multi_face: 'multiple_people',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Helpers ----------

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function minutesToDuration(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const diffMs = Math.max(0, end - start);
  return msToTimestamp(diffMs);
}

/**
 * Transcript entry'lerini admin uygulamasının beklediği formata dönüştürür.
 * type belirleme mantığı (öncelik sırası):
 * - AI + closing phase → closing
 * - AI + questionContext (ilk kez) → question
 * - AI + questionContext (tekrar) → correction
 * - AI + questionContext yok + intro/herhangi phase → intro
 * - Candidate + önceki AI sorusunun questionId'si → answer
 * - Candidate + questionContext yok → free
 */
function transformTranscript(entries: TranscriptEntryResponse[]): CallbackTranscriptEntry[] {
  const seenQuestionIds = new Set<string>();
  let currentQuestionId: string | null = null;

  return entries.map((entry) => {
    const speaker = entry.speaker === 'ai' ? 'avatar' as const : 'candidate' as const;
    const timestamp = msToTimestamp(entry.timestampMs);

    if (entry.speaker === 'ai') {
      if (entry.phase === 'closing') {
        currentQuestionId = null;
        return { speaker, text: entry.content, timestamp, type: 'closing' as const };
      }

      if (entry.questionContext) {
        if (seenQuestionIds.has(entry.questionContext)) {
          return {
            speaker, text: entry.content, timestamp,
            type: 'correction' as const,
            questionId: entry.questionContext,
          };
        }
        seenQuestionIds.add(entry.questionContext);
        currentQuestionId = entry.questionContext;
        return {
          speaker, text: entry.content, timestamp,
          type: 'question' as const,
          questionId: entry.questionContext,
        };
      }

      return { speaker, text: entry.content, timestamp, type: 'intro' as const };
    }

    // Candidate
    if (currentQuestionId) {
      const result: CallbackTranscriptEntry = {
        speaker, text: entry.content, timestamp,
        type: 'answer' as const,
        questionId: currentQuestionId,
      };
      return result;
    }

    return { speaker, text: entry.content, timestamp, type: 'free' as const };
  });
}

// ---------- Types (exported for debug) ----------

export interface CallbackDebugInfo {
  requestPayload: CallbackPayload;
  responseStatus: number | null;
  responseBody: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
}

// ---------- Main Function ----------

export async function sendAssessmentCallback(sessionId: string): Promise<{ success: boolean; error?: string; debug?: CallbackDebugInfo }> {
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    console.log(`[Callback] Session ${sessionId} not found, skipping callback`);
    return { success: false, error: 'Session not found' };
  }

  const { session } = sessionData;

  if (!session.callbackUrl) {
    console.log(`[Callback] No callbackUrl for session ${sessionId}, skipping`);
    return { success: true };
  }

  const transcriptResponse = await getSessionTranscript(sessionId);
  if (!transcriptResponse) {
    console.error(`[Callback] Transcript not found for session ${sessionId}`);
    return { success: false, error: 'Transcript not found' };
  }

  const transcript = transcriptResponse.data;

  const [mediaUrls, cameraEvents] = await Promise.all([
    getMediaUrls(sessionId),
    getCameraViolationEvents(sessionId),
  ]);

  const cameraViolations: CallbackCameraViolation[] = cameraEvents.map(event => ({
    type: CAMERA_VIOLATION_TYPE_MAP[event.event_type] || event.event_type,
    label: CAMERA_VIOLATION_LABELS[event.event_type] || event.event_type,
    timestampSeconds: event.event_data?.interviewSecond ?? 0,
  }));

  const payload: CallbackPayload = {
    sessionId,
    externalId: session.externalId,
    status: 'completed',
    completedAt: session.endedAt || new Date().toISOString(),
    duration: (transcript.duration.startedAt && transcript.duration.endedAt)
      ? minutesToDuration(transcript.duration.startedAt, transcript.duration.endedAt)
      : '00:00',
    transcript: transformTranscript(transcript.entries),
    media: {
      videoUrl: mediaUrls.videoUrl,
      audioUrl: mediaUrls.audioUrl,
    },
    cameraViolations,
  };

  console.log(`[Callback] Sending results (${payload.transcript.length} entries, ${cameraViolations.length} violations) to ${session.callbackUrl}`);

  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(session.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      let responseBody: Record<string, unknown> | null = null;

      try {
        responseBody = await response.json() as Record<string, unknown>;
      } catch {
        // Response might not be JSON
      }

      const success = response.ok;

      await createWebhookLog({
        sessionId,
        webhookType: 'assessment_callback',
        endpointUrl: session.callbackUrl,
        requestBody: payload as unknown as Record<string, unknown>,
        responseStatus: response.status,
        responseBody,
        durationMs,
        success,
        errorMessage: success ? null : `HTTP ${response.status}`,
        retryCount,
      });

      if (success) {
        console.log(`[Callback] Successfully sent to ${session.callbackUrl} (${durationMs}ms)`);
        return {
          success: true,
          debug: { requestPayload: payload, responseStatus: response.status, responseBody, success: true, durationMs },
        };
      }

      if (response.status >= 400 && response.status < 500) {
        console.error(`[Callback] Client error ${response.status} for session ${sessionId}`);
        return {
          success: false,
          error: `HTTP ${response.status}`,
          debug: { requestPayload: payload, responseStatus: response.status, responseBody, success: false, error: `HTTP ${response.status}`, durationMs },
        };
      }

      lastError = new Error(`HTTP ${response.status}`);
      retryCount++;

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        console.warn(`[Callback] Retry ${retryCount}/${MAX_RETRIES} in ${delayMs}ms`);
        await sleep(delayMs);
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await createWebhookLog({
        sessionId,
        webhookType: 'assessment_callback',
        endpointUrl: session.callbackUrl,
        requestBody: payload as unknown as Record<string, unknown>,
        responseStatus: null,
        responseBody: null,
        durationMs,
        success: false,
        errorMessage,
        retryCount,
      });

      lastError = error instanceof Error ? error : new Error(errorMessage);
      retryCount++;

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        console.warn(`[Callback] Retry ${retryCount}/${MAX_RETRIES} after error: ${errorMessage}`);
        await sleep(delayMs);
      }
    }
  }

  console.error(`[Callback] Failed after ${MAX_RETRIES} retries for session ${sessionId}:`, lastError?.message);
  return {
    success: false,
    error: lastError?.message || 'Max retries exceeded',
    debug: { requestPayload: payload, responseStatus: null, responseBody: null, success: false, error: lastError?.message || 'Max retries exceeded', durationMs: 0 },
  };
}
