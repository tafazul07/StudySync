from app.services.websearches import search_web


async def get_web_search(query: str, limit: int = 5):
    """Get web search results from DuckDuckGo."""
    if not query or not query.strip():
        raise ValueError("Query cannot be empty")

    results = search_web(query, limit=limit)
    return {
        "success": True,
        "query": query,
        "results": results,
        "total": len(results),
        "source": "DuckDuckGo"
    }
