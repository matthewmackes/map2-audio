"""
Virtual Renderer
===============
Virtual scrolling and lazy loading for handling large datasets efficiently.
"""

import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class VirtualItem:
    """An item in virtual list."""
    index: int
    id: str
    data: Dict[str, Any]
    height: int = 1


@dataclass
class ViewportRange:
    """Visible viewport range."""
    start_index: int = 0
    end_index: int = 0
    start_offset: int = 0
    total_height: int = 0


class VirtualRenderer:
    """Efficient renderer for large lists using virtual scrolling."""
    
    def __init__(
        self,
        item_height: int = 1,
        buffer_size: int = 5,
        cache_size: int = 500
    ):
        """
        Initialize virtual renderer.
        
        Args:
            item_height: Height of each item in lines
            buffer_size: Number of items to render above/below viewport
            cache_size: Maximum cached items
        """
        self._items: List[VirtualItem] = []
        self._item_height = item_height
        self._buffer_size = buffer_size
        self._cache_size = cache_size
        self._viewport_height = 20  # Default viewport
        self._scroll_position = 0
        self._visible_range: Optional[ViewportRange] = None
        self._item_cache: deque = deque(maxlen=cache_size)
        self._render_callbacks: List[Callable] = []
    
    def set_items(self, items: List[Dict[str, Any]]) -> None:
        """
        Set all items.
        
        Args:
            items: List of item data dictionaries
        """
        self._items = [
            VirtualItem(index=i, id=f"item_{i}", data=item)
            for i, item in enumerate(items)
        ]
        logger.debug(f"Set {len(self._items)} items in virtual renderer")
    
    def add_items(self, items: List[Dict[str, Any]]) -> None:
        """Add items to list."""
        start_index = len(self._items)
        for i, item in enumerate(items):
            self._items.append(
                VirtualItem(index=start_index + i, id=f"item_{start_index + i}", data=item)
            )
    
    def set_viewport(self, height: int) -> None:
        """
        Set viewport height.
        
        Args:
            height: Viewport height in lines
        """
        self._viewport_height = height
        logger.debug(f"Set viewport height to {height}")
    
    def scroll(self, position: int) -> None:
        """
        Scroll to position.
        
        Args:
            position: Scroll position in pixels/lines
        """
        self._scroll_position = max(0, min(position, self._get_max_scroll()))
    
    def scroll_up(self, amount: int = 1) -> None:
        """Scroll up."""
        self.scroll(self._scroll_position - amount * self._item_height)
    
    def scroll_down(self, amount: int = 1) -> None:
        """Scroll down."""
        self.scroll(self._scroll_position + amount * self._item_height)
    
    def get_visible_items(self) -> List[VirtualItem]:
        """
        Get currently visible items.
        
        Returns:
            List of items in viewport
        """
        range_info = self._calculate_visible_range()
        
        if not range_info:
            return []
        
        visible = []
        for i in range(range_info.start_index, range_info.end_index + 1):
            if i < len(self._items):
                visible.append(self._items[i])
        
        self._visible_range = range_info
        return visible
    
    def _calculate_visible_range(self) -> Optional[ViewportRange]:
        """
        Calculate which items are visible.
        
        Returns:
            ViewportRange or None
        """
        if not self._items:
            return None
        
        total_height = len(self._items) * self._item_height
        
        # Calculate start index
        start_index = max(0, self._scroll_position // self._item_height)
        start_index = max(0, start_index - self._buffer_size)
        
        # Calculate end index
        visible_items = (self._viewport_height // self._item_height) + 1
        end_index = start_index + visible_items + self._buffer_size
        end_index = min(len(self._items) - 1, end_index)
        
        return ViewportRange(
            start_index=start_index,
            end_index=end_index,
            start_offset=self._scroll_position,
            total_height=total_height
        )
    
    def _get_max_scroll(self) -> int:
        """Get maximum scroll position."""
        total_height = len(self._items) * self._item_height
        return max(0, total_height - self._viewport_height)
    
    def render_visible(
        self,
        item_renderer: Callable[[VirtualItem], str]
    ) -> str:
        """
        Render visible items.
        
        Args:
            item_renderer: Function to render single item
            
        Returns:
            Rendered output
        """
        visible_items = self.get_visible_items()
        
        if not visible_items:
            return "(No items)"
        
        lines = []
        
        # Add spacing before
        range_info = self._visible_range
        if range_info and range_info.start_index > 0:
            lines.append(f"... {range_info.start_index} items above ...")
        
        # Render visible items
        for item in visible_items:
            try:
                rendered = item_renderer(item)
                lines.append(rendered)
                
                # Cache item
                self._item_cache.append(item.id)
                
            except Exception as e:
                logger.error(f"Error rendering item {item.id}: {e}")
                lines.append("[Error rendering item]")
        
        # Add spacing after
        if range_info and range_info.end_index < len(self._items) - 1:
            remaining = len(self._items) - range_info.end_index - 1
            lines.append(f"... {remaining} items below ...")
        
        return "\n".join(lines)
    
    def get_item_by_id(self, item_id: str) -> Optional[VirtualItem]:
        """Get item by ID."""
        for item in self._items:
            if item.id == item_id:
                return item
        return None
    
    def get_item_by_index(self, index: int) -> Optional[VirtualItem]:
        """Get item by index."""
        if 0 <= index < len(self._items):
            return self._items[index]
        return None
    
    def search_items(self, query: str) -> List[VirtualItem]:
        """
        Search items by data content.
        
        Args:
            query: Search query
            
        Returns:
            Matching items
        """
        results = []
        query_lower = query.lower()
        
        for item in self._items:
            for key, value in item.data.items():
                if query_lower in str(value).lower():
                    results.append(item)
                    break
        
        return results
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get renderer statistics."""
        visible = self.get_visible_items()
        return {
            "total_items": len(self._items),
            "visible_items": len(visible),
            "viewport_height": self._viewport_height,
            "item_height": self._item_height,
            "cache_size": len(self._item_cache),
            "max_cache_size": self._cache_size,
            "scroll_position": self._scroll_position,
            "max_scroll": self._get_max_scroll()
        }
    
    def clear(self) -> None:
        """Clear all items."""
        self._items.clear()
        self._item_cache.clear()
        self._scroll_position = 0
        logger.debug("Virtual renderer cleared")


class LazyLoadingRenderer(VirtualRenderer):
    """Virtual renderer with lazy loading support."""
    
    def __init__(self, *args, **kwargs):
        """Initialize lazy loading renderer."""
        super().__init__(*args, **kwargs)
        self._pending_ranges: List[tuple] = []
        self._load_callback: Optional[Callable] = None
    
    def set_load_callback(self, callback: Callable[[int, int], List[Dict[str, Any]]]) -> None:
        """
        Set callback for loading items.
        
        Args:
            callback: Function(start_idx, end_idx) -> list of items
        """
        self._load_callback = callback
    
    def auto_load_visible(self) -> None:
        """Automatically load items for visible range."""
        range_info = self._calculate_visible_range()
        
        if not range_info or not self._load_callback:
            return
        
        # Load if we have placeholders or empty range
        if range_info.end_index >= len(self._items):
            start = len(self._items)
            end = range_info.end_index + 10
            
            try:
                items = self._load_callback(start, end)
                if items:
                    self.add_items(items)
                    logger.debug(f"Lazy loaded {len(items)} items")
            except Exception as e:
                logger.error(f"Lazy load failed: {e}")


# Global instance
virtual_renderer = VirtualRenderer()
