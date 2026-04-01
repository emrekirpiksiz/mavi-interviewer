import { config } from '../config/index.js';
import { createWebhookLog, type WebhookType } from '../db/queries/webhookLogs.js';
import { getCameraViolationEvents } from '../db/queries/sessions.js';
import { getSessionTranscript, getSessionWithConfig } from './sessionService.js';
import type { CameraViolation, CameraViolationReport, CameraViolationType } from '@ai-interview/shared';

// ============================================
// MATCHMIND (HR PORTAL) API SERVICE
// ============================================

// ---------- Types ----------

export type MatchMindStatus = 'in_progress' | 'completed' | 'technical_error';

interface MatchMindStatusRequest {
  session_id: string;
  status: MatchMindStatus;
  duration_seconds?: number;
}

interface MatchMindTransactionSession {
  sessionId: string;
  candidateName: string;
  positionTitle: string;
  companyName: string;
  duration: string; // "30:47" format
}

interface MatchMindTransactionEntry {
  speaker: 'ai' | 'candidate';
  content: string;
  phase: string;
  timestamp: string; // ISO 8601
}

interface MatchMindTransactionRequest {
  session_id: string;
  transaction: {
    session: MatchMindTransactionSession;
    entries: MatchMindTransactionEntry[];
    camera_violations?: CameraViolationReport;
  };
}

interface MatchMindResponse {
  success: boolean;
  data?: {
    interview_id?: string;
    status?: string;
    scoring_status?: string;
    ai_score?: number;
  };
  error?: string;
  details?: unknown[];
}

// ---------- Constants ----------

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000]; // Exponential backoff

// ---------- Helper Functions ----------

/**
 * Create Basic Auth header value
 */
function createBasicAuthHeader(): string {
  const credentials = `${config.matchmindWebhookUsername}:${config.matchmindWebhookPassword}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

/**
 * Check if MatchMind integration is configured
 */
export function isMatchMindConfigured(): boolean {
  const isConfigured = !!(
    config.matchmindApiUrl &&
    config.matchmindWebhookUsername &&
    config.matchmindWebhookPassword
  );
  
  if (!isConfigured) {
    console.log('[MatchMind] Configuration check:', {
      hasApiUrl: !!config.matchmindApiUrl,
      hasUsername: !!config.matchmindWebhookUsername,
      hasPassword: !!config.matchmindWebhookPassword,
      apiUrl: config.matchmindApiUrl || '(not set)',
    });
  }
  
  return isConfigured;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration from seconds to "MM:SS" format
 */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Make HTTP request to MatchMind API with retry logic
 */
async function makeMatchMindRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
  sessionId: string,
  webhookType: WebhookType
): Promise<{ success: boolean; data?: T; error?: string; statusCode?: number }> {
  const url = `${config.matchmindApiUrl}${endpoint}`;
  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': createBasicAuthHeader(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      const durationMs = Date.now() - startTime;
      let responseBody: MatchMindResponse | null = null;

      try {
        responseBody = await response.json() as MatchMindResponse;
      } catch {
        // Response might not be JSON
      }

      const success = response.ok;

      // Log the webhook call
      await createWebhookLog({
        sessionId,
        webhookType,
        endpointUrl: url,
        requestBody: body,
        responseStatus: response.status,
        responseBody: responseBody as Record<string, unknown> | null,
        durationMs,
        success,
        errorMessage: success ? null : (responseBody?.error || `HTTP ${response.status}`),
        retryCount,
      });

      if (success) {
        console.log(`[MatchMind] ${webhookType} request successful for session ${sessionId} (${durationMs}ms)`);
        return { success: true, data: responseBody as T, statusCode: response.status };
      }

      // Don't retry 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        console.error(`[MatchMind] ${webhookType} client error for session ${sessionId}: ${response.status}`);
        return { 
          success: false, 
          error: responseBody?.error || `HTTP ${response.status}`,
          statusCode: response.status 
        };
      }

      // 5xx errors - will retry
      lastError = new Error(`HTTP ${response.status}`);
      retryCount++;
      
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        console.warn(`[MatchMind] ${webhookType} retry ${retryCount}/${MAX_RETRIES} for session ${sessionId} in ${delayMs}ms`);
        await sleep(delayMs);
      }
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed attempt
      await createWebhookLog({
        sessionId,
        webhookType,
        endpointUrl: url,
        requestBody: body,
        responseStatus: null,
        responseBody: null,
        durationMs,
        success: false,
        errorMessage,
        retryCount,
      });

      lastError = error instanceof Error ? error : new Error(errorMessage);
      retryCount++;
      
      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        console.warn(`[MatchMind] ${webhookType} retry ${retryCount}/${MAX_RETRIES} for session ${sessionId} after error: ${errorMessage}`);
        await sleep(delayMs);
      }
    }
  }

  console.error(`[MatchMind] ${webhookType} failed after ${MAX_RETRIES} retries for session ${sessionId}:`, lastError?.message);
  return { success: false, error: lastError?.message || 'Max retries exceeded' };
}

// ---------- Camera Violations ----------

const EVENT_TYPE_TO_VIOLATION: Record<string, CameraViolationType> = {
  camera_face_lost: 'face_lost',
  camera_gaze_away: 'gaze_away',
  camera_multi_face: 'multi_face',
};

async function buildCameraViolationReport(sessionId: string): Promise<CameraViolationReport> {
  const rows = await getCameraViolationEvents(sessionId);

  const violations: CameraViolation[] = rows.map((row) => ({
    type: EVENT_TYPE_TO_VIOLATION[row.event_type] ?? 'face_lost',
    interviewSecond: row.event_data?.interviewSecond ?? 0,
    timestamp: row.created_at.toISOString(),
  }));

  const summary = {
    faceLostCount: violations.filter((v) => v.type === 'face_lost').length,
    gazeAwayCount: violations.filter((v) => v.type === 'gaze_away').length,
    multiFaceCount: violations.filter((v) => v.type === 'multi_face').length,
    totalViolations: violations.length,
  };

  return { violations, summary };
}

// ---------- Public API Functions ----------

/**
 * Send status update to MatchMind
 * Called when interview starts (in_progress) or ends (completed/technical_error)
 */
export async function sendStatusUpdate(
  sessionId: string,
  status: MatchMindStatus,
  durationSeconds?: number
): Promise<{ success: boolean; error?: string }> {
  if (!isMatchMindConfigured()) {
    console.log(`[MatchMind] Skipping status update - not configured`);
    return { success: true }; // Don't fail if not configured
  }

  const requestBody: MatchMindStatusRequest = {
    session_id: sessionId,
    status,
  };

  if (durationSeconds !== undefined) {
    requestBody.duration_seconds = durationSeconds;
  }

  console.log(`[MatchMind] Sending status update: ${status} for session ${sessionId}`);

  const result = await makeMatchMindRequest<MatchMindResponse>(
    '/status',
    requestBody as unknown as Record<string, unknown>,
    sessionId,
    'matchmind_status'
  );

  return result;
}

/**
 * Send transaction (transcript) to MatchMind
 * Called when interview completes successfully
 */
export async function sendTransaction(
  sessionId: string
): Promise<{ success: boolean; error?: string; aiScore?: number }> {
  if (!isMatchMindConfigured()) {
    console.log(`[MatchMind] Skipping transaction - not configured`);
    return { success: true }; // Don't fail if not configured
  }

  console.log(`[MatchMind] Preparing transaction for session ${sessionId}`);

  // Get session data and transcript
  const sessionData = await getSessionWithConfig(sessionId);
  if (!sessionData) {
    console.error(`[MatchMind] Session not found: ${sessionId}`);
    return { success: false, error: 'Session not found' };
  }

  const transcriptResponse = await getSessionTranscript(sessionId);
  if (!transcriptResponse) {
    console.error(`[MatchMind] Transcript not found for session: ${sessionId}`);
    return { success: false, error: 'Transcript not found' };
  }

  const { session, config: interviewConfig } = sessionData;
  const transcript = transcriptResponse.data;

  // Calculate duration in seconds
  let durationSeconds = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    durationSeconds = Math.round((end - start) / 1000);
  }

  // Build transaction request
  const transactionSession: MatchMindTransactionSession = {
    sessionId: sessionId,
    candidateName: interviewConfig.candidateData.name,
    positionTitle: interviewConfig.positionData.title,
    companyName: interviewConfig.positionData.company.name,
    duration: formatDuration(durationSeconds),
  };

  // Map transcript entries to MatchMind format
  const entries: MatchMindTransactionEntry[] = transcript.entries.map(entry => {
    // Calculate timestamp from session start
    let timestamp: string;
    if (session.startedAt && entry.timestampMs) {
      const entryTime = new Date(new Date(session.startedAt).getTime() + entry.timestampMs);
      timestamp = entryTime.toISOString();
    } else {
      timestamp = new Date().toISOString();
    }

    // Map phase names (our 'behavioral' -> matchmind 'soft_skills')
    let phase: string = entry.phase;
    if (phase === 'behavioral') {
      phase = 'soft_skills';
    }
    // 'motivation' phase doesn't exist in MatchMind, map to 'soft_skills'
    if (phase === 'motivation') {
      phase = 'soft_skills';
    }

    return {
      speaker: entry.speaker as 'ai' | 'candidate',
      content: entry.content,
      phase,
      timestamp,
    };
  });

  // Build camera violation report
  const cameraViolations = await buildCameraViolationReport(sessionId);

  const requestBody: MatchMindTransactionRequest = {
    session_id: sessionId,
    transaction: {
      session: transactionSession,
      entries,
      ...(cameraViolations.summary.totalViolations > 0 && { camera_violations: cameraViolations }),
    },
  };

  console.log(`[MatchMind] Sending transaction with ${entries.length} entries, ${cameraViolations.summary.totalViolations} camera violations for session ${sessionId}`);

  const result = await makeMatchMindRequest<MatchMindResponse>(
    '/transaction',
    requestBody as unknown as Record<string, unknown>,
    sessionId,
    'matchmind_transaction'
  );

  if (result.success && result.data?.data?.ai_score !== undefined) {
    return { success: true, aiScore: result.data.data.ai_score };
  }

  return result;
}

/**
 * Send both status update and transaction when interview completes
 * This is a convenience function that ensures proper order
 */
export async function notifyInterviewCompleted(
  sessionId: string,
  durationSeconds: number
): Promise<void> {
  if (!isMatchMindConfigured()) {
    console.log(`[MatchMind] Skipping completion notification - not configured`);
    return;
  }

  // Fire and forget - don't block the interview flow
  (async () => {
    try {
      // 1. Send status update first
      await sendStatusUpdate(sessionId, 'completed', durationSeconds);
      
      // 2. Then send transaction
      const transactionResult = await sendTransaction(sessionId);
      
      if (transactionResult.aiScore !== undefined) {
        console.log(`[MatchMind] AI score received for session ${sessionId}: ${transactionResult.aiScore}`);
      }
    } catch (error) {
      console.error(`[MatchMind] Error in completion notification for session ${sessionId}:`, error);
    }
  })();
}

/**
 * Notify MatchMind when interview starts
 */
export async function notifyInterviewStarted(sessionId: string): Promise<void> {
  if (!isMatchMindConfigured()) {
    console.log(`[MatchMind] Skipping start notification - not configured`);
    return;
  }

  // Fire and forget - don't block the interview flow
  sendStatusUpdate(sessionId, 'in_progress').catch(error => {
    console.error(`[MatchMind] Error sending start notification for session ${sessionId}:`, error);
  });
}

/**
 * Notify MatchMind when interview fails with technical error
 */
export async function notifyInterviewError(sessionId: string): Promise<void> {
  if (!isMatchMindConfigured()) {
    console.log(`[MatchMind] Skipping error notification - not configured`);
    return;
  }

  // Fire and forget - don't block the interview flow
  sendStatusUpdate(sessionId, 'technical_error').catch(error => {
    console.error(`[MatchMind] Error sending error notification for session ${sessionId}:`, error);
  });
}
