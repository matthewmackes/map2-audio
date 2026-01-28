"""
Layout System
=============
Multi-modal interface layouts with runtime switching.
"""

import logging
import json
from typing import Dict, List, Any, Optional
from enum import Enum
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class LayoutMode(Enum):
    """Layout modes."""
    COMPACT = "compact"      # Minimal space, dense
    NORMAL = "normal"        # Default balanced
    WIDE = "wide"           # Maximum detail
    FULLSCREEN = "fullscreen"  # Single item focus
    SIDEBAR_LEFT = "sidebar_left"
    SIDEBAR_RIGHT = "sidebar_right"


@dataclass
class LayoutConfig:
    """Layout configuration."""
    mode: LayoutMode
    padding: int
    tab_width: int
    content_width: int
    sidebar_width: int
    show_status_bar: bool
    show_tab_bar: bool
    show_sidebar: bool
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict."""
        return {
            "mode": self.mode.value,
            "padding": self.padding,
            "tab_width": self.tab_width,
            "content_width": self.content_width,
            "sidebar_width": self.sidebar_width,
            "show_status_bar": self.show_status_bar,
            "show_tab_bar": self.show_tab_bar,
            "show_sidebar": self.show_sidebar,
        }


class LayoutSystem:
    """Manages layout modes and customization."""
    
    LAYOUTS_DIR = Path.home() / ".config" / "map2" / "layouts"
    
    # Predefined layouts
    LAYOUT_PRESETS = {
        LayoutMode.COMPACT: LayoutConfig(
            mode=LayoutMode.COMPACT,
            padding=0,
            tab_width=15,
            content_width=80,
            sidebar_width=20,
            show_status_bar=True,
            show_tab_bar=True,
            show_sidebar=False
        ),
        LayoutMode.NORMAL: LayoutConfig(
            mode=LayoutMode.NORMAL,
            padding=1,
            tab_width=20,
            content_width=100,
            sidebar_width=25,
            show_status_bar=True,
            show_tab_bar=True,
            show_sidebar=True
        ),
        LayoutMode.WIDE: LayoutConfig(
            mode=LayoutMode.WIDE,
            padding=2,
            tab_width=30,
            content_width=150,
            sidebar_width=35,
            show_status_bar=True,
            show_tab_bar=True,
            show_sidebar=True
        ),
        LayoutMode.FULLSCREEN: LayoutConfig(
            mode=LayoutMode.FULLSCREEN,
            padding=1,
            tab_width=0,
            content_width=200,
            sidebar_width=0,
            show_status_bar=False,
            show_tab_bar=False,
            show_sidebar=False
        ),
        LayoutMode.SIDEBAR_LEFT: LayoutConfig(
            mode=LayoutMode.SIDEBAR_LEFT,
            padding=1,
            tab_width=0,
            content_width=120,
            sidebar_width=30,
            show_status_bar=True,
            show_tab_bar=False,
            show_sidebar=True
        ),
        LayoutMode.SIDEBAR_RIGHT: LayoutConfig(
            mode=LayoutMode.SIDEBAR_RIGHT,
            padding=1,
            tab_width=0,
            content_width=120,
            sidebar_width=30,
            show_status_bar=True,
            show_tab_bar=False,
            show_sidebar=True
        ),
    }
    
    def __init__(self):
        """Initialize layout system."""
        self.LAYOUTS_DIR.mkdir(parents=True, exist_ok=True)
        self._current_layout = LayoutMode.NORMAL
        self._custom_layouts: Dict[str, LayoutConfig] = {}
        self._load_custom_layouts()
    
    def get_layout(self, mode: LayoutMode) -> LayoutConfig:
        """Get layout configuration."""
        if mode in self.LAYOUT_PRESETS:
            return self.LAYOUT_PRESETS[mode]
        
        if mode.value in self._custom_layouts:
            return self._custom_layouts[mode.value]
        
        return self.LAYOUT_PRESETS[LayoutMode.NORMAL]
    
    def set_layout(self, mode: LayoutMode) -> None:
        """
        Set the current layout mode.
        
        Args:
            mode: Layout mode
        """
        self._current_layout = mode
        logger.info(f"Switched to layout: {mode.value}")
    
    def get_current_layout(self) -> LayoutConfig:
        """Get current layout."""
        return self.get_layout(self._current_layout)
    
    def create_custom_layout(
        self,
        name: str,
        config: LayoutConfig
    ) -> None:
        """Create a custom layout."""
        self._custom_layouts[name] = config
        self._save_custom_layout(name, config)
        logger.info(f"Created custom layout: {name}")
    
    def get_custom_layout(self, name: str) -> Optional[LayoutConfig]:
        """Get a custom layout."""
        return self._custom_layouts.get(name)
    
    def delete_custom_layout(self, name: str) -> bool:
        """Delete a custom layout."""
        if name not in self._custom_layouts:
            return False
        
        del self._custom_layouts[name]
        
        # Delete file
        path = self.LAYOUTS_DIR / f"{name}.json"
        if path.exists():
            path.unlink()
        
        logger.info(f"Deleted layout: {name}")
        return True
    
    def _save_custom_layout(self, name: str, config: LayoutConfig) -> None:
        """Save custom layout to disk."""
        try:
            path = self.LAYOUTS_DIR / f"{name}.json"
            path.write_text(json.dumps(config.to_dict(), indent=2))
        except Exception as e:
            logger.error(f"Failed to save layout: {e}")
    
    def _load_custom_layouts(self) -> None:
        """Load custom layouts from disk."""
        for layout_file in self.LAYOUTS_DIR.glob("*.json"):
            try:
                data = json.loads(layout_file.read_text())
                mode = LayoutMode(data["mode"])
                config = LayoutConfig(
                    mode=mode,
                    padding=data.get("padding", 1),
                    tab_width=data.get("tab_width", 20),
                    content_width=data.get("content_width", 100),
                    sidebar_width=data.get("sidebar_width", 25),
                    show_status_bar=data.get("show_status_bar", True),
                    show_tab_bar=data.get("show_tab_bar", True),
                    show_sidebar=data.get("show_sidebar", True),
                )
                self._custom_layouts[layout_file.stem] = config
            except Exception as e:
                logger.error(f"Failed to load layout {layout_file}: {e}")
    
    def list_layouts(self) -> List[str]:
        """List all available layouts."""
        builtin = [m.value for m in LayoutMode]
        custom = list(self._custom_layouts.keys())
        return builtin + custom
    
    def get_css_for_layout(self) -> str:
        """Get CSS for current layout."""
        config = self.get_current_layout()
        
        return f"""
.layout-container {{
    padding: {config.padding};
}}

.tab-bar {{
    width: {config.tab_width}ch;
    display: {'block' if config.show_tab_bar else 'none'};
}}

.content-area {{
    width: {config.content_width}ch;
}}

.sidebar {{
    width: {config.sidebar_width}ch;
    display: {'block' if config.show_sidebar else 'none'};
}}

.status-bar {{
    display: {'block' if config.show_status_bar else 'none'};
}}
"""
    
    def get_summary(self) -> Dict[str, Any]:
        """Get layout system summary."""
        return {
            "current_layout": self._current_layout.value,
            "builtin_layouts": len(LayoutMode),
            "custom_layouts": len(self._custom_layouts),
            "available": self.list_layouts()
        }


# Global instance
layout_system = LayoutSystem()
