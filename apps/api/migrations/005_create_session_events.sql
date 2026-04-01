-- Migration: 005_create_session_events
-- Description: Create session_events table for audit logging

CREATE TABLE session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE session_events IS 'Audit log for important session events';
COMMENT ON COLUMN session_events.event_type IS 'Type of event (session_created, phase_changed, etc.)';
COMMENT ON COLUMN session_events.event_data IS 'Additional event details (optional JSONB)';
