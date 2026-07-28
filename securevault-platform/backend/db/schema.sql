-- =====================================================
-- Secure FileShare Platform - PostgreSQL Schema
-- =====================================================

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS vault_files CASCADE;
DROP TABLE IF EXISTS vaults CASCADE;
DROP TABLE IF EXISTS shared_files CASCADE;

-- =====================================================
-- Table: shared_files
-- Stores publicly shared files with download limits & expiry
-- =====================================================
CREATE TABLE shared_files (
    id              SERIAL PRIMARY KEY,
    original_name   VARCHAR(500) NOT NULL,
    stored_name     VARCHAR(100) NOT NULL UNIQUE,
    share_token     VARCHAR(64) NOT NULL UNIQUE,
    file_size       BIGINT NOT NULL,
    mime_type       VARCHAR(200),
    download_count  INTEGER DEFAULT 0,
    max_downloads   INTEGER,
    expires_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_max_downloads CHECK (max_downloads IS NULL OR max_downloads > 0)
);

-- Index for fast token lookups
CREATE INDEX idx_shared_files_token ON shared_files(share_token);
CREATE INDEX idx_shared_files_expires ON shared_files(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- Table: vaults
-- Password-protected personal vaults
-- =====================================================
CREATE TABLE vaults (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    vault_token     VARCHAR(64) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vaults_token ON vaults(vault_token);

-- =====================================================
-- Table: vault_files
-- Files stored inside password-protected vaults
-- =====================================================
CREATE TABLE vault_files (
    id              SERIAL PRIMARY KEY,
    vault_id        INTEGER NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    original_name   VARCHAR(500) NOT NULL,
    stored_name     VARCHAR(100) NOT NULL,
    file_token      VARCHAR(64) NOT NULL UNIQUE,
    file_size       BIGINT NOT NULL,
    mime_type       VARCHAR(200),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vault_files_vault ON vault_files(vault_id);
CREATE INDEX idx_vault_files_token ON vault_files(file_token);

-- =====================================================
-- SAMPLE DATA (Optional - for testing)
-- =====================================================

-- Example shared file entry (token is random, stored_name must match actual file)
-- INSERT INTO shared_files (original_name, stored_name, share_token, file_size, mime_type, max_downloads)
-- VALUES ('example.pdf', 'abc123def456.pdf', 'share_token_here', 1024000, 'application/pdf', 5);

-- Example vault (password is bcrypt hashed 'secret123')
-- INSERT INTO vaults (name, description, vault_token, password_hash)
-- VALUES ('My Documents', 'Personal files vault', 'vault_token_here', '$2a$12$...hash...');

-- Example vault file
-- INSERT INTO vault_files (vault_id, original_name, stored_name, file_token, file_size, mime_type)
-- VALUES (1, 'private.pdf', 'xyz789abc.pdf', 'file_token_here', 2048000, 'application/pdf');
