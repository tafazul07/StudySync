-- Migration: Add password reset columns to users table
-- Run this on your database to enable password reset functionality

-- Add reset token column
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);

-- Add reset token expiry timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
