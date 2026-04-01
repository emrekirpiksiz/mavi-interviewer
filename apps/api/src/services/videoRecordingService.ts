import { BlobServiceClient } from '@azure/storage-blob';
import { config } from '../config/index.js';
import { updateSessionVideoRecordingStatus } from '../db/queries/sessions.js';
import { connectionManager } from '../websocket/connectionManager.js';
import type { WSVideoRecordingStatusEvent, VideoRecordingStatus } from '@ai-interview/shared';

// ============================================
// VIDEO RECORDING SERVICE
// ============================================
// Client-side video kaydını Azure Blob Storage'a yükler.
// Audio recording'den farklı olarak video tamamen client'da kaydedilir
// ve interview sonunda tek seferde upload edilir.

const AZURE_VIDEO_CONTAINER = 'interview-videos';

export async function uploadVideoToAzure(
  sessionId: string,
  videoBuffer: Buffer
): Promise<string> {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    config.azureStorageConnectionString
  );
  const containerClient = blobServiceClient.getContainerClient(AZURE_VIDEO_CONTAINER);

  await containerClient.createIfNotExists();

  const blobName = `${sessionId}.webm`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(videoBuffer, videoBuffer.length, {
    blobHTTPHeaders: {
      blobContentType: 'video/webm',
    },
  });

  return blockBlobClient.url;
}

export async function processVideoUpload(
  sessionId: string,
  videoBuffer: Buffer
): Promise<void> {
  try {
    await updateSessionVideoRecordingStatus(sessionId, 'processing');
    sendVideoStatus(sessionId, 'processing', 'Video kaydı yükleniyor...');

    const blobUrl = await uploadVideoToAzure(sessionId, videoBuffer);

    await updateSessionVideoRecordingStatus(sessionId, 'completed', blobUrl);
    sendVideoStatus(sessionId, 'completed', 'Video kaydı başarıyla yüklendi.', undefined, blobUrl);

    console.log(`[VideoRecording] Uploaded video for session ${sessionId} → ${blobUrl}`);
  } catch (error) {
    console.error(`[VideoRecording] Failed to upload video for session ${sessionId}:`, error);
    await updateSessionVideoRecordingStatus(sessionId, 'failed');

    const errorMessage = error instanceof Error ? error.message : String(error);
    sendVideoStatus(sessionId, 'failed', 'Video kaydı yüklenirken hata oluştu.', errorMessage);
  }
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
