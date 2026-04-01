-- Migration: 004_create_transcript_entries
-- Description: Create transcript_entries table for conversation records

CREATE TABLE transcript_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    speaker speaker_type NOT NULL,
    content TEXT NOT NULL,
    phase interview_phase NOT NULL,
    question_context TEXT,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(session_id, sequence_number)
);

-- Comments
COMMENT ON TABLE transcript_entries IS 'Individual conversation entries in interviews';
COMMENT ON COLUMN transcript_entries.sequence_number IS 'Order of the entry (1, 2, 3...)';
COMMENT ON COLUMN transcript_entries.speaker IS 'Who spoke: ai or candidate';
COMMENT ON COLUMN transcript_entries.content IS 'The spoken text';
COMMENT ON COLUMN transcript_entries.phase IS 'Interview phase when this was spoken';
COMMENT ON COLUMN transcript_entries.question_context IS 'Topic context (e.g., "React")';
COMMENT ON COLUMN transcript_entries.timestamp_ms IS 'Milliseconds from interview start';
