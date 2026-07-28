import numpy as np
import faiss
from typing import List, Dict, Optional, Tuple
from app.utils.similarity import cosine_similarity

class VectorStore:
    """FAISS-based vector store for efficient similarity search."""

    def __init__(self, dimension: int = 384):
        self.dimension = dimension
        self.index = None
        self.documents = []  # List of chunk metadata
        self.doc_id_map = {}  # doc_id -> list of indices
        self._build_index()

    def _build_index(self):
        """Build FAISS index."""
        # Using IndexFlatIP for cosine similarity with normalized vectors
        self.index = faiss.IndexFlatIP(self.dimension)

    async def add_document(self, doc_id: str, chunks_with_embeddings: List[Dict]) -> int:
        """Add document chunks to vector store."""
        if not chunks_with_embeddings:
            return 0

        embeddings = []
        start_idx = len(self.documents)

        for i, chunk in enumerate(chunks_with_embeddings):
            embedding = chunk["embedding"]
            if isinstance(embedding, list):
                embedding = np.array(embedding, dtype=np.float32)
            elif not isinstance(embedding, np.ndarray):
                embedding = np.array(embedding, dtype=np.float32)

            # Ensure 1D and correct dtype
            embedding = embedding.astype(np.float32).flatten()

            # Normalize for cosine similarity
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = embedding / norm

            embeddings.append(embedding)

            self.documents.append({
                "id": f"{doc_id}-{chunk['id']}",
                "doc_id": doc_id,
                "content": chunk["content"],
                "metadata": {
                    "index": chunk["index"],
                    "token_count": chunk.get("token_count", 0)
                }
            })

        # Add to FAISS index
        embeddings_array = np.array(embeddings, dtype=np.float32)
        self.index.add(embeddings_array)

        # Track doc_id indices
        end_idx = len(self.documents)
        self.doc_id_map[doc_id] = list(range(start_idx, end_idx))

        return len(chunks_with_embeddings)

    async def search(self, query_embedding: np.ndarray, top_k: int = 5) -> List[Dict]:
        """Search for most similar chunks."""
        if self.index.ntotal == 0:
            return []

        # Ensure query is properly formatted
        if isinstance(query_embedding, list):
            query_embedding = np.array(query_embedding, dtype=np.float32)
        query_embedding = query_embedding.astype(np.float32).flatten()

        # Normalize query
        norm = np.linalg.norm(query_embedding)
        if norm > 0:
            query_embedding = query_embedding / norm

        # Reshape for FAISS (1, dimension)
        query_embedding = query_embedding.reshape(1, -1)

        # Search
        scores, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.documents):
                continue
            doc = self.documents[idx]
            results.append({
                **doc,
                "score": float(score)  # IP score = cosine similarity for normalized vectors
            })

        return results

    def get_stats(self) -> Dict:
        """Get store statistics."""
        return {
            "documents": len(self.doc_id_map),
            "total_chunks": len(self.documents),
            "index_size": self.index.ntotal
        }

    def clear_document(self, doc_id: str):
        """Remove a document from the store."""
        # Note: FAISS doesn't support deletion easily, so we mark as deleted
        # For production, use IDMap or rebuild index
        if doc_id in self.doc_id_map:
            indices = self.doc_id_map[doc_id]
            for idx in indices:
                if idx < len(self.documents):
                    self.documents[idx] = None
            del self.doc_id_map[doc_id]

    def clear_all(self):
        """Clear all documents."""
        self._build_index()
        self.documents = []
        self.doc_id_map = {}

# Global vector store instance
vector_store = VectorStore(dimension=384)
