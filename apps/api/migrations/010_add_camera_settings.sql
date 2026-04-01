-- Migration: 010_add_camera_settings.sql
-- Camera feature: session settings and video recording fields

-- Add settings JSONB column to interview_configs (parametric feature flags)
ALTER TABLE interview_configs
  ADD COLUMN settings JSONB DEFAULT '{}';

COMMENT ON COLUMN interview_configs.settings IS 'Session-level feature settings (camera, etc.) as JSONB';

-- Add video recording fields to sessions (mirrors audio recording pattern)
ALTER TABLE sessions
  ADD COLUMN video_recording_status VARCHAR(20) DEFAULT NULL,
  ADD COLUMN video_recording_url TEXT DEFAULT NULL;

COMMENT ON COLUMN sessions.video_recording_status IS 'Video recording status: recording, processing, completed, failed';
COMMENT ON COLUMN sessions.video_recording_url IS 'Azure Blob Storage URL for the video recording';

-- video_recording_status values:
-- NULL         → video recording not requested or legacy session
-- 'recording'  → interview in progress, client recording
-- 'processing' → interview ended, upload in progress
-- 'completed'  → video uploaded to Azure Blob Storage
-- 'failed'     → upload failed
