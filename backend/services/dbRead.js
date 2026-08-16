import pg from 'pg';
const { Pool } = pg;

let readPool = null;

/**
 * Initialize read replica connection pool
 */
export function initReadPool() {
  const readUrl = process.env.DATABASE_READ_URL || process.env.DATABASE_URL;
  
  if (!readUrl) {
    console.warn('DATABASE_READ_URL not set, read queries will use primary');
    return null;
  }

  readPool = new Pool({
    connectionString: readUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  readPool.on('error', (err) => {
    console.error('Read replica pool error:', err);
  });

  return readPool;
}

/**
 * Execute a read query on the replica
 */
export async function query(text, params) {
  if (!readPool) {
    // Fallback to primary if read pool not initialized
    const { query: primaryQuery } = await import('./db.js');
    return primaryQuery(text, params);
  }

  const start = Date.now();
  try {
    const res = await readPool.query(text, params);
    const duration = Date.now() - start;
    console.log('Read query executed', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Read query error, falling back to primary:', error);
    // Fallback to primary on error
    const { query: primaryQuery } = await import('./db.js');
    return primaryQuery(text, params);
  }
}

/**
 * Get a read replica client
 */
export async function getClient() {
  if (!readPool) {
    const { getClient: getPrimaryClient } = await import('./db.js');
    return getPrimaryClient();
  }
  return readPool.connect();
}

// Initialize read pool on module load
initReadPool();

export default { query, getClient };
