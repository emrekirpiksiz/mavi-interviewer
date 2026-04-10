-- Migration: 002_create_sessions
-- Description: Create sessions table

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status session_status NOT NULL DEFAULT 'pending',
    current_phase assessment_phase NOT NULL DEFAULT 'introduction',
    current_question_index INTEGER NOT NULL DEFAULT 0,
    external_id VARCHAR(255),
    callback_url TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE sessions IS 'Assessment sessions';
COMMENT ON COLUMN sessions.external_id IS 'External reference ID from the calling application';
COMMENT ON COLUMN sessions.callback_url IS 'URL to POST transcript when assessment completes';
