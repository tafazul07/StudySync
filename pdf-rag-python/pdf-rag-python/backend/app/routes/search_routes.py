from fastapi import APIRouter, HTTPException, Query
from app.controllers.search_controller import get_web_search

router = APIRouter()


@router.get("/web")
async def web_search_route(query: str = Query(..., min_length=1), limit: int = Query(5, ge=1, le=20)):
    """Search the web for query results."""
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    return await get_web_search(query, limit=limit)
