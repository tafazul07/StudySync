import { query, getClient } from './db.js';
import crypto from 'crypto';

// UUID v1-v5 format regex (case-insensitive)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

// Column names that store UUID references in PostgreSQL
const UUID_COLUMNS = new Set([
  'id', 'user_id', 'study_plan_id', 'document_id',
  'quiz_id', 'doc_id', 'owner_id', 'shared_by',
  'shared_with', 'created_by', 'vault_id'
]);

// Database table schemas
const SCHEMAS = {
  study_plans: {
    id: 'string',
    title: 'string',
    description: 'string',
    subject: 'string',
    start_date: 'string',
    end_date: 'string',
    created_at: 'string',
    updated_at: 'string',
    original_filename: 'string',
    file_path: 'string',
    extracted_text: 'string',
    plan_content: 'string',
    user_id: 'string'
  },
  deadlines: {
    id: 'string',
    study_plan_id: 'string',
    title: 'string',
    description: 'string',
    due_date: 'string',
    priority: 'string',
    status: 'string',
    email: 'string',
    user_id: 'string',
    created_at: 'string'
  },
  documents: {
    id: 'string',
    title: 'string',
    content: 'string',
    owner_id: 'string',
    created_at: 'string',
    updated_at: 'string'
  },
  document_updates: {
    id: 'string',
    document_id: 'string',
    user_id: 'string',
    changes: 'string',
    timestamp: 'string'
  },
  document_versions: {
    id: 'string',
    document_id: 'string',
    content: 'string',
    created_by: 'string',
    created_at: 'string'
  },
  comments: {
    id: 'string',
    document_id: 'string',
    user_id: 'string',
    content: 'string',
    created_at: 'string'
  },
  paragraph_permissions: {
    id: 'string',
    document_id: 'string',
    paragraph_index: 'number',
    user_id: 'string',
    permission: 'string'
  },
  shared_files: {
    id: 'string',
    filename: 'string',
    original_name: 'string',
    file_path: 'string',
    file_size: 'number',
    mime_type: 'string',
    encryption_key: 'string',
    shared_by: 'string',
    download_count: 'number',
    max_downloads: 'number',
    expires_at: 'string',
    vault_id: 'string',
    file_token: 'string',
    share_token: 'string',
    created_at: 'string'
  },
  vaults: {
    id: 'string',
    name: 'string',
    description: 'string',
    vault_token: 'string',
    password_hash: 'string',
    owner_id: 'string',
    created_at: 'string'
  },
  quizzes: {
    id: 'string',
    title: 'string',
    doc_id: 'string',
    quiz_type: 'string',
    topic: 'string',
    num_questions: 'number',
    difficulty: 'string',
    questions: 'string',
    created_at: 'string'
  },
  quiz_attempts: {
    id: 'string',
    quiz_id: 'string',
    score: 'number',
    total_questions: 'number',
    answers: 'string',
    subtopic_breakdown: 'string',
    topic: 'string',
    completed_at: 'string',
    created_at: 'string'
  },
  webrtc_rooms: {
    id: 'string',
    name: 'string',
    created_by: 'string',
    created_at: 'string',
    active: 'boolean'
  },
  rag_documents: {
    id: 'string',
    filename: 'string',
    original_name: 'string',
    file_type: 'string',
    text_length: 'number',
    preview: 'string',
    topics: 'string',
    indexed_at: 'string',
    chunk_count: 'number',
    user_id: 'string'
  },
  document_chunks: {
    id: 'string',
    document_id: 'string',
    chunk_text: 'string',
    embedding: 'string',
    created_at: 'string'
  },
  users: {
    id: 'string',
    email: 'string',
    password_hash: 'string',
    full_name: 'string',
    role: 'string',
    is_verified: 'boolean',
    avatar_url: 'string',
    created_at: 'string',
    updated_at: 'string'
  },
  sessions: {
    id: 'string',
    user_id: 'string',
    token: 'string',
    expires_at: 'string',
    created_at: 'string'
  }
};

class DatabaseStore {
  // Check if an error is a UUID format error from PostgreSQL
  // Error code 22P02 = invalid_text_representation (e.g., invalid UUID syntax)
  _isUuidError(error) {
    return error.code === '22P02';
  }

  async init() {
    console.log('🔄 Initializing PostgreSQL Tables...');
    
    for (const [tableName, schema] of Object.entries(SCHEMAS)) {
      let columns = [];
      for (const [colName, type] of Object.entries(schema)) {
        let sqlType = 'TEXT';
        if (colName === 'id') {
          sqlType = 'VARCHAR(255) PRIMARY KEY';
        } else if (type === 'number') {
          sqlType = 'NUMERIC';
        } else if (type === 'boolean') {
          sqlType = 'BOOLEAN';
        }
        columns.push(`${colName} ${sqlType}`);
      }
      
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          ${columns.join(',\n          ')}
        );
      `;
      
      try {
        await query(createTableQuery);
      } catch (e) {
        console.error(`❌ Failed to create table ${tableName}:`, e.message);
      }

      // Add any missing columns to existing tables (self-healing schema)
      for (const [colName, type] of Object.entries(schema)) {
        let sqlType = 'TEXT';
        if (colName === 'id') continue; // skip PK
        else if (type === 'number') sqlType = 'NUMERIC';
        else if (type === 'boolean') sqlType = 'BOOLEAN';

        try {
          await query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${colName} ${sqlType}`);
        } catch (e) {
          // Some columns may already exist or have constraints; ignore non-critical errors
        }
      }
    }
    console.log('✅ PostgreSQL Tables synchronized');
  }

  generateId() {
    return crypto.randomUUID();
  }

  // CRUD Operations
  async insert(tableName, data) {
    const record = {
      id: this.generateId(),
      ...data,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString()
    };

    const schema = SCHEMAS[tableName];
    if (!schema) throw new Error(`Table ${tableName} does not exist in schema`);

    const keys = [];
    const values = [];
    const placeholders = [];
    
    let i = 1;
    for (const key of Object.keys(record)) {
      if (schema[key] !== undefined) {
        keys.push(key);
        // Ensure booleans and numbers are correctly passed to pg, strings as strings
        values.push(record[key]);
        placeholders.push(`$${i}`);
        i++;
      }
    }

    const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await query(sql, values);
    return result.rows[0];
  }

  async select(tableName, filters = {}) {
    if (Object.keys(filters).length === 0) {
      const result = await query(`SELECT * FROM ${tableName}`);
      return result.rows;
    }

    const keys = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(filters)) {
      // NOTE: We do not support function filters with Postgres integration
      // If a function filter is passed, we skip it (this shouldn't happen in standard usage)
      if (typeof value !== 'function') {
        // Skip filters where a UUID column has a non-UUID value (prevents 22P02 errors)
        if (UUID_COLUMNS.has(key) && value !== null && !isValidUUID(value)) {
          return [];
        }
        keys.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }

    if (keys.length === 0) {
        const result = await query(`SELECT * FROM ${tableName}`);
        return result.rows;
    }

    const sql = `SELECT * FROM ${tableName} WHERE ${keys.join(' AND ')}`;
    try {
      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      // Gracefully handle invalid UUID format in filter values
      if (this._isUuidError(error)) return [];
      throw error;
    }
  }

  async selectOne(tableName, filters) {
    const records = await this.select(tableName, filters);
    return records.length > 0 ? records[0] : null;
  }

  async update(tableName, filters, updates) {
    const setKeys = [];
    const updateValues = [];
    let i = 1;

    const finalUpdates = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const schema = SCHEMAS[tableName];
    for (const [key, value] of Object.entries(finalUpdates)) {
        if (schema && schema[key] !== undefined) {
            setKeys.push(`${key} = $${i}`);
            updateValues.push(value);
            i++;
        }
    }

    if (setKeys.length === 0) return 0;

    const whereKeys = [];
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value !== 'function') {
        // Skip update where a UUID column has a non-UUID value (prevents 22P02 errors)
        if (UUID_COLUMNS.has(key) && value !== null && !isValidUUID(value)) {
          return 0;
        }
        whereKeys.push(`${key} = $${i}`);
        updateValues.push(value);
        i++;
      }
    }

    let sql = `UPDATE ${tableName} SET ${setKeys.join(', ')}`;
    if (whereKeys.length > 0) {
        sql += ` WHERE ${whereKeys.join(' AND ')}`;
    }
    
    try {
      const result = await query(sql, updateValues);
      return result.rowCount;
    } catch (error) {
      if (this._isUuidError(error)) return 0;
      throw error;
    }
  }

  async updateOne(tableName, filters, updates) {
    const count = await this.update(tableName, filters, updates);
    return count > 0;
  }

  async delete(tableName, filters) {
    const whereKeys = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (typeof value !== 'function') {
        // Skip delete where a UUID column has a non-UUID value (prevents 22P02 errors)
        if (UUID_COLUMNS.has(key) && value !== null && !isValidUUID(value)) {
          return 0;
        }
        whereKeys.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }

    if (whereKeys.length === 0) {
        throw new Error("DELETE without filters is not allowed through this wrapper");
    }

    const sql = `DELETE FROM ${tableName} WHERE ${whereKeys.join(' AND ')}`;
    try {
      const result = await query(sql, values);
      return result.rowCount;
    } catch (error) {
      if (this._isUuidError(error)) return 0;
      throw error;
    }
  }

  async deleteOne(tableName, filters) {
    const count = await this.delete(tableName, filters);
    return count > 0;
  }

  // Query helpers
  async findById(tableName, id) {
    // Short-circuit: if the ID is not a valid UUID, return null immediately
    // without hitting PostgreSQL (prevents 22P02 error on UUID columns)
    if (!isValidUUID(id)) {
      return null;
    }
    return this.selectOne(tableName, { id });
  }

  async findAll(tableName) {
    return this.select(tableName);
  }

  async count(tableName, filters = {}) {
    const records = await this.select(tableName, filters);
    return records.length;
  }

  // Transaction support using PostgreSQL BEGIN/COMMIT/ROLLBACK
  async transaction(operations) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const results = [];
      for (const operation of operations) {
        // Pass a mocked dbStore that uses this specific client
        const transactionalDbStore = {
            insert: async (tableName, data) => {
                const record = { id: this.generateId(), ...data, created_at: data.created_at || new Date().toISOString(), updated_at: data.updated_at || new Date().toISOString() };
                const schema = SCHEMAS[tableName];
                const keys = [], values = [], placeholders = [];
                let i = 1;
                for (const key of Object.keys(record)) {
                    if (schema && schema[key] !== undefined) {
                        keys.push(key); values.push(record[key]); placeholders.push(`$${i++}`);
                    }
                }
                const res = await client.query(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, values);
                return res.rows[0];
            },
            // Note: complex operations requiring full transaction scope aren't heavily used in the app,
            // but we provide the basic interface here just in case.
        };
        const result = await operation(transactionalDbStore);
        results.push(result);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Clear all data (useful for testing)
  async clearAll() {
    for (const tableName of Object.keys(SCHEMAS)) {
      await query(`TRUNCATE TABLE ${tableName} CASCADE`);
    }
  }

  // Get table schema
  getSchema(tableName) {
    return SCHEMAS[tableName];
  }

  // List all tables
  getTables() {
    return Object.keys(SCHEMAS);
  }
}

// Singleton instance
const dbStore = new DatabaseStore();

// Wait briefly to allow env variables to load before initializing
setTimeout(() => {
    dbStore.init().catch(err => console.error("Database init error:", err));
}, 1000);

export default dbStore;
