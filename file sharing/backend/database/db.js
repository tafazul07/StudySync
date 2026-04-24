const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'file_sharing',
    password: 'admin123',
    port: 5432,
});

// Test connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection FAILED:', err.message);
        console.error('Check if PostgreSQL is running and credentials are correct');
    } else {
        console.log('✅ Database connected successfully');
        client.query('SELECT NOW()', (err, result) => {
            if (err) {
                console.error('❌ Test query failed:', err);
            } else {
                console.log('✅ Database time:', result.rows[0].now);
            }
            release();
        });
    }
});

// Log all pool errors
pool.on('error', (err) => {
    console.error('❌ Unexpected pool error:', err);
});

module.exports = pool;