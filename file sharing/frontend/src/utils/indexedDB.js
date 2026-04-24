import { openDB } from 'idb';

const DB_NAME = 'FileSharingDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

// Initialize database
export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    },
  });
};

// Save file to IndexedDB
export const saveFileToIndexedDB = async (fileData) => {
  const db = await initDB();
  await db.put(STORE_NAME, fileData);
  return fileData;
};

// Get file by ID
export const getFileFromIndexedDB = async (id) => {
  const db = await initDB();
  return db.get(STORE_NAME, id);
};

// Get all files
export const getAllFilesFromIndexedDB = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

// Delete file from IndexedDB
export const deleteFileFromIndexedDB = async (id) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

// Mark file as synced
export const markFileAsSynced = async (id, serverId) => {
  const db = await initDB();
  const file = await db.get(STORE_NAME, id);
  if (file) {
    file.synced = true;
    file.serverId = serverId;
    await db.put(STORE_NAME, file);
  }
};

// Get unsynced files
export const getUnsyncedFiles = async () => {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, 'synced', false);
};