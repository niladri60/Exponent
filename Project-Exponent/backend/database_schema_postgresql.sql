-- Create database
CREATE DATABASE project_exponent;

-- Connect to the database
\c project_exponent;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- GAMES TABLE
-- =====================================================
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url VARCHAR(500),
    game_folder_url VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT CHECK (file_size > 0 AND file_size < 104857600), -- Max 100MB
    mime_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES (for performance)
-- =====================================================
-- Full-text search on title
CREATE INDEX idx_games_title_tsvector ON games USING gin(to_tsvector('english', title));

-- Sort and filter optimization
CREATE INDEX idx_games_created_at ON games(created_at DESC);
CREATE INDEX idx_games_is_active ON games(is_active);

-- JSONB queries (if you store custom game metadata)
CREATE INDEX idx_games_metadata_gin ON games USING gin(metadata);

-- =====================================================
-- AUTOMATIC TIMESTAMP UPDATES
-- =====================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON games
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
