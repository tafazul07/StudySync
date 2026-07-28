from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

async def error_handler(request: Request, exc: Exception):
    """Global error handler."""
    status_code = 500
    message = str(exc)

    if "PDF extraction failed" in message:
        status_code = 422
    elif "No text could be extracted" in message:
        status_code = 422
    elif "AI generation failed" in message:
        status_code = 502
    elif "OpenRouter API error" in message:
        status_code = 502
    elif "No documents found" in message:
        status_code = 404

    print(f"Error: {message}")
    print(traceback.format_exc())

    return JSONResponse(
        status_code=status_code,
        content={"error": message}
    )
