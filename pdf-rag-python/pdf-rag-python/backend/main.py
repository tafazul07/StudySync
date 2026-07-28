from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.routes import pdf_routes, query_routes, search_routes
from app.utils.cache import embedding_cache, query_cache
from app.services.embedding_service import initialize_embedder
from app.middleware.error_handler import error_handler
import uvicorn
from app.config import settings

app = FastAPI(
    title="PDF RAG System",
    description="Production-ready PDF Retrieval-Augmented Generation using OpenRouter",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF"])
app.include_router(query_routes.router, prefix="/api/query", tags=["Query"])
app.include_router(search_routes.router, prefix="/api/search", tags=["Search"])

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions with JSON response."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status": exc.status_code}
    )

app.add_exception_handler(Exception, error_handler)

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "documents_indexed": 0,
        "timestamp": "2026-05-01T12:00:00Z"
    }

@app.on_event("startup")
async def startup_event():
    print("Initializing embedding model...")
    await initialize_embedder()
    print("Server ready!")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
