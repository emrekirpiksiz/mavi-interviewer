-- Migration: 003_create_interview_configs
-- Description: Create interview_configs table for ATS data

CREATE TABLE interview_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    position_data JSONB NOT NULL,
    candidate_data JSONB NOT NULL,
    topics JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Comments
COMMENT ON TABLE interview_configs IS 'ATS configuration data for each session';
COMMENT ON COLUMN interview_configs.session_id IS 'Foreign key to sessions (1:1 relationship)';
COMMENT ON COLUMN interview_configs.position_data IS 'Company, position, responsibilities, requirements (JSONB)';
COMMENT ON COLUMN interview_configs.candidate_data IS 'Name, experiences, education, skills (JSONB)';
COMMENT ON COLUMN interview_configs.topics IS 'Interview topics array (JSONB)';
