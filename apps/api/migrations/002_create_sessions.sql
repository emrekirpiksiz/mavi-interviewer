-- Migration: 002_create_sessions
-- Description: Create sessions table

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status session_status NOT NULL DEFAULT 'pending',
    current_phase interview_phase NOT NULL DEFAULT 'introduction',
    current_question_index INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Comment on table
COMMENT ON TABLE sessions IS 'Main interview sessions table';
COMMENT ON COLUMN sessions.id IS 'Primary key, returned to ATS as sessionId';
COMMENT ON COLUMN sessions.status IS 'Current session status';
COMMENT ON COLUMN sessions.current_phase IS 'Active interview phase';
COMMENT ON COLUMN sessions.current_question_index IS 'Current question sequence number (0-based)';
COMMENT ON COLUMN sessions.started_at IS 'Interview start time (first WS connection)';
COMMENT ON COLUMN sessions.ended_at IS 'Interview end time';
COMMENT ON COLUMN sessions.deleted_at IS 'Soft delete timestamp';
