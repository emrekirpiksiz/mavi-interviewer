import fs from 'fs';
import path from 'path';
import Ffmpeg from 'fluent-ffmpeg';
import { BlobServiceClient } from '@azure/storage-blob';
import { config } from '../config/index.js';
import { createSessionEvent } from '../db/queries/sessions.js';
import { connectionManager } from '../websocket/connectionManager.js';
import type { WSRecordingStatusEvent, RecordingStatus } from '@ai-interview/shared';

// ============================================
// AUDIO RECORDING SERVICE
// ============================================
// Interview sırasında aday sesini chunk'lar halinde kaydeder,
// interview sonunda ffmpeg ile birleştirip MP3'e encode eder
// ve Azure Blob Storage'a upload eder.

// ---------- Types ----------

interface RecordingManifest {
  sessionId: string;
  interviewStartedAt: string; // ISO 8601
  language: string;
  chunks: RecordingChunk[];
}

interface RecordingChunk {
  seq: number;
  filename: string;           // chunk_001.webm veya ai_chunk_001.pcm
  timestampMs: number;        // Interview başlangıcından itibaren (ms)
  sizeBytes: number;
  recordingDurationMs: number; // Whisper'dan gelen duration (ms) veya PCM hesaplanan
  source: 'candidate' | 'ai'; // Ses kaynağı
}

// ---------- In-memory Manifest Cache ----------

const activeManifests = new Map<string, RecordingManifest>();

// ---------- Public API ----------

/**
 * Initialize recording for a session (called at interview:start)
 */
export async function initRecording(sessionId: string): Promise<void> {
  if (!config.audioRecordingEnabled) return;

  const recordingDir = path.join(config.audioRecordingTempDir, sessionId);

  // Klasör oluştur (recursive)
  fs.mkdirSync(recordingDir, { recursive: true });

  // Manifest başlat
  const manifest: RecordingManifest = {
    sessionId,
    interviewStartedAt: new Date().toISOString(),
    language: 'tr',
    chunks: [],
  };

  // In-memory cache + disk'e yaz
  activeManifests.set(sessionId, manifest);
  writeManifest(recordingDir, manifest);

  // DB güncelle
  await createSessionEvent({ sessionId, eventType: 'session_started', eventData: { recording: 'started' } });

  console.log(`[AudioRecording] Init recording for session ${sessionId}`);
}

/**
 * Save an audio chunk to disk (called at each /transcribe request)
 */
export async function saveChunk(
  sessionId: string,
  audioBuffer: Buffer,
  timestampMs: number
): Promise<void> {
  if (!config.audioRecordingEnabled) return;

  const manifest = activeManifests.get(sessionId);
  if (!manifest) {
    console.warn(`[AudioRecording] No active recording for session ${sessionId}`);
    return;
  }

  const seq = manifest.chunks.length + 1;
  const filename = `chunk_${String(seq).padStart(3, '0')}.webm`;
  const recordingDir = path.join(config.audioRecordingTempDir, sessionId);
  const filePath = path.join(recordingDir, filename);

  // Buffer'ı disk'e yaz
  fs.writeFileSync(filePath, audioBuffer);

  // Manifest'e ekle (duration sonra güncellenecek)
  manifest.chunks.push({
    seq,
    filename,
    timestampMs,
    sizeBytes: audioBuffer.length,
    recordingDurationMs: 0, // Whisper'dan sonra güncellenecek
    source: 'candidate',
  });

  writeManifest(recordingDir, manifest);

  console.log(`[AudioRecording] Saved chunk ${seq} for session ${sessionId} (${audioBuffer.length} bytes)`);
}

/**
 * Update the duration of the last saved chunk (called after Whisper returns duration)
 */
export function updateChunkDuration(
  sessionId: string,
  durationMs: number
): void {
  const manifest = activeManifests.get(sessionId);
  if (!manifest || manifest.chunks.length === 0) return;

  // Son eklenen chunk'ın duration'ını güncelle
  const lastChunk = manifest.chunks[manifest.chunks.length - 1]!;
  lastChunk.recordingDurationMs = durationMs;

  const recordingDir = path.join(config.audioRecordingTempDir, sessionId);
  writeManifest(recordingDir, manifest);
}

/**
 * Save an AI TTS audio chunk to disk (already PCM16 mono 16kHz)
 * Called from ttsService after TTS audio is received
 */
export async function saveAIChunk(
  sessionId: string,
  pcmBuffer: Uint8Array
): Promise<void> {
  if (!config.audioRecordingEnabled) return;

  const manifest = activeManifests.get(sessionId);
  if (!manifest) {
    // Recording henüz init olmamış olabilir (race condition), sessizce atla
    return;
  }

  // timestampMs: interview başlangıcından itibaren
  const timestampMs = Date.now() - new Date(manifest.interviewStartedAt).getTime();

  // PCM16 16kHz mono: duration = bytes / (16000 * 2) * 1000
  const durationMs = (pcmBuffer.length / 32000) * 1000;

  const seq = manifest.chunks.length + 1;
  const filename = `ai_chunk_${String(seq).padStart(3, '0')}.pcm`;
  const recordingDir = path.join(config.audioRecordingTempDir, sessionId);
  const filePath = path.join(recordingDir, filename);

  // Buffer'ı disk'e yaz
  fs.writeFileSync(filePath, Buffer.from(pcmBuffer));

  // Manifest'e ekle
  manifest.chunks.push({
    seq,
    filename,
    timestampMs,
    sizeBytes: pcmBuffer.length,
    recordingDurationMs: durationMs,
    source: 'ai',
  });

  writeManifest(recordingDir, manifest);

  console.log(`[AudioRecording] Saved AI chunk ${seq} for session ${sessionId} (${pcmBuffer.length} bytes, ${durationMs.toFixed(0)}ms)`);
}

/**
 * Finalize recording: merge chunks with gaps, encode to MP3, upload to Azure (async)
 */
export async function finalizeRecording(sessionId: string): Promise<void> {
  if (!config.audioRecordingEnabled) return;

  const manifest = activeManifests.get(sessionId);
  if (!manifest || manifest.chunks.length === 0) {
    console.log(`[AudioRecording] No chunks to finalize for session ${sessionId}`);
    activeManifests.delete(sessionId);
    return;
  }

  const recordingDir = path.join(config.audioRecordingTempDir, sessionId);

  try {
    // DB: processing
    await createSessionEvent({ sessionId, eventType: 'session_started', eventData: { recording: 'processing' } });
    sendRecordingStatus(sessionId, 'processing', 'Ses kaydı işleniyor...');

    // 1. ffmpeg ile birleştir + MP3 encode
    const mp3Buffer = await encodeToMp3(recordingDir, manifest);

    sendRecordingStatus(sessionId, 'processing', 'MP3 dosyası yükleniyor...');

    // 2. Azure Blob Storage'a upload
    const blobUrl = await uploadToAzure(sessionId, mp3Buffer);

    // 3. DB: completed + URL
    await createSessionEvent({ sessionId, eventType: 'session_started', eventData: { recording: 'completed', recordingUrl: blobUrl } });
    sendRecordingStatus(sessionId, 'completed', 'Ses kaydı başarıyla kaydedildi.', undefined, blobUrl);

    console.log(`[AudioRecording] Finalized recording for session ${sessionId} → ${blobUrl}`);

    // Notify callback coordinator
    const { markAudioReady } = await import('./callbackCoordinator.js');
    markAudioReady(sessionId);
  } catch (error) {
    console.error(`[AudioRecording] Failed to finalize recording for session ${sessionId}:`, error);
    await createSessionEvent({ sessionId, eventType: 'error_occurred', eventData: { recording: 'failed' } });

    const errorMessage = error instanceof Error ? error.message : String(error);
    sendRecordingStatus(sessionId, 'failed', 'Ses kaydı işlenirken hata oluştu.', errorMessage);

    // Still notify coordinator so callback isn't stuck
    const { markAudioReady } = await import('./callbackCoordinator.js');
    markAudioReady(sessionId);
  } finally {
    // 4. Cleanup
    activeManifests.delete(sessionId);
    cleanupTempFiles(recordingDir);
  }
}

// ---------- ffmpeg Pipeline ----------

/**
 * Convert all chunks to PCM, add silence gaps, concatenate, and encode to MP3
 */
async function encodeToMp3(
  recordingDir: string,
  manifest: RecordingManifest
): Promise<Buffer> {
  // 1. Her chunk'ı PCM'e dönüştür + sessizlik hesapla
  const pcmSegments: string[] = [];
  let currentTimeMs = 0;

  for (const chunk of manifest.chunks) {
    // Candidate chunk'ları için timestampMs = gönderim anı (konuşma sonu).
    // Gerçek başlangıç = timestampMs - recordingDurationMs.
    // AI chunk'ları için timestampMs zaten başlangıç anını temsil eder.
    const effectiveStartMs = chunk.source === 'candidate'
      ? Math.max(0, chunk.timestampMs - chunk.recordingDurationMs)
      : chunk.timestampMs;

    // Sessizlik ekle (önceki segment bitişi ile bu segment başlangıcı arası)
    const gapMs = effectiveStartMs - currentTimeMs;
    if (gapMs > 0) {
      const silenceFile = path.join(recordingDir, `silence_before_${chunk.seq}.pcm`);
      generateSilence(silenceFile, gapMs);
      pcmSegments.push(silenceFile);
    }

    if (chunk.source === 'ai') {
      // AI chunk'ları zaten PCM16 16kHz mono - doğrudan kullan
      pcmSegments.push(path.join(recordingDir, chunk.filename));
    } else {
      // Candidate chunk'ları webm/opus - PCM'e dönüştür
      const pcmFile = path.join(recordingDir, `${chunk.filename}.pcm`);
      await convertToPcm(
        path.join(recordingDir, chunk.filename),
        pcmFile
      );
      pcmSegments.push(pcmFile);
    }

    // Zaman ilerlet
    currentTimeMs = effectiveStartMs + chunk.recordingDurationMs;
  }

  // 2. Tüm PCM segmentlerini birleştir
  const combinedPcm = path.join(recordingDir, 'combined.pcm');
  concatenatePcmFiles(pcmSegments, combinedPcm);

  // 3. MP3'e encode et
  const outputMp3 = path.join(recordingDir, 'output.mp3');
  await encodePcmToMp3(combinedPcm, outputMp3);

  return fs.readFileSync(outputMp3);
}

/**
 * Convert webm/opus file to raw PCM (s16le, mono, 16kHz)
 */
function convertToPcm(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .outputOptions(['-f', 's16le', '-ac', '1', '-ar', '16000'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/**
 * Generate a silence PCM file of specified duration
 * PCM16 mono 16kHz: her saniye = 16000 sample × 2 byte = 32000 byte
 * Sessizlik = sıfır byte'lar
 */
function generateSilence(outputPath: string, durationMs: number): void {
  const bytesPerSecond = 16000 * 2; // 16kHz mono s16le
  const totalBytes = Math.floor(bytesPerSecond * durationMs / 1000);
  const silenceBuffer = Buffer.alloc(totalBytes, 0);
  fs.writeFileSync(outputPath, silenceBuffer);
}

/**
 * Concatenate multiple PCM files into one
 */
function concatenatePcmFiles(files: string[], outputPath: string): void {
  const writeStream = fs.createWriteStream(outputPath);
  for (const file of files) {
    const data = fs.readFileSync(file);
    writeStream.write(data);
  }
  writeStream.end();
}

/**
 * Encode raw PCM to MP3 128kbps mono 16kHz
 */
function encodePcmToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .inputOptions(['-f', 's16le', '-ar', '16000', '-ac', '1'])
      .outputOptions(['-codec:a', 'libmp3lame', '-b:a', '128k'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

// ---------- Azure Blob Storage ----------

/**
 * Upload MP3 buffer to Azure Blob Storage
 */
async function uploadToAzure(sessionId: string, mp3Buffer: Buffer): Promise<string> {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    config.azureStorageConnectionString
  );
  const containerClient = blobServiceClient.getContainerClient(
    config.azureStorageContainerName
  );

  // Container yoksa oluştur
  await containerClient.createIfNotExists();

  const blobName = `${sessionId}.mp3`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(mp3Buffer, mp3Buffer.length, {
    blobHTTPHeaders: {
      blobContentType: 'audio/mpeg',
    },
  });

  return blockBlobClient.url;
}

// ---------- Helper Functions ----------

/**
 * Write manifest JSON to disk
 */
function writeManifest(recordingDir: string, manifest: RecordingManifest): void {
  const manifestPath = path.join(recordingDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Remove temp recording directory and all files
 */
function cleanupTempFiles(recordingDir: string): void {
  try {
    fs.rmSync(recordingDir, { recursive: true, force: true });
    console.log(`[AudioRecording] Cleaned up temp files: ${recordingDir}`);
  } catch (error) {
    console.error(`[AudioRecording] Failed to cleanup: ${recordingDir}`, error);
  }
}

/**
 * Send recording status event to frontend via WebSocket
 */
function sendRecordingStatus(
  sessionId: string,
  status: RecordingStatus,
  message: string,
  error?: string,
  recordingUrl?: string
): void {
  const event: WSRecordingStatusEvent = {
    event: 'recording:status',
    data: { status, message, error, recordingUrl },
  };
  connectionManager.send(sessionId, event);
}
