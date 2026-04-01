-- Migration: 006_create_indexes
-- Description: Create indexes for performance optimization

-- Status-based filtering (exclude soft-deleted)
CREATE INDEX idx_sessions_status ON sessions(status) WHERE deleted_at IS NULL;

-- Transcript queries - ordered retrieval
CREATE INDEX idx_transcript_session_seq ON transcript_entries(session_id, sequence_number) 
    WHERE deleted_at IS NULL;

-- Events queries - session events with time ordering
CREATE INDEX idx_events_session_created ON session_events(session_id, created_at);

-- Fast filtering of non-deleted sessions
CREATE INDEX idx_sessions_not_deleted ON sessions(id) WHERE deleted_at IS NULL;
