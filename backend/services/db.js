import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('⚠️ WARNING: DATABASE_URL is not set in .env! Database connection will fail.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
});

// Test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ Connected to Neon PostgreSQL');
    client.release();
  })
  .catch(err => {
    console.error('❌ Failed to connect to Neon PostgreSQL:', err.message);
  });

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

// Query helper with error handling
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL) {
      console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Get client for transactions
export async function getClient() {
  return await pool.connect();
}

export function getPool() {
  return pool;
}

export default pool;
