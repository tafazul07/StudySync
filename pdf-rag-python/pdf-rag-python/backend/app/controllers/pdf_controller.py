from fastapi import UploadFile
from app.services.pdf_service import extract_text_from_pdf
from app.services.chunking_service import split_into_chunks
from app.services.embedding_service import generate_embeddings
from app.services.vectorstore_service import vector_store
import uuid

async def upload_pdf(file: UploadFile):
    """Handle PDF upload and indexing."""
    contents = await file.read()

    if len(contents) == 0:
        raise ValueError("Empty file uploaded")

    # Extract text
    result = await extract_text_from_pdf(contents)
    text = result["text"]

    if not text or len(text.strip()) == 0:
        raise ValueError("No text could be extracted from PDF")

    # Chunk and embed
    doc_id = str(uuid.uuid4())
    chunks = split_into_chunks(text)
    chunks_with_embeddings = await generate_embeddings(chunks)
    stored_count = await vector_store.add_document(doc_id, chunks_with_embeddings)

    return {
        "success": True,
        "document_id": doc_id,
        "filename": file.filename,
        "pages": result["pages"],
        "total_chunks": stored_count,
        "text_length": len(text),
        "info": result["info"]
    }

async def get_stats():
    """Get vector store statistics."""
    return vector_store.get_stats()

async def clear_all():
    """Clear all documents."""
    vector_store.clear_all()
    return {"success": True, "message": "All documents cleared"}
