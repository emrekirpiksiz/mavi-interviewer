-- Migration: 006_create_indexes
-- Description: Create performance indexes

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_external_id ON sessions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_assessment_configs_session_id ON assessment_configs(session_id);
CREATE INDEX idx_transcript_entries_session_id ON transcript_entries(session_id);
CREATE INDEX idx_transcript_entries_sequence ON transcript_entries(session_id, sequence_number);
CREATE INDEX idx_session_events_session_id ON session_events(session_id);
CREATE INDEX idx_session_events_type ON session_events(event_type);
