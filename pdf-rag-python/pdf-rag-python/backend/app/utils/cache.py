from collections import OrderedDict
from typing import Any, Optional

class LRUCache:
    """Thread-safe LRU Cache implementation."""

    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self.cache = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def set(self, key: str, value: Any):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)

    def has(self, key: str) -> bool:
        return key in self.cache

    def clear(self):
        self.cache.clear()

# Global cache instances
embedding_cache = LRUCache(max_size=500)
query_cache = LRUCache(max_size=200)
