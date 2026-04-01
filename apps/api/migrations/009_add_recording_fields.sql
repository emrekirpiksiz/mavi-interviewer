-- Migration: 009_add_recording_fields.sql
-- Audio recording fields for interview sessions

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
