-- Migration: Add conversation history and state persistence columns
-- Date: 2026-01-25
-- Purpose: Enable session persistence for reconnection scenarios

-- Add conversation history column for Claude context
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;

-- Add last AI message for quick reference
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_ai_message TEXT;

-- Add phase question counts for tracking
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS phase_question_counts JSONB DEFAULT '{}'::jsonb;

-- Add interview state for reconnection
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS interview_state VARCHAR(50) DEFAULT 'IDLE';

-- Create index for active sessions lookup
CREATE INDEX IF NOT EXISTS idx_sessions_status_active 
ON sessions(status) 
WHERE status = 'active' AND deleted_at IS NULL;

-- Comment on columns
COMMENT ON COLUMN sessions.conversation_history IS 'Array of {role, content} messages for Claude context';
COMMENT ON COLUMN sessions.last_ai_message IS 'Last AI message for quick reference during reconnection';
COMMENT ON COLUMN sessions.phase_question_counts IS 'Object mapping phase names to question counts';
COMMENT ON COLUMN sessions.interview_state IS 'Current state machine state (IDLE, READY, AI_SPEAKING, etc.)';
