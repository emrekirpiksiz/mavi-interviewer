# Feature: Interview Ses Kaydı (Audio Recording)

> **Öncelik:** Orta  
> **Tahmini Effort:** M  
> **Bağımlılıklar:** Azure Blob Storage hesabı, ffmpeg (server'da kurulu olmalı)  
> **Tarih:** 2026-02-08

---

## Problem / Motivasyon

Şu an interview sırasında hiçbir ses kaydı saklanmıyor — sadece text transcript kaydediliyor. Ancak:

1. **Gerçek adayın sesini dinleme ihtiyacı** — HR ekibi, adayın gerçek sesini, tonlamasını, ifade gücünü dinlemek istiyor
2. **Gelecekte duygu analizi** — Adayın ses tonundan stres, heyecan, tereddüt gibi duygu sinyalleri çıkarılabilir
3. **Denetim/arşiv** — Görüşme kaydının saklanması yasal ve kurumsal gereklilikler için önemli

**Kapsam:** Sadece **adayın gerçek mikrofon sesi** kaydedilecek. AI'ın TTS sesi sentetik olduğu için kaydedilmeyecek — AI'ın söyledikleri zaten transcript'te text olarak mevcut.

---

## Mevcut Durum (Kod Analizi)

### Audio Akışı

| Kaynak | Format | Nerede İşleniyor | Kaydediliyor mu? |
|--------|--------|-------------------|-----------------|
| Aday sesi (mikrofon) | `audio/webm;codecs=opus` | `POST /transcribe` → Whisper STT | ❌ Temp file → sil |
| AI sesi (TTS) | PCM16 16kHz | ElevenLabs → WebSocket binary | ❌ Hiçbir yere |

### İlgili Dosyalar

| Dosya | Mevcut Durum | Değişiklik Gerekli mi? |
|-------|-------------|----------------------|
| `apps/web/src/hooks/useWhisper.ts` | MediaRecorder → webm/opus → `POST /transcribe` | ❌ Değişiklik yok |
| `apps/api/src/routes/transcribe.ts` | Buffer → temp file → Whisper API → sil | ✅ Buffer'ı ayrıca kaydet |
| `apps/api/src/websocket/handlers.ts` | `interview:start`, `interview:end` handler'ları | ✅ Recording init/finalize ekle |
| `apps/api/src/config/index.ts` | Environment config | ✅ Azure config ekle |
| `apps/api/src/services/matchmindService.ts` | MatchMind webhook'ları | ❌ Değişiklik yok |

### Mevcut Audio Akışı (transcribe.ts)

```typescript
// 1. Multer ile memory buffer olarak al
const upload = multer({ storage: multer.memoryStorage() });

// 2. Temp dosyaya yaz (Whisper file gerektirir)
const tempFile = path.join(os.tmpdir(), `whisper-${Date.now()}.webm`);
fs.writeFileSync(tempFile, req.file.buffer);

// 3. Whisper'a gönder
const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream(tempFile),
  model: 'whisper-1',
  response_format: 'verbose_json', // duration bilgisi içerir
});

// 4. Temp dosyayı sil
fs.unlinkSync(tempFile);
```

**Kritik bilgi:** Whisper API `verbose_json` formatı ile `duration` (saniye) döndürüyor — bu, gap hesaplaması için kullanılacak.

### Frontend Kayıt Yapısı (useWhisper.ts)

```typescript
// MediaRecorder config
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
});
mediaRecorder.start(500); // 500ms timeslice

// Aday konuşmasını bitirince:
const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
formData.append('audio', audioBlob, 'recording.webm');
// POST /transcribe'a gönder
```

Her aday konuşma segmenti ayrı bir `/transcribe` request'i olarak gelir. Segmentler arası AI konuşma boşlukları var.

---

## Çözüm Yaklaşımı

### Genel Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                     INTERVIEW SIRASINDA                       │
│                                                               │
│  Frontend (useWhisper.ts)                                     │
│  ┌──────────────────────────┐                                 │
│  │ MediaRecorder             │                                │
│  │ audio/webm;codecs=opus    │───► POST /transcribe           │
│  │ 500ms timeslice chunks    │          │                     │
│  └──────────────────────────┘          │                     │
│                                         ▼                     │
│                         Backend (transcribe.ts)               │
│                         ┌───────────────────────────┐         │
│                         │ 1. Buffer'ı disk'e kaydet  │ ← YENİ │
│                         │ 2. Temp file → Whisper STT │ mevcut  │
│                         │ 3. Temp file sil           │ mevcut  │
│                         └───────────────────────────┘         │
│                                    │                          │
│                                    ▼                          │
│                  /tmp/interview-recordings/{sessionId}/        │
│                  ├── chunk_001.webm  (segment 1)              │
│                  ├── chunk_002.webm  (segment 2)              │
│                  ├── ...                                      │
│                  └── manifest.json   (metadata)               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   INTERVIEW BİTTİĞİNDE                        │
│                                                               │
│  handlers.ts → interview:end event                            │
│                                                               │
│  1. notifyInterviewCompleted()       → MatchMind  (mevcut)    │
│  2. sendTransaction()                → MatchMind  (mevcut)    │
│  3. [ASYNC] finalizeRecording()      → Audio pipeline (YENİ)  │
│     ┌──────────────────────────────────────────────┐          │
│     │ a. manifest.json oku                          │         │
│     │ b. Chunk'ları kronolojik sırala                │         │
│     │ c. Segment arası sessizlik ekle (timestamp'e   │         │
│     │    göre gerçek süre kadar boşluk)              │         │
│     │ d. ffmpeg ile birleştir + MP3 encode            │         │
│     │    → MP3 128kbps mono, 16kHz                   │         │
│     │ e. Azure Blob Storage'a upload                  │         │
│     │    → container: interview-recordings            │         │
│     │    → blob: {sessionId}.mp3                      │         │
│     │ f. DB'de recording_url güncelle                 │         │
│     │ g. Temp dosyaları temizle                       │         │
│     └──────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     MATCHMIND TARAFINDA                        │
│                                                               │
│  Transaction detay sayfasında:                                 │
│  → Azure Blob'da {sessionId}.mp3 var mı?                      │
│     ├── EVET → Audio player göster                             │
│     └── HAYIR → Sadece transcript göster (mevcut davranış)     │
│                                                               │
│  MatchMind'da yeni API endpoint'e GEREK YOK.                  │
│  Sadece Azure Blob Storage okuma erişimi yeterli.              │
└──────────────────────────────────────────────────────────────┘
```

### Neden Azure Blob Storage (Doğrudan)?

| Kriter | MatchMind'a API ile gönder | Azure Blob Storage |
|--------|---------------------------|-------------------|
| **Coupling** | Sıkı — iki tarafta da değişiklik | Gevşek — biri yazar, diğeri okur |
| **Dosya boyutu** | HTTP timeout riski (15MB+) | Streaming upload, timeout yok |
| **Retry** | Manuel retry yönetimi | Azure SDK built-in retry |
| **Maliyet** | Network + server yükü | ~0.02$/GB/ay |
| **Esneklik** | İki serviste eş zamanlı deploy | MatchMind hazır olduğunda okumaya başlar |
| **Gelecek** | Emotion API'ye göndermek zor | Blob URL ile herhangi servise yönlendirilebilir |

**Karar: Azure Blob Storage.** MatchMind kendi tarafında `{sessionId}.mp3` blob'unu kontrol eder, varsa player gösterir.

### Neden Sadece Aday Sesi?

- AI sesi **sentetik** (ElevenLabs TTS) — orijinal değil, her seferinde yeniden üretilebilir
- AI'ın söylediği her şey zaten **text transcript** olarak DB'de ve MatchMind'da mevcut
- **Duygu analizi** yalnızca adayın gerçek sesine uygulanabilir
- Dosya boyutu yarıya düşer

### Sessizlik (Gap) Yönetimi — Gerçekçi Dinleme Deneyimi

Dinleyen kişinin gerçekçi bir interview deneyimi duyması için segment'ler arası boşluklar korunmalı:

```
Timeline (gerçek interview):

00:00 ─── AI konuşuyor (30sn) ──── 00:30
00:30 ─── [Aday segment 1 - 45sn] ─── 01:15
01:15 ─── AI konuşuyor (20sn) ──── 01:35
01:35 ─── [Aday segment 2 - 60sn] ─── 02:35

Kayıt dosyasında:

00:00 ─── [30sn sessizlik — AI konuşma süresi] ─── 00:30
00:30 ─── [Aday segment 1 - 45sn gerçek ses] ─── 01:15
01:15 ─── [20sn sessizlik — AI konuşma süresi] ─── 01:35
01:35 ─── [Aday segment 2 - 60sn gerçek ses] ─── 02:35
```

**Sessizlik hesabı:** Her chunk'ın `timestampMs` değeri (interview başlangıcından itibaren) manifest'te tutulur. Bir önceki chunk'ın bitişi ile sonraki chunk'ın başlangıcı arasındaki fark = sessizlik süresi.

Bu sayede:
- Kayıt dosyasının toplam süresi ≈ gerçek interview süresi
- Dinleyen kişi adayın ne kadar hızlı/yavaş yanıt verdiğini duyar
- Transcript ile kayıt timestamp'leri eşleşir

### Audio Format Kararı

| Parametre | Değer | Gerekçe |
|-----------|-------|---------|
| Format | MP3 | Evrensel uyumluluk, browser'da native oynatılabilir |
| Bitrate | 128kbps | Konuşma için yüksek kalite, emotion analysis için yeterli |
| Channels | Mono | Tek mikrofon, stereo gereksiz |
| Sample Rate | 16kHz | Konuşma frekans aralığı için yeterli (300Hz-3.4kHz) |
| Tahmini boyut | ~29 MB / 30 dk | Kabul edilebilir |

---

## Detaylı Teknik Tasarım

### Part 1: audioRecordingService.ts — Yeni Servis

Tüm recording mantığı tek bir servis dosyasında toplanır.

#### 1.1 Manifest Yapısı

Her interview için bir `manifest.json` dosyası tutulur:

```typescript
interface RecordingManifest {
  sessionId: string;
  interviewStartedAt: string;  // ISO 8601
  language: string;
  chunks: RecordingChunk[];
}

interface RecordingChunk {
  seq: number;
  filename: string;            // chunk_001.webm
  timestampMs: number;         // Interview başlangıcından itibaren (ms)
  sizeBytes: number;
  recordingDurationMs: number; // Whisper'dan gelen duration (ms)
}
```

Örnek manifest:

```json
{
  "sessionId": "a1b2c3d4-e5f6-...",
  "interviewStartedAt": "2026-02-08T10:00:00.000Z",
  "language": "tr",
  "chunks": [
    {
      "seq": 1,
      "filename": "chunk_001.webm",
      "timestampMs": 32000,
      "sizeBytes": 45200,
      "recordingDurationMs": 8500
    },
    {
      "seq": 2,
      "filename": "chunk_002.webm",
      "timestampMs": 65000,
      "sizeBytes": 72100,
      "recordingDurationMs": 14200
    }
  ]
}
```

- `timestampMs`: Interview başlangıcından itibaren bu chunk'ın başladığı ms (transcript_entries tablosundaki `timestamp_ms` ile aynı kaynak)
- `recordingDurationMs`: Bu chunk'ın ses süresi (Whisper API `verbose_json` response'undaki `duration` değeri × 1000)

#### 1.2 initRecording — Interview Başlangıcı

```typescript
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { updateSessionRecordingStatus } from '../db/queries/sessions.js';

const activeManifests = new Map<string, RecordingManifest>();

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
  await updateSessionRecordingStatus(sessionId, 'recording');

  console.log(`[AudioRecording] Init recording for session ${sessionId}`);
}
```

#### 1.3 saveChunk — Her Transcribe İsteğinde

```typescript
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
  });

  writeManifest(recordingDir, manifest);

  console.log(`[AudioRecording] Saved chunk ${seq} for session ${sessionId} (${audioBuffer.length} bytes)`);
}

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
```

#### 1.4 finalizeRecording — Interview Bitişi (Async)

```typescript
import { BlobServiceClient } from '@azure/storage-blob';

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
    await updateSessionRecordingStatus(sessionId, 'processing');

    // 1. ffmpeg ile birleştir + MP3 encode
    const mp3Buffer = await encodeToMp3(recordingDir, manifest);

    // 2. Azure Blob Storage'a upload
    const blobUrl = await uploadToAzure(sessionId, mp3Buffer);

    // 3. DB: completed + URL
    await updateSessionRecordingStatus(sessionId, 'completed', blobUrl);

    console.log(`[AudioRecording] Finalized recording for session ${sessionId} → ${blobUrl}`);
  } catch (error) {
    console.error(`[AudioRecording] Failed to finalize recording for session ${sessionId}:`, error);
    await updateSessionRecordingStatus(sessionId, 'failed');
  } finally {
    // 4. Cleanup
    activeManifests.delete(sessionId);
    cleanupTempFiles(recordingDir);
  }
}
```

#### 1.5 encodeToMp3 — ffmpeg Pipeline

```typescript
import Ffmpeg from 'fluent-ffmpeg';

async function encodeToMp3(
  recordingDir: string,
  manifest: RecordingManifest
): Promise<Buffer> {
  // 1. Her chunk'ı PCM'e dönüştür + sessizlik hesapla
  const pcmSegments: string[] = [];
  let currentTimeMs = 0;

  for (const chunk of manifest.chunks) {
    // Sessizlik ekle (önceki segment bitişi ile bu segment başlangıcı arası)
    const gapMs = chunk.timestampMs - currentTimeMs;
    if (gapMs > 0) {
      const silenceFile = path.join(recordingDir, `silence_before_${chunk.seq}.pcm`);
      await generateSilence(silenceFile, gapMs);
      pcmSegments.push(silenceFile);
    }

    // Chunk'ı PCM'e dönüştür
    const pcmFile = path.join(recordingDir, `${chunk.filename}.pcm`);
    await convertToPcm(
      path.join(recordingDir, chunk.filename),
      pcmFile
    );
    pcmSegments.push(pcmFile);

    // Zaman ilerlet
    currentTimeMs = chunk.timestampMs + chunk.recordingDurationMs;
  }

  // 2. Tüm PCM segmentlerini birleştir
  const combinedPcm = path.join(recordingDir, 'combined.pcm');
  concatenatePcmFiles(pcmSegments, combinedPcm);

  // 3. MP3'e encode et
  const outputMp3 = path.join(recordingDir, 'output.mp3');
  await encodePcmToMp3(combinedPcm, outputMp3);

  return fs.readFileSync(outputMp3);
}

function convertToPcm(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .outputOptions(['-f', 's16le', '-ac', '1', '-ar', '16000'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function generateSilence(outputPath: string, durationMs: number): Promise<void> {
  const durationSec = durationMs / 1000;
  return new Promise((resolve, reject) => {
    Ffmpeg()
      .input('anullsrc=r=16000:cl=mono')
      .inputFormat('lavfi')
      .outputOptions(['-t', String(durationSec), '-f', 's16le'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function concatenatePcmFiles(files: string[], outputPath: string): void {
  const writeStream = fs.createWriteStream(outputPath);
  for (const file of files) {
    const data = fs.readFileSync(file);
    writeStream.write(data);
  }
  writeStream.end();
}

function encodePcmToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .inputOptions(['-f', 's16le', '-ar', '16000', '-ac', '1'])
      .outputOptions(['-codec:a', 'libmp3lame', '-b:a', '128k'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}
```

#### 1.6 uploadToAzure — Blob Storage Upload

```typescript
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
```

#### 1.7 Yardımcı Fonksiyonlar

```typescript
function writeManifest(recordingDir: string, manifest: RecordingManifest): void {
  const manifestPath = path.join(recordingDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function cleanupTempFiles(recordingDir: string): void {
  try {
    fs.rmSync(recordingDir, { recursive: true, force: true });
    console.log(`[AudioRecording] Cleaned up temp files: ${recordingDir}`);
  } catch (error) {
    console.error(`[AudioRecording] Failed to cleanup: ${recordingDir}`, error);
  }
}
```

---

### Part 2: transcribe.ts Değişikliği

Mevcut transcribe endpoint'ine iki satır ekleme:

```typescript
// ÖNCESİ (mevcut kod, satır 34-98):
router.post('/', transcribeLimiter, upload.single('audio'), async (req, res) => {
  // ...
  const language = (req.body.language as string) || 'tr';
  // ...
  fs.writeFileSync(tempFile, req.file.buffer);
  // ... Whisper API call ...
  res.json({ success: true, text: transcriptText, metric: { ... } });
});

// SONRASI:
import { saveChunk, updateChunkDuration } from '../services/audioRecordingService.js';

router.post('/', transcribeLimiter, upload.single('audio'), async (req, res) => {
  // ...
  const language = (req.body.language as string) || 'tr';
  const sessionId = (req.body.sessionId as string) || '';  // YENİ: Frontend'den gelecek
  const timestampMs = parseInt(req.body.timestampMs || '0', 10);  // YENİ

  // [YENİ] Audio chunk'ı recording için kaydet
  if (sessionId) {
    await saveChunk(sessionId, req.file.buffer, timestampMs);
  }

  // ... mevcut Whisper API call ...

  // [YENİ] Whisper'dan gelen duration'ı manifest'e yaz
  if (sessionId && audioLengthMs > 0) {
    updateChunkDuration(sessionId, audioLengthMs);
  }

  res.json({ success: true, text: transcriptText, metric: { ... } });
});
```

**Not:** Frontend'den `sessionId` ve `timestampMs` ek field olarak gönderilmeli. Bu, `useWhisper.ts`'te FormData'ya iki field eklenmesini gerektirir (minimal frontend değişiklik).

---

### Part 3: handlers.ts Değişikliği

#### 3.1 interview:start Handler'ında

```typescript
import { initRecording } from '../services/audioRecordingService.js';

async function handleInterviewStart(sessionId: string, ws: WebSocket, event: WSInterviewStartEvent): Promise<void> {
  // ... mevcut kod ...

  // Notify MatchMind that interview has started (mevcut)
  notifyInterviewStarted(sessionId);

  // [YENİ] Recording başlat
  initRecording(sessionId);

  // ... mevcut kod devam ...
}
```

#### 3.2 interview:end Handler'ında

```typescript
import { finalizeRecording } from '../services/audioRecordingService.js';

async function handleInterviewEnd(sessionId: string, ws: WebSocket, event: WSInterviewEndEvent): Promise<void> {
  // ... mevcut kod ...

  // Notify MatchMind (mevcut)
  if (reason === 'completed' || reason === 'candidate_left') {
    notifyInterviewCompleted(sessionId, durationSeconds);
  }

  // [YENİ] Recording finalize (fire-and-forget)
  finalizeRecording(sessionId).catch(error => {
    console.error(`[Handler] Session ${sessionId} - Recording finalize error:`, error);
  });

  // ... mevcut cleanup ...
}
```

#### 3.3 Auto-end (AI görüşmeyi bitirdiğinde)

```typescript
// handleInterviewEnd yanı sıra, AI'ın otomatik bitirme akışında da (handlers.ts satır ~880):
// Mevcut: notifyInterviewCompleted(sessionId, durationSeconds);
// [YENİ]:
finalizeRecording(sessionId).catch(error => {
  console.error(`[Handler] Session ${sessionId} - Recording finalize error (auto-end):`, error);
});
```

---

### Part 4: useWhisper.ts — Minimal Frontend Değişiklik

FormData'ya iki ek field eklenmesi:

```typescript
// ÖNCESİ (mevcut kod, satır 252-258):
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('language', language);
if (contextPrompt) {
  formData.append('prompt', contextPrompt);
}

// SONRASI:
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('language', language);
if (contextPrompt) {
  formData.append('prompt', contextPrompt);
}
// [YENİ] Recording için session bilgisi
const sessionId = useInterviewStore.getState().session?.id;
const startedAt = useInterviewStore.getState().session?.startedAt;
if (sessionId) {
  formData.append('sessionId', sessionId);
  const timestampMs = startedAt
    ? Date.now() - new Date(startedAt).getTime()
    : 0;
  formData.append('timestampMs', String(timestampMs));
}
```

---

### Part 5: config/index.ts — Environment Config

```typescript
// Mevcut config objesine ekleme:
export const config = {
  // ... mevcut config ...

  // Audio Recording
  audioRecordingEnabled: process.env['AUDIO_RECORDING_ENABLED'] === 'true',
  audioRecordingTempDir: process.env['AUDIO_RECORDING_TEMP_DIR'] || path.join(os.tmpdir(), 'interview-recordings'),

  // Azure Blob Storage
  azureStorageConnectionString: process.env['AZURE_STORAGE_CONNECTION_STRING'] ?? '',
  azureStorageContainerName: process.env['AZURE_STORAGE_CONTAINER_NAME'] ?? 'interview-recordings',
} as const;
```

---

### Part 6: Database Migration

```sql
-- Migration: 009_add_recording_fields.sql

ALTER TABLE sessions 
  ADD COLUMN recording_status VARCHAR(20) DEFAULT NULL,
  ADD COLUMN recording_url TEXT DEFAULT NULL;

COMMENT ON COLUMN sessions.recording_status IS 'Audio recording status: recording, processing, completed, failed';
COMMENT ON COLUMN sessions.recording_url IS 'Azure Blob Storage URL for the MP3 recording';

-- recording_status değerleri:
-- NULL         → kayıt alınmadı (eski session'lar veya disabled)
-- 'recording'  → interview devam ediyor, chunk'lar birikiyor
-- 'processing' → interview bitti, ffmpeg encode devam ediyor
-- 'completed'  → MP3 Azure Blob'a yüklendi
-- 'failed'     → encoding veya upload başarısız
```

DB query fonksiyonu:

```typescript
// apps/api/src/db/queries/sessions.ts - Ekleme
export async function updateSessionRecordingStatus(
  sessionId: string,
  status: string,
  recordingUrl?: string
): Promise<void> {
  if (recordingUrl) {
    await query(
      'UPDATE sessions SET recording_status = $1, recording_url = $2 WHERE id = $3',
      [status, recordingUrl, sessionId]
    );
  } else {
    await query(
      'UPDATE sessions SET recording_status = $1 WHERE id = $2',
      [status, sessionId]
    );
  }
}
```

---

### Part 7: Azure Blob Storage Yapısı

```
Container: interview-recordings
Blob naming: {sessionId}.mp3
Örnek: interview-recordings/a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3
```

- Access tier: **Hot** (sık erişilecek, ilk birkaç hafta)
- Lifecycle policy (opsiyonel): 90 gün sonra **Cool** tier'a taşı
- Retention: Şirket politikasına göre (KVKK/GDPR uyumu)

---

## Etkilenen Dosyalar

### Yeni Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `apps/api/src/services/audioRecordingService.ts` | Chunk kaydetme, manifest yönetimi, ffmpeg encode, Azure upload |
| `apps/api/migrations/009_add_recording_fields.sql` | `sessions` tablosuna `recording_status`, `recording_url` alanları |

### Değişecek Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `apps/api/src/routes/transcribe.ts` | `saveChunk()` + `updateChunkDuration()` çağrısı, `sessionId`/`timestampMs` parse |
| `apps/api/src/websocket/handlers.ts` | `interview:start` → `initRecording()`, `interview:end` → `finalizeRecording()` (async) |
| `apps/api/src/config/index.ts` | Azure Blob Storage + recording config env variables |
| `apps/api/src/db/queries/sessions.ts` | `updateSessionRecordingStatus()` fonksiyonu |
| `apps/api/package.json` | `@azure/storage-blob`, `fluent-ffmpeg`, `@types/fluent-ffmpeg` dependencies |
| `apps/web/src/hooks/useWhisper.ts` | FormData'ya `sessionId` ve `timestampMs` field ekleme |

### Değişmeyen Dosyalar

| Dosya | Neden değişmiyor |
|-------|-----------------|
| `apps/api/src/services/matchmindService.ts` | Mevcut webhook flow'una dokunulmuyor |
| `apps/api/src/websocket/connectionManager.ts` | Audio recording ile ilgisi yok |
| `apps/web/src/stores/interviewStore.ts` | Store değişikliği gerekmiyor |
| `apps/web/src/components/**` | UI değişikliği yok |

### Dokümantasyon Güncellemeleri

| Dosya | Değişiklik |
|-------|-----------|
| `docs/plans/04-project-structure.md` | `audioRecordingService.ts` dosyası eklenir |
| `docs/features/backlog.md` | #7 "Audio kayıt ve saklama" → Tamamlanan bölümüne taşınır |
| `docs/README.md` | Features bölümüne Audio Recording eklenir |

---

## Environment Variables

```env
# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER_NAME=interview-recordings

# Audio Recording (opsiyonel, default: false)
AUDIO_RECORDING_ENABLED=true
AUDIO_RECORDING_TEMP_DIR=/tmp/interview-recordings
```

`AUDIO_RECORDING_ENABLED` ile feature toggle yapılır. `false` ise hiçbir chunk kaydedilmez, mevcut akış aynen devam eder.

---

## Uygulama Sırası (Önerilen)

### Adım 1: Database Migration

1. `009_add_recording_fields.sql` migration dosyasını oluştur
2. `updateSessionRecordingStatus()` query fonksiyonunu ekle
3. Migration'ı çalıştır

### Adım 2: Config & Dependencies

1. `config/index.ts`'e Azure + recording env variables ekle
2. `@azure/storage-blob`, `fluent-ffmpeg`, `@types/fluent-ffmpeg` paketlerini kur
3. `.env.example` güncelle

### Adım 3: audioRecordingService.ts

1. `initRecording()` — klasör + manifest oluşturma
2. `saveChunk()` — buffer'ı disk'e yazma
3. `updateChunkDuration()` — Whisper duration güncelleme
4. `encodeToMp3()` — ffmpeg pipeline (sessizlik + birleştirme + encode)
5. `uploadToAzure()` — Blob Storage upload
6. `finalizeRecording()` — tüm pipeline'ı async çalıştırma
7. `cleanupTempFiles()` — temp dosyaları temizleme

### Adım 4: transcribe.ts Entegrasyonu

1. `saveChunk()` çağrısını ekle
2. `updateChunkDuration()` çağrısını ekle
3. `sessionId` ve `timestampMs` body field'larını parse et

### Adım 5: handlers.ts Entegrasyonu

1. `handleInterviewStart()` → `initRecording()` ekle
2. `handleInterviewEnd()` → `finalizeRecording()` ekle (fire-and-forget)
3. Auto-end akışında da `finalizeRecording()` ekle

### Adım 6: Frontend Minimal Değişiklik

1. `useWhisper.ts` → FormData'ya `sessionId` + `timestampMs` ekle

### Adım 7: Test & Doğrulama

1. Local ffmpeg kurulumu doğrulama
2. Interview başlat → chunk'ların disk'e yazıldığını kontrol et
3. Interview bitir → MP3 oluştuğunu kontrol et
4. Azure Blob'a upload doğrulama
5. `AUDIO_RECORDING_ENABLED=false` ile feature toggle testi
6. Edge case: hiç chunk yoksa graceful skip

### Adım 8: Dokümantasyon

1. `docs/plans/04-project-structure.md` güncelle
2. `docs/features/backlog.md` güncelle
3. `docs/README.md` güncelle

---

## Kabul Kriterleri

### Kayıt

- [ ] Interview sırasında her `/transcribe` isteğindeki audio buffer disk'e kaydediliyor
- [ ] Manifest dosyası her chunk ile güncelleniyor (seq, timestamp, size, duration)
- [ ] `AUDIO_RECORDING_ENABLED=false` olduğunda hiçbir kayıt işlemi yapılmıyor

### Encoding

- [ ] Interview sonrası chunk'lar ffmpeg ile birleştirilip MP3 128kbps mono 16kHz olarak encode ediliyor
- [ ] Segment arası sessizlikler timestamp'lere göre doğru hesaplanıp ekleniyor
- [ ] Kayıt dosyasının toplam süresi ≈ gerçek interview süresi

### Upload

- [ ] MP3 dosyası Azure Blob Storage'a `{sessionId}.mp3` adıyla yükleniyor
- [ ] `sessions` tablosunda `recording_status` ve `recording_url` doğru güncelleniyor

### Güvenilirlik

- [ ] Encoding/upload işlemi async — interview flow'unu bloklamıyor
- [ ] Hata durumlarında interview flow etkilenmiyor (fire-and-forget)
- [ ] Temp dosyalar başarılı upload sonrası temizleniyor
- [ ] Azure upload başarısız olursa `recording_status = 'failed'` olarak kaydediliyor

### Genel

- [ ] TypeScript hataları yok
- [ ] Lint hataları yok
- [ ] İlgili dokümantasyon güncellendi

---

## Monitoring Sorguları

Production'da recording durumunu izlemek için:

```sql
-- 1. Recording status dağılımı
SELECT 
  recording_status,
  COUNT(*) as count
FROM sessions
WHERE recording_status IS NOT NULL
GROUP BY recording_status;

-- 2. Başarısız recording'ler (son 24 saat)
SELECT 
  s.id as session_id,
  ic.candidate_data->>'name' as candidate_name,
  s.recording_status,
  s.started_at,
  s.ended_at
FROM sessions s
JOIN interview_configs ic ON s.id = ic.session_id
WHERE s.recording_status = 'failed'
  AND s.created_at > NOW() - INTERVAL '24 hours'
ORDER BY s.created_at DESC;

-- 3. Processing'de takılı kalan recording'ler (5+ dakikadır processing)
SELECT 
  s.id as session_id,
  s.recording_status,
  s.ended_at,
  NOW() - s.ended_at as stuck_duration
FROM sessions s
WHERE s.recording_status = 'processing'
  AND s.ended_at < NOW() - INTERVAL '5 minutes';
```

---

## Notlar

### Kapsam Dışı (yapılmayacak)

- **Duygu analizi:** Bu feature scope'unda değil. İleride aynı pipeline'a ikinci bir output (webm/opus kayıpsız format) eklenebilir.
- **AI sesinin kaydı:** TTS sesi sentetik, kaydedilmeyecek. AI'ın söyledikleri text transcript'te mevcut.
- **Realtime streaming upload:** Chunk'lar interview sırasında Azure'a yüklenmeyecek. Sadece finalize'da toplu upload.
- **Admin paneli / recording listesi:** Şimdilik yok, sadece DB sorguları ve MatchMind okuma.
- **Kayıt oynatma UI (Interview App'te):** Interview App'te player yok, sadece MatchMind'da gösterilecek.
- **KVKK/GDPR aday onayı mekanizması:** Ayrı bir feature olarak değerlendirilmeli.

### MatchMind Koordinasyonu

Interview App scope'undaki tamamlanan iş sonrası MatchMind'da yapılacaklar:
- Azure Blob Storage **okuma** erişimi tanımlama
- Transaction detay sayfasında `{sessionId}.mp3` blob var mı kontrolü
- Varsa HTML5 `<audio>` player gösterme
- **Interview App'ta ek bir API endpoint'e gerek yok**

### Kararlar

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Kayıt tarafı | Server-side | Audio zaten backend'den geçiyor, güvenilir |
| Neyi kaydedelim | Sadece aday sesi | AI sentetik, transcript'te var |
| Ara format | Raw webm/opus (olduğu gibi) | Dönüştürme overhead'i yok |
| Final format | MP3 128kbps mono 16kHz | Evrensel uyumluluk, emotion analysis için yeterli |
| Encoding tool | ffmpeg (fluent-ffmpeg) | Güvenilir, hızlı, tek pipeline |
| Storage | Azure Blob Storage | Decoupled, ucuz, MatchMind direkt okur |
| Blob naming | `{sessionId}.mp3` | Basit lookup, ek API gereksiz |
| Zamanlama | Async (interview sonrası) | Interview flow etkilenmesin |
| Sessizlik yönetimi | Timestamp'e göre gerçek gap | Gerçekçi dinleme deneyimi |
| Feature toggle | `AUDIO_RECORDING_ENABLED` env | Kademeli rollout, geri alma kolaylığı |

### Riskler

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|------------|
| ffmpeg production'da kurulu değil | Orta | Recording çalışmaz | Docker image'a ffmpeg ekle, startup check |
| Disk dolması (çok fazla eşzamanlı interview) | Düşük | Server crash | Temp dir monitoring, max concurrent limit |
| Azure upload timeout (büyük dosya) | Düşük | Recording 'failed' | Azure SDK built-in retry, streaming upload |
| Interview yarıda kesilir | Orta | Eksik kayıt | Mevcut chunk'larla kısmi kayıt oluştur |
| `timestampMs` frontend'den yanlış gelir | Düşük | Sessizlik hesabı bozuk | Backend validation, fallback to sequence-only |
| Manifest in-memory cache → server restart | Düşük | Aktif recording kaybolur | Manifest disk'te de tutuluyor, startup recovery |

### İlişkili Dokümanlar

- `docs/plans/01-system-architecture.md` — Genel mimari, data flow
- `docs/plans/04-project-structure.md` — Klasör yapısı, naming conventions
- `docs/plans/06-realtime-pipeline.md` — Audio pipeline, Whisper STT, ElevenLabs TTS
- `docs/features/backlog.md` — #7 "Audio kayıt ve saklama" maddesi

---

*Son güncelleme: 2026-02-08*
