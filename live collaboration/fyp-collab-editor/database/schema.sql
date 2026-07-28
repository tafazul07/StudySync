-- Run in pgAdmin Query Tool or psql
-- CREATE DATABASE brainsync; then run this

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) DEFAULT 'Untitled Document',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_updates (
    id SERIAL PRIMARY KEY,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    update_data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VERSION HISTORY (new addition)
CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(255),
    update_data BYTEA NOT NULL,
    change_summary VARCHAR(255) DEFAULT 'Manual save',
    created_by INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doc_id, version_number)
);

-- Paragraph-level permissions
CREATE TABLE IF NOT EXISTS paragraph_permissions (
    id SERIAL PRIMARY KEY,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    paragraph_id VARCHAR(100) NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 1,
    permission_type VARCHAR(20) CHECK (permission_type IN ('read', 'edit', 'none')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doc_id, paragraph_id, user_id)
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL DEFAULT 1,
    paragraph_id VARCHAR(100),
    content TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
