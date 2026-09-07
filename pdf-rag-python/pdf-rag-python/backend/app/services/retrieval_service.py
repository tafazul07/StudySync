from typing import List, Dict
import numpy as np
from app.services.embedding_service import generate_embedding
from app.services.vectorstore_service import vector_store
from app.config import settings

async def retrieve_relevant_chunks(query: str, top_k: int = None, user_id: str = None) -> List[Dict]:
    """Retrieve top-k most relevant chunks for a query."""
    top_k = top_k or settings.TOP_K

    query_embedding = await generate_embedding(query)
    results = await vector_store.search(query_embedding, top_k, user_id)

    return [
        {
            "content": r["content"],
            "score": r["score"],
            "metadata": r["metadata"],
            "doc_id": r["doc_id"]
        }
        for r in results
    ]

def format_context(chunks: List[Dict]) -> str:
    """Format retrieved chunks into context string for LLM."""
    parts = []
    for i, chunk in enumerate(chunks):
        relevance = chunk.get("score", 0)
        parts.append(
            f"[Document {i+1}] (relevance: {relevance*100:.1f}%)\n{chunk['content']}"
        )
    return "\n\n---\n\n".join(parts)
