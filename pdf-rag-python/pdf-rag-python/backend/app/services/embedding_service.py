import numpy as np
from typing import List, Dict
from sentence_transformers import SentenceTransformer
from app.utils.cache import embedding_cache
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Global model instance
_embedder = None
_executor = ThreadPoolExecutor(max_workers=1)

async def initialize_embedder():
    """Initialize the sentence transformer model."""
    global _embedder
    if _embedder is None:
        # Use a lightweight but effective model
        _embedder = SentenceTransformer('all-MiniLM-L6-v2')
        print("Embedding model loaded successfully")
    return _embedder

def _generate_embedding_sync(text: str) -> np.ndarray:
    """Synchronous embedding generation."""
    global _embedder
    if _embedder is None:
        raise RuntimeError("Embedder not initialized. Call initialize_embedder() first.")
    return _embedder.encode(text, convert_to_numpy=True, normalize_embeddings=True)

async def generate_embedding(text: str) -> np.ndarray:
    """Generate embedding with caching."""
    cache_key = text[:200]  # Cache key from first 200 chars
    cached = embedding_cache.get(cache_key)
    if cached is not None:
        return cached

    # Run in thread pool to not block event loop
    loop = asyncio.get_event_loop()
    embedding = await loop.run_in_executor(_executor, _generate_embedding_sync, text)

    embedding_cache.set(cache_key, embedding)
    return embedding

async def generate_embeddings(chunks: List[Dict]) -> List[Dict]:
    """Generate embeddings for all chunks."""
    results = []
    for chunk in chunks:
        embedding = await generate_embedding(chunk["content"])
        results.append({
            **chunk,
            "embedding": embedding
        })
    return results
