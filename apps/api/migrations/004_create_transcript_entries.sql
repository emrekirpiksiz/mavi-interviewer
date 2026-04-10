-- Migration: 004_create_transcript_entries
-- Description: Create transcript_entries table

CREATE TABLE transcript_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    speaker speaker_type NOT NULL,
    content TEXT NOT NULL,
    phase assessment_phase NOT NULL,
    question_context VARCHAR(500),
    timestamp_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON COLUMN transcript_entries.question_context IS 'Which question this entry relates to (question ID or topic)';
COMMENT ON COLUMN transcript_entries.timestamp_ms IS 'Milliseconds since session start';
