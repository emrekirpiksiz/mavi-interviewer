-- Migration: 008_create_webhook_logs
-- Description: Create webhook_logs table for MatchMind API integration logging

CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    webhook_type VARCHAR(50) NOT NULL,  -- 'matchmind_status', 'matchmind_transaction'
    endpoint_url TEXT NOT NULL,
    request_body JSONB NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for querying logs by session
CREATE INDEX idx_webhook_logs_session_id ON webhook_logs(session_id);

-- Index for querying by webhook type
CREATE INDEX idx_webhook_logs_webhook_type ON webhook_logs(webhook_type);

-- Index for querying by success status
CREATE INDEX idx_webhook_logs_success ON webhook_logs(success);

-- Comments
COMMENT ON TABLE webhook_logs IS 'Logs for external webhook API calls (MatchMind, etc.)';
COMMENT ON COLUMN webhook_logs.webhook_type IS 'Type of webhook (matchmind_status, matchmind_transaction)';
COMMENT ON COLUMN webhook_logs.endpoint_url IS 'Full URL of the API endpoint called';
COMMENT ON COLUMN webhook_logs.request_body IS 'JSON request body sent to the API';
COMMENT ON COLUMN webhook_logs.response_status IS 'HTTP response status code';
COMMENT ON COLUMN webhook_logs.response_body IS 'JSON response body from the API';
COMMENT ON COLUMN webhook_logs.duration_ms IS 'Request duration in milliseconds';
COMMENT ON COLUMN webhook_logs.success IS 'Whether the request was successful';
COMMENT ON COLUMN webhook_logs.error_message IS 'Error message if request failed';
COMMENT ON COLUMN webhook_logs.retry_count IS 'Number of retry attempts made';
