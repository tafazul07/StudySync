from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.controllers.query_controller import ask_question

router = APIRouter()

class QueryRequest(BaseModel):
    question: str
    top_k: Optional[int] = 5

@router.post("/ask")
async def ask_route(request: QueryRequest):
    """Ask a question about uploaded documents."""
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    return await ask_question(request.question, request.top_k)
