"""
Universal Search System
=======================
Provides fast, searchable access to all screens, commands, and features.
"""

import logging
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class SearchResultType(Enum):
    """Types of search results."""
    SCREEN = "screen"
    COMMAND = "command"
    CHAIN = "chain"
    PLUGIN = "plugin"
    SETTING = "setting"
    ACTION = "action"


@dataclass
class SearchResult:
    """A single search result."""
    type: SearchResultType
    title: str
    description: str
    keywords: List[str]
    action: Callable
    icon: str = ""
    shortcut: Optional[str] = None
    metadata: Dict[str, Any] = None
    score: float = 0.0  # Relevance score
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class UniversalSearchIndex:
    """Searchable index of all screens, commands, and features."""
    
    def __init__(self):
        """Initialize search index."""
        self._index: List[SearchResult] = []
        self._recent_searches: List[str] = []
        self._search_history_limit = 20
    
    def register_screen(self, screen_name: str, description: str, keywords: List[str], 
                       action: Callable, icon: str = "") -> None:
        """Register a screen in the search index."""
        result = SearchResult(
            type=SearchResultType.SCREEN,
            title=screen_name,
            description=description,
            keywords=keywords,
            action=action,
            icon=icon
        )
        self._index.append(result)
        logger.debug(f"Indexed screen: {screen_name}")
    
    def register_command(self, name: str, description: str, keywords: List[str],
                        action: Callable, shortcut: Optional[str] = None) -> None:
        """Register a command in the search index."""
        result = SearchResult(
            type=SearchResultType.COMMAND,
            title=name,
            description=description,
            keywords=keywords,
            action=action,
            shortcut=shortcut
        )
        self._index.append(result)
        logger.debug(f"Indexed command: {name}")
    
    def register_chain(self, chain_id: int, chain_name: str, plugin_count: int,
                      action: Callable) -> None:
        """Register a chain in the search index."""
        result = SearchResult(
            type=SearchResultType.CHAIN,
            title=chain_name,
            description=f"{plugin_count} plugins",
            keywords=[chain_name.lower(), str(chain_id)],
            action=action,
            icon="🎸",
            metadata={"chain_id": chain_id, "plugin_count": plugin_count}
        )
        self._index.append(result)
        logger.debug(f"Indexed chain: {chain_name}")
    
    def search(self, query: str, limit: int = 20) -> List[SearchResult]:
        """
        Search the index and return results sorted by relevance.
        
        Args:
            query: Search query
            limit: Maximum results to return
            
        Returns:
            List of search results sorted by relevance
        """
        if not query or len(query) < 2:
            return []
        
        query_lower = query.lower()
        self._add_to_history(query)
        
        # Calculate relevance scores
        scored_results = []
        for result in self._index:
            score = self._calculate_relevance(result, query_lower)
            if score > 0:
                result.score = score
                scored_results.append(result)
        
        # Sort by score descending
        scored_results.sort(key=lambda x: x.score, reverse=True)
        
        logger.debug(f"Search '{query}' returned {len(scored_results)} results")
        return scored_results[:limit]
    
    def _calculate_relevance(self, result: SearchResult, query: str) -> float:
        """Calculate relevance score for a result."""
        score = 0.0
        
        # Exact title match
        if result.title.lower() == query:
            score += 100
        # Title contains query
        elif query in result.title.lower():
            score += 50
        
        # Keyword match
        for keyword in result.keywords:
            if keyword == query:
                score += 30
            elif query in keyword:
                score += 15
        
        # Description match
        if query in result.description.lower():
            score += 5
        
        return score
    
    def _add_to_history(self, query: str) -> None:
        """Add query to search history."""
        if query in self._recent_searches:
            self._recent_searches.remove(query)
        self._recent_searches.insert(0, query)
        if len(self._recent_searches) > self._search_history_limit:
            self._recent_searches.pop()
    
    def get_history(self) -> List[str]:
        """Get recent search history."""
        return self._recent_searches.copy()
    
    def clear_history(self) -> None:
        """Clear search history."""
        self._recent_searches.clear()
    
    def update_chain(self, chain_id: int, chain_name: str, plugin_count: int) -> None:
        """Update a chain in the index."""
        # Remove old version
        self._index = [r for r in self._index if not (
            r.type == SearchResultType.CHAIN and r.metadata.get("chain_id") == chain_id
        )]
        # Add new version
        result = SearchResult(
            type=SearchResultType.CHAIN,
            title=chain_name,
            description=f"{plugin_count} plugins",
            keywords=[chain_name.lower(), str(chain_id)],
            action=lambda: None,  # Will be set when registered
            icon="🎸",
            metadata={"chain_id": chain_id, "plugin_count": plugin_count}
        )
        self._index.append(result)


# Global search index
search_index = UniversalSearchIndex()
