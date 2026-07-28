import re

def clean_text(text: str) -> str:
    """Clean and normalize extracted PDF text."""
    text = re.sub(r'\n', '\n', text)
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n[ \t]+', '\n', text)
    text = re.sub(r'[^ -~\n\u00A0-ɏ]', ' ', text)
    return text.strip()

def estimate_tokens(text: str) -> int:
    """Rough token estimation (1 token ~ 4 chars for English)."""
    return max(1, len(text) // 4)
