-- Migration: 001_create_enums
-- Description: Create ENUM types for the orientation assessment application

CREATE TYPE session_status AS ENUM (
    'pending',
    'active',
    'completed',
    'failed'
);

CREATE TYPE assessment_phase AS ENUM (
    'introduction',
    'assessment',
    'closing'
);

CREATE TYPE speaker_type AS ENUM (
    'ai',
    'candidate'
);
