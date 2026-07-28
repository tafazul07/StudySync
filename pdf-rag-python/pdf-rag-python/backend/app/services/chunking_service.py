from typing import List, Dict
import re
from app.config import settings
from app.utils.text_cleaner import estimate_tokens

def split_into_chunks(text: str, chunk_size: int = None, overlap: int = None) -> List[Dict]:
    """Split text into overlapping chunks with sentence awareness."""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap or settings.CHUNK_OVERLAP

    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks = []
    current_chunk = ""
    chunk_index = 0

    for sentence in sentences:
        projected = f"{current_chunk} {sentence}".strip() if current_chunk else sentence
        tokens = estimate_tokens(projected)

        if tokens > chunk_size and current_chunk:
            # Store current chunk
            chunks.append({
                "id": f"chunk-{chunk_index}",
                "content": current_chunk.strip(),
                "index": chunk_index,
                "token_count": estimate_tokens(current_chunk)
            })
            chunk_index += 1

            # Get overlap text
            overlap_text = get_overlap_text(current_chunk, overlap)
            current_chunk = f"{overlap_text} {sentence}".strip() if overlap_text else sentence
        else:
            current_chunk = projected

    # Don't forget the last chunk
    if current_chunk.strip():
        chunks.append({
            "id": f"chunk-{chunk_index}",
            "content": current_chunk.strip(),
            "index": chunk_index,
            "token_count": estimate_tokens(current_chunk)
        })

    return chunks

def get_overlap_text(text: str, overlap_tokens: int) -> str:
    """Get the last N words for overlap."""
    words = text.split()
    overlap_words = max(1, int(overlap_tokens * 0.75))  # ~0.75 words per token
    if len(words) <= overlap_words:
        return text
    return " ".join(words[-overlap_words:])
