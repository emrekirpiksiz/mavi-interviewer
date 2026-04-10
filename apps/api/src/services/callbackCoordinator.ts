import { connectionManager } from '../websocket/connectionManager.js';
import { sendAssessmentCallback } from './callbackService.js';

// ============================================
// CALLBACK COORDINATOR
// ============================================
// Waits for audio + video uploads to complete before sending
// the callback to the admin application, so all data (media
// URLs, camera violations, transcript) goes in a single POST.
//
// RACE-CONDITION HANDLING:
// markAudioReady / markVideoReady may be called BEFORE
// registerPendingCallback (e.g. video commit arrives before
// the interview:end handler registers the coordinator entry).
// Early signals are stored in earlyReady and merged when
// registerPendingCallback is eventually called.

interface PendingCallback {
  audioReady: boolean;
  videoReady: boolean;
  videoExpected: boolean;
  audioExpected: boolean;
  timeout: NodeJS.Timeout;
}

const pendingCallbacks = new Map<string, PendingCallback>();

// Tracks readiness signals that arrived before registerPendingCallback
const earlyReady = new Map<string, { audio: boolean; video: boolean }>();

const CALLBACK_TIMEOUT_MS = 120_000; // 2 minutes max wait
const EARLY_READY_TTL_MS = 30_000; // clean up stale early signals after 30s

export function registerPendingCallback(
  sessionId: string,
  options: { audioExpected: boolean; videoExpected: boolean }
): void {
  const existing = pendingCallbacks.get(sessionId);
  if (existing) {
    clearTimeout(existing.timeout);
  }

  const timeout = setTimeout(() => {
    console.warn(`[CallbackCoordinator] Timeout for session ${sessionId}, sending callback with available data`);
    triggerCallback(sessionId);
  }, CALLBACK_TIMEOUT_MS);

  // Merge any early readiness signals
  const early = earlyReady.get(sessionId);
  earlyReady.delete(sessionId);

  const pending: PendingCallback = {
    audioReady: !options.audioExpected || (early?.audio ?? false),
    videoReady: !options.videoExpected || (early?.video ?? false),
    audioExpected: options.audioExpected,
    videoExpected: options.videoExpected,
    timeout,
  };

  pendingCallbacks.set(sessionId, pending);

  const earlyNote = early ? ` (early signals: audio=${early.audio}, video=${early.video})` : '';
  console.log(`[CallbackCoordinator] Registered for session ${sessionId} (audio: ${options.audioExpected}, video: ${options.videoExpected})${earlyNote}`);

  checkAndTrigger(sessionId);
}

export function markAudioReady(sessionId: string): void {
  const pending = pendingCallbacks.get(sessionId);
  if (!pending) {
    // Arrived before registerPendingCallback — store for later
    const entry = earlyReady.get(sessionId) || { audio: false, video: false };
    entry.audio = true;
    earlyReady.set(sessionId, entry);
    console.log(`[CallbackCoordinator] Audio ready (early) for session ${sessionId}`);
    scheduleEarlyCleanup(sessionId);
    return;
  }
  pending.audioReady = true;
  console.log(`[CallbackCoordinator] Audio ready for session ${sessionId}`);
  checkAndTrigger(sessionId);
}

export function markVideoReady(sessionId: string): void {
  const pending = pendingCallbacks.get(sessionId);
  if (!pending) {
    // Arrived before registerPendingCallback — store for later
    const entry = earlyReady.get(sessionId) || { audio: false, video: false };
    entry.video = true;
    earlyReady.set(sessionId, entry);
    console.log(`[CallbackCoordinator] Video ready (early) for session ${sessionId}`);
    scheduleEarlyCleanup(sessionId);
    return;
  }
  pending.videoReady = true;
  console.log(`[CallbackCoordinator] Video ready for session ${sessionId}`);
  checkAndTrigger(sessionId);
}

function checkAndTrigger(sessionId: string): void {
  const pending = pendingCallbacks.get(sessionId);
  if (!pending) return;

  if (pending.audioReady && pending.videoReady) {
    triggerCallback(sessionId);
  }
}

async function triggerCallback(sessionId: string): Promise<void> {
  const pending = pendingCallbacks.get(sessionId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingCallbacks.delete(sessionId);

  console.log(`[CallbackCoordinator] Triggering callback for session ${sessionId}`);

  try {
    const result = await sendAssessmentCallback(sessionId);
    if (result.debug) {
      connectionManager.send(sessionId, {
        event: 'callback:debug',
        data: result.debug,
      });
    }
  } catch (error) {
    console.error(`[CallbackCoordinator] Callback error for session ${sessionId}:`, error);
    connectionManager.send(sessionId, {
      event: 'callback:debug',
      data: {
        requestPayload: null,
        responseStatus: null,
        responseBody: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: 0,
      },
    });
  }
}

export function hasPendingCallback(sessionId: string): boolean {
  return pendingCallbacks.has(sessionId);
}

// ---------- Helpers ----------

function scheduleEarlyCleanup(sessionId: string): void {
  setTimeout(() => {
    if (earlyReady.has(sessionId)) {
      console.warn(`[CallbackCoordinator] Cleaning up stale early signal for session ${sessionId}`);
      earlyReady.delete(sessionId);
    }
  }, EARLY_READY_TTL_MS);
}
