-- Migration: 001_create_enums
-- Description: Create ENUM types for the application

-- Session status enum
CREATE TYPE session_status AS ENUM (
    'pending',      -- ATS'den oluşturuldu, görüşme başlamadı
    'active',       -- Görüşme devam ediyor
    'completed',    -- Görüşme başarıyla tamamlandı
    'failed'        -- Hata nedeniyle sonlandı
);

-- Interview phases enum
CREATE TYPE interview_phase AS ENUM (
    'introduction',  -- Tanışma, görüşme kuralları
    'experience',    -- Deneyim soruları
    'technical',     -- Teknik sorular
    'behavioral',    -- Davranışsal sorular
    'motivation',    -- Motivasyon, kariyer hedefleri
    'closing'        -- Kapanış, sorular var mı
);

-- Speaker type enum
CREATE TYPE speaker_type AS ENUM (
    'ai',
    'candidate'
);
