-- ============================================================
-- Neon DB Read Replica Setup SQL
-- ============================================================
-- Run these queries in your Neon DB console to set up read replica
-- ============================================================

-- 1. Create replication user (if not exists)
-- Note: Neon may handle replication users differently
-- Check Neon documentation for their specific replication setup

-- 2. Grant replication permissions (if needed)
-- ALTER USER your_replication_user WITH REPLICATION;

-- 3. Configure PostgreSQL for replication
-- These settings may need to be adjusted based on Neon's configuration

-- Enable WAL level for replication
-- ALTER SYSTEM SET wal_level = 'replica';

-- Set max WAL senders
-- ALTER SYSTEM SET max_wal_senders = 10;

-- Set max replication slots
-- ALTER SYSTEM SET max_replication_slots = 10;

-- 4. Create a publication for logical replication (if using logical replication)
-- CREATE PUBLICATION studysync_pub FOR ALL TABLES;

-- 5. Verify replication status
-- Run this to check if replication is working:
-- SELECT * FROM pg_stat_replication;

-- 6. Check if this is a replica or master
-- SELECT pg_is_in_recovery();

-- ============================================================
-- After setting up replication, provide:
-- - Master DB URL (primary)
-- - Replica DB URL (read replica)
-- ============================================================

-- Example connection strings (replace with your actual URLs):
-- Master: postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname
-- Replica: postgresql://user:password@ep-yyy.region.aws.neon.tech/dbname

-- ============================================================
-- Notes for Neon specifically:
-- ============================================================
-- 1. Neon uses a different replication model than traditional PostgreSQL
-- 2. You may need to use Neon's dashboard to create read replicas
-- 3. Check Neon's documentation for their specific replication setup
-- 4. Neon may provide a separate connection string for read replicas
-- ============================================================
