-- Migration: 003_create_assessment_configs
-- Description: Create assessment_configs table for session configuration data

CREATE TABLE assessment_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    assessment_data JSONB NOT NULL,
    questions_data JSONB NOT NULL,
    candidate_data JSONB NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE assessment_configs IS 'Assessment configuration data for each session';
COMMENT ON COLUMN assessment_configs.assessment_data IS 'Assessment title, introText, closingText (JSONB)';
COMMENT ON COLUMN assessment_configs.questions_data IS 'Ordered questions array with correctAnswer and correctOnWrong (JSONB)';
COMMENT ON COLUMN assessment_configs.candidate_data IS 'Candidate name, email, personnelCode, position, store (JSONB)';
COMMENT ON COLUMN assessment_configs.settings IS 'Session settings: cameraMonitoring, maxDurationMinutes, language (JSONB)';
