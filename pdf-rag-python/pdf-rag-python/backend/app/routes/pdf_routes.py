from fastapi import APIRouter, UploadFile, File, HTTPException
from app.controllers.pdf_controller import upload_pdf, get_stats, clear_all

router = APIRouter()

@router.post("/upload")
async def upload_pdf_route(file: UploadFile = File(...)):
    """Upload a PDF file for indexing."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    return await upload_pdf(file)

@router.get("/stats")
async def stats_route():
    """Get indexing statistics."""
    return await get_stats()

@router.delete("/clear")
async def clear_route():
    """Clear all indexed documents."""
    return await clear_all()
