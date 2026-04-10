import { BlobServiceClient } from '@azure/storage-blob';
import { config } from '../config/index.js';
import { createSessionEvent } from '../db/queries/sessions.js';
import { connectionManager } from '../websocket/connectionManager.js';
import type { WSVideoRecordingStatusEvent, VideoRecordingStatus } from '@ai-interview/shared';

// ============================================
// VIDEO RECORDING SERVICE — CHUNKED UPLOAD
// ============================================
// Uses Azure Block Blob staged upload: each video chunk is staged
// independently via stageBlock during the interview, then all blocks
// are committed with commitBlockList when the interview ends.
// This eliminates the large single-upload at the end.

const AZURE_VIDEO_CONTAINER = 'interview-videos';
const STALE_UPLOAD_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// ---------- In-memory state ----------

interface PendingVideoUpload {
  sessionId: string;
  blockIds: string[];
  totalBytes: number;
  startedAt: number;
}

const pendingUploads = new Map<string, PendingVideoUpload>();

// ---------- Helpers ----------

function makeBlockId(seq: number): string {
  // Azure requires all block IDs for a blob to be the same length and base64-encoded
  const padded = String(seq).padStart(6, '0');
  return Buffer.from(padded).toString('base64');
}

function getBlockBlobClient(sessionId: string) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    config.azureStorageConnectionString
  );
  const containerClient = blobServiceClient.getContainerClient(AZURE_VIDEO_CONTAINER);
  const blobName = `${sessionId}.webm`;
  return { containerClient, blockBlobClient: containerClient.getBlockBlobClient(blobName) };
}

function sendVideoStatus(
  sessionId: string,
  status: VideoRecordingStatus,
  message: string,
  error?: string,
  videoUrl?: string
): void {
  const event: WSVideoRecordingStatusEvent = {
    event: 'video:recording:status',
    data: { status, message, error, videoUrl },
  };
  connectionManager.send(sessionId, event);
}

// ---------- Public API ----------

export async function initVideoUpload(sessionId: string): Promise<void> {
  const { containerClient } = getBlockBlobClient(sessionId);
  await containerClient.createIfNotExists();

  pendingUploads.set(sessionId, {
    sessionId,
    blockIds: [],
    totalBytes: 0,
    startedAt: Date.now(),
  });

  console.log(`[VideoRecording] Initialized chunked upload for session ${sessionId}`);
}

export async function stageVideoChunk(
  sessionId: string,
  seq: number,
  chunkBuffer: Buffer
): Promise<void> {
  let pending = pendingUploads.get(sessionId);
  if (!pending) {
    // Lazily initialize if the explicit init was missed (e.g. reconnect)
    await initVideoUpload(sessionId);
    pending = pendingUploads.get(sessionId)!;
  }

  const { blockBlobClient } = getBlockBlobClient(sessionId);
  const blockId = makeBlockId(seq);

  await blockBlobClient.stageBlock(blockId, chunkBuffer, chunkBuffer.length);

  pending.blockIds.push(blockId);
  pending.totalBytes += chunkBuffer.length;

  console.log(
    `[VideoRecording] Staged block ${seq} for session ${sessionId} (${chunkBuffer.length} bytes, total ${pending.blockIds.length} blocks)`
  );
}

export async function commitVideoUpload(sessionId: string): Promise<string | null> {
  const pending = pendingUploads.get(sessionId);
  if (!pending || pending.blockIds.length === 0) {
    console.warn(`[VideoRecording] No staged blocks to commit for session ${sessionId}`);
    pendingUploads.delete(sessionId);

    const { markVideoReady } = await import('./callbackCoordinator.js');
    markVideoReady(sessionId);
    return null;
  }

  try {
    sendVideoStatus(sessionId, 'processing', 'Video kaydı birleştiriliyor...');

    const { blockBlobClient } = getBlockBlobClient(sessionId);

    await blockBlobClient.commitBlockList(pending.blockIds, {
      blobHTTPHeaders: { blobContentType: 'video/webm' },
    });

    const blobUrl = blockBlobClient.url;

    await createSessionEvent({
      sessionId,
      eventType: 'session_started',
      eventData: { videoRecording: 'completed', videoUrl: blobUrl },
    });
    sendVideoStatus(sessionId, 'completed', 'Video kaydı başarıyla yüklendi.', undefined, blobUrl);

    console.log(
      `[VideoRecording] Committed ${pending.blockIds.length} blocks (${pending.totalBytes} bytes) for session ${sessionId} → ${blobUrl}`
    );

    const { markVideoReady } = await import('./callbackCoordinator.js');
    markVideoReady(sessionId);

    return blobUrl;
  } catch (error) {
    console.error(`[VideoRecording] Failed to commit video for session ${sessionId}:`, error);
    await createSessionEvent({
      sessionId,
      eventType: 'error_occurred',
      eventData: { videoRecording: 'failed' },
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    sendVideoStatus(sessionId, 'failed', 'Video kaydı yüklenirken hata oluştu.', errorMessage);

    const { markVideoReady } = await import('./callbackCoordinator.js');
    markVideoReady(sessionId);

    return null;
  } finally {
    pendingUploads.delete(sessionId);
  }
}

export function hasPendingUpload(sessionId: string): boolean {
  return pendingUploads.has(sessionId);
}

export function getPendingUploadStats(sessionId: string) {
  const pending = pendingUploads.get(sessionId);
  if (!pending) return null;
  return { blocks: pending.blockIds.length, totalBytes: pending.totalBytes };
}

// ---------- Cleanup ----------

// Periodically clean up stale uploads that were never committed
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, pending] of pendingUploads) {
    if (now - pending.startedAt > STALE_UPLOAD_TIMEOUT_MS) {
      console.warn(`[VideoRecording] Cleaning up stale upload for session ${sessionId}`);
      pendingUploads.delete(sessionId);
    }
  }
}, STALE_UPLOAD_TIMEOUT_MS / 2);
