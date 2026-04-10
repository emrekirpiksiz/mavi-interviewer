-- Migration: 007_add_conversation_history
-- Description: Add conversation history and state persistence fields to sessions

ALTER TABLE sessions
    ADD COLUMN conversation_history JSONB DEFAULT '[]',
    ADD COLUMN last_ai_message TEXT,
    ADD COLUMN phase_question_counts JSONB DEFAULT '{}',
    ADD COLUMN interview_state VARCHAR(50);

COMMENT ON COLUMN sessions.conversation_history IS 'LLM conversation history for context continuity';
COMMENT ON COLUMN sessions.last_ai_message IS 'Last AI message for reconnection recovery';
COMMENT ON COLUMN sessions.phase_question_counts IS 'Question counts per phase';
COMMENT ON COLUMN sessions.interview_state IS 'State machine state for reconnection';

CREATE INDEX idx_sessions_active ON sessions(id) WHERE status = 'active' AND deleted_at IS NULL;
