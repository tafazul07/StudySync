import requests
import re
from urllib.parse import urlparse, parse_qs, urljoin, unquote

UA = "Mozilla/5.0 (compatible; PDF-RAG/1.0; +https://example.local) Chrome/124.0 Safari/537.36"


def decode_entities(s=""):
    return (
        s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&#x2F;", "/")
    )


def strip_tags(s=""):
    return re.sub(r"\s+", " ", decode_entities(re.sub(r"<[^>]+>", "", s))).strip()


def unwrap_ddg_url(href=""):
    try:
        if href.startswith("//"):
            href = "https:" + href
        parsed = urlparse(href)
        qs = parse_qs(parsed.query)
        if "uddg" in qs:
            return unquote(qs["uddg"][0])
        return href
    except Exception:
        return href


def instant_answer(query):
    try:
        url = "https://api.duckduckgo.com/"
        params = {
            "q": query,
            "format": "json",
            "no_html": 1,
            "no_redirect": 1,
            "t": "pdf-rag",
        }
        headers = {"User-Agent": UA}

        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return None

        j = r.json()
        if j.get("AbstractText") and j.get("AbstractURL"):
            return {
                "title": j.get("Heading") or query,
                "url": j["AbstractURL"],
                "snippet": j["AbstractText"],
                "source": j.get("AbstractSource", "DuckDuckGo"),
            }
        return None
    except Exception:
        return None


def html_results(query, limit=5):
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {"User-Agent": UA}
        params = {"q": query}

        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return []

        html = r.text

        results = []
        pattern = re.compile(
            r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>',
            re.S,
        )

        for match in pattern.finditer(html):
            if len(results) >= limit:
                break

            link = unwrap_ddg_url(match.group(1))
            title = strip_tags(match.group(2))
            snippet = strip_tags(match.group(3))

            if link and title:
                results.append(
                    {
                        "title": title,
                        "url": link,
                        "snippet": snippet,
                    }
                )

        return results
    except Exception:
        return []


def search_web(query, limit=5):
    if not query or not query.strip():
        return []

    ia = instant_answer(query)
    organic = html_results(query, limit)

    out = []
    if ia:
        out.append(ia)

    for r in organic:
        if len(out) >= limit:
            break
        if not any(x["url"] == r["url"] for x in out):
            out.append(r)

    return out[:limit]


# Example usage
if __name__ == "__main__":
    results = search_web("Python programming", limit=5)
    for r in results:
        print(f"\nTitle: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}")