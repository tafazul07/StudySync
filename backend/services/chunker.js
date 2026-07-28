import { generateEmbedding } from './openrouter.js';
import dbStore from './dbStore.js';

function chunkText(text, chunkSize = 800, overlap = 100) {
  if (!text || text.trim().length === 0) return [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 50) chunks.push(chunk);
  }
  if (chunks.length === 0 && text.trim().length > 0) chunks.push(text.trim());
  return chunks;
}

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function storeChunksWithEmbeddings(docId, chunksList) {
  // Add chunks to database
  for (const chunkText of chunksList) {
    await dbStore.insert('document_chunks', {
      document_id: docId,
      chunk_text: chunkText,
      embedding: null
    });
  }

  // Generate embeddings for each chunk
  const chunks = await dbStore.select('document_chunks', { document_id: docId });
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.chunk_text);
      await dbStore.updateOne('document_chunks', { id: chunk.id }, { embedding: JSON.stringify(embedding) });
    } catch (err) {
      console.warn(`Embedding failed for chunk ${chunk.id}:`, err.message);
    }
  }
}

async function findRelevantChunks(docId, query, nResults = 5) {
  const chunks = await dbStore.select('document_chunks', { document_id: docId });
  if (chunks.length === 0) return [];

  const queryEmbedding = await generateEmbedding(query);

  const scored = chunks
    .filter(c => c.embedding) // Only chunks with embeddings
    .map(chunk => ({
      text: chunk.chunk_text,
      similarity: cosineSimilarity(queryEmbedding, JSON.parse(chunk.embedding))
    }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, nResults).map(s => s.text);
}

export {
  chunkText,
  storeChunksWithEmbeddings,
  findRelevantChunks
};
