-- Migration: 008_create_webhook_logs
-- Description: Create webhook_logs table for callback logging

CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    webhook_type VARCHAR(50) NOT NULL,
    endpoint_url TEXT NOT NULL,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_session_id ON webhook_logs(session_id);
CREATE INDEX idx_webhook_logs_type ON webhook_logs(webhook_type);
CREATE INDEX idx_webhook_logs_success ON webhook_logs(success) WHERE success = false;

COMMENT ON TABLE webhook_logs IS 'Log of all callback webhook calls';
