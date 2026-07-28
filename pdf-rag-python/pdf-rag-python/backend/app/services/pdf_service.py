from io import BytesIO
from typing import Dict, Any
import PyPDF2
from app.utils.text_cleaner import clean_text

async def extract_text_from_pdf(file_bytes: bytes) -> Dict[str, Any]:
    """Extract text from PDF bytes."""
    try:
        pdf_file = BytesIO(file_bytes)
        reader = PyPDF2.PdfReader(pdf_file)

        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

        raw_text = "\n".join(text_parts)
        cleaned_text = clean_text(raw_text)

        info = reader.metadata or {}

        return {
            "text": cleaned_text,
            "pages": len(reader.pages),
            "info": {
                "title": info.get("/Title", None),
                "author": info.get("/Author", None),
                "subject": info.get("/Subject", None),
                "creator": info.get("/Creator", None)
            }
        }
    except Exception as e:
        raise ValueError(f"PDF extraction failed: {str(e)}")
