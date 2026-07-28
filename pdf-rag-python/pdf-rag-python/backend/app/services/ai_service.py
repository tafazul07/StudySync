import httpx
from typing import Dict, Any
from app.config import settings
from app.utils.cache import query_cache

async def generate_answer(query: str, context: str) -> Dict[str, Any]:
    """Generate answer using OpenRouter API."""
    cache_key = f"{query}-{context[:100]}"
    cached = query_cache.get(cache_key)
    if cached:
        return {"answer": cached, "cached": True, "model": settings.OPENROUTER_MODEL}

    system_prompt = """You are a precise document analysis assistant. Answer questions based ONLY on the provided context.
If the answer cannot be found in the context, say "I cannot find the answer in the provided documents."
Always cite which document section supports your answer. Be concise and accurate."""

    user_prompt = f"""Context from uploaded documents:

{context}

---

Question: {query}

Provide a clear, accurate answer based strictly on the context above."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                settings.OPENROUTER_BASE_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": settings.SITE_URL,
                    "X-Title": settings.SITE_NAME
                },
                json={
                    "model": settings.OPENROUTER_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2048
                }
            )

            response.raise_for_status()
            data = response.json()

            answer = data["choices"][0]["message"]["content"] if data.get("choices") else "No response generated"
            model_used = data.get("model", settings.OPENROUTER_MODEL)

            query_cache.set(cache_key, answer)
            return {"answer": answer, "cached": False, "model": model_used}

    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e, 'response') else str(e)
        raise RuntimeError(f"OpenRouter API error: {e.response.status_code} - {error_text}")
    except Exception as e:
        raise RuntimeError(f"AI generation failed: {str(e)}")
