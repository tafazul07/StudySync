from app.services.retrieval_service import retrieve_relevant_chunks, format_context
from app.services.ai_service import generate_answer
from app.config import settings

async def ask_question(question: str, top_k: int = None, user_id: str = None):
    """Handle question answering."""
    top_k = top_k or settings.TOP_K

    # Retrieve relevant chunks
    chunks = await retrieve_relevant_chunks(question, top_k, user_id)

    if not chunks:
        return {
            "success": False,
            "error": "No documents found. Please upload a PDF first."
        }

    # Temporarily disable AI generation for testing
    return {
        "success": True,
        "question": question,
        "answer": f"Found {len(chunks)} relevant chunks from the document. AI generation temporarily disabled for testing.",
        "cached": False,
        "model_used": "retrieval_test",
        "sources": [
            {
                "content": c["content"][:300] + "..." if len(c["content"]) > 300 else c["content"],
                "relevance": round(c["score"], 3),
                "doc_id": c["doc_id"]
            }
            for c in chunks
        ]
    }
