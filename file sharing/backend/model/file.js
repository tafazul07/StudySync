const pool = require('../database/db.js');

const File = {
    async create({ id, path, name }) {
        const fileId = String(id || (Date.now().toString() + Math.random().toString(36).substr(2, 9))).substring(0, 255);
        
        console.log('📝 DB INSERT attempt:', { id: fileId, path, name });
        
        try {
            // Check if pool is working
            const client = await pool.connect();
            console.log('✅ Got client from pool');
            
            const result = await client.query(
                'INSERT INTO files (id, path, name) VALUES ($1, $2, $3) RETURNING *',
                [fileId, path, name]
            );
            
            client.release();
            console.log('✅ DB INSERT SUCCESS:', result.rows[0]);
            return result.rows[0];
        } catch (err) {
            console.error('❌ DB INSERT ERROR:', err.message);
            console.error('Full error:', err.stack);
            throw err;
        }
    },

    async findAll() {
        try {
            const result = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
            return result.rows;
        } catch (err) {
            console.error('findAll error:', err.message);
            return [];
        }
    },

    async findById(id) {
        try {
            const result = await pool.query('SELECT * FROM files WHERE id = $1', [String(id)]);
            return result.rows[0] || null;
        } catch (err) {
            console.error('findById error:', err.message);
            return null;
        }
    },

    async incrementDownloads(id) {
        const result = await pool.query(
            'UPDATE files SET download_count = download_count + 1 WHERE id = $1 RETURNING *',
            [String(id)]
        );
        return result.rows[0];
    },

    async delete(id) {
        await pool.query('DELETE FROM files WHERE id = $1', [String(id)]);
        return { deleted: true };
    }
};

module.exports = File;