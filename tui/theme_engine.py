"""
Theme Engine System
==================
Runtime theming with real-time switching and customization.
"""

import logging
import json
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ColorScheme:
    """A color scheme."""
    name: str
    primary: str
    secondary: str
    accent: str
    background: str
    surface: str
    error: str
    warning: str
    success: str
    text: str
    text_muted: str
    
    def to_css(self) -> str:
        """Convert to CSS variables."""
        return f"""
:root {{
    --primary: {self.primary};
    --secondary: {self.secondary};
    --accent: {self.accent};
    --background: {self.background};
    --surface: {self.surface};
    --error: {self.error};
    --warning: {self.warning};
    --success: {self.success};
    --text: {self.text};
    --text-muted: {self.text_muted};
}}
"""


class ThemeEngine:
    """Manages themes and runtime customization."""
    
    THEMES_DIR = Path.home() / ".config" / "map2" / "themes"
    
    # Built-in themes
    BUILTIN_THEMES = {
        "dark": ColorScheme(
            name="Dark (Default)",
            primary="#6366F1",
            secondary="#8B5CF6",
            accent="#EC4899",
            background="#0F172A",
            surface="#1E293B",
            error="#EF4444",
            warning="#F59E0B",
            success="#10B981",
            text="#F1F5F9",
            text_muted="#94A3B8"
        ),
        "light": ColorScheme(
            name="Light",
            primary="#4F46E5",
            secondary="#7C3AED",
            accent="#DB2777",
            background="#FFFFFF",
            surface="#F8FAFC",
            error="#DC2626",
            warning="#D97706",
            success="#059669",
            text="#0F172A",
            text_muted="#64748B"
        ),
        "nord": ColorScheme(
            name="Nord",
            primary="#88C0D0",
            secondary="#81A1C1",
            accent="#BF616A",
            background="#2E3440",
            surface="#3B4252",
            error="#BF616A",
            warning="#EBCB8B",
            success="#A3BE8C",
            text="#ECEFF4",
            text_muted="#D08770"
        ),
        "dracula": ColorScheme(
            name="Dracula",
            primary="#BD93F9",
            secondary="#FF79C6",
            accent="#50FA7B",
            background="#282A36",
            surface="#44475A",
            error="#FF5555",
            warning="#FFB86C",
            success="#50FA7B",
            text="#F8F8F2",
            text_muted="#6272A4"
        ),
        "solarized_dark": ColorScheme(
            name="Solarized Dark",
            primary="#268BD2",
            secondary="#2AA198",
            accent="#D33682",
            background="#002B36",
            surface="#073642",
            error="#DC322F",
            warning="#B58900",
            success="#859900",
            text="#839496",
            text_muted="#586E75"
        ),
        "solarized_light": ColorScheme(
            name="Solarized Light",
            primary="#268BD2",
            secondary="#2AA198",
            accent="#D33682",
            background="#FDF6E3",
            surface="#EEE8D5",
            error="#DC322F",
            warning="#B58900",
            success="#859900",
            text="#657B83",
            text_muted="#93A1A1"
        ),
        "gruvbox_dark": ColorScheme(
            name="Gruvbox Dark",
            primary="#83A598",
            secondary="#D3869B",
            accent="#FA2934",
            background="#282828",
            surface="#3C3836",
            error="#FA2934",
            warning="#FABD2F",
            success="#B8BB26",
            text="#EBDBB2",
            text_muted="#928374"
        ),
        "one_dark": ColorScheme(
            name="One Dark",
            primary="#61AFEF",
            secondary="#C678DD",
            accent="#E06C75",
            background="#282C34",
            surface="#3E4451",
            error="#E06C75",
            warning="#E5C07B",
            success="#98C379",
            text="#ABB2BF",
            text_muted="#5C6370"
        ),
        "monokai": ColorScheme(
            name="Monokai",
            primary="#66D9EF",
            secondary="#AE81FF",
            accent="#F92672",
            background="#272822",
            surface="#3E3D32",
            error="#F92672",
            warning="#E6DB74",
            success="#A6E22E",
            text="#F8F8F2",
            text_muted="#75715E"
        ),
        "high_contrast": ColorScheme(
            name="High Contrast",
            primary="#0000FF",
            secondary="#FF00FF",
            accent="#FF0000",
            background="#000000",
            surface="#1A1A1A",
            error="#FF0000",
            warning="#FFFF00",
            success="#00FF00",
            text="#FFFFFF",
            text_muted="#CCCCCC"
        ),
    }
    
    def __init__(self):
        """Initialize theme engine."""
        self.THEMES_DIR.mkdir(parents=True, exist_ok=True)
        self._current_theme = "dark"
        self._custom_colors: Dict[str, str] = {}
        self._load_custom_themes()
    
    def get_theme(self, name: str) -> Optional[ColorScheme]:
        """Get a theme by name."""
        if name in self.BUILTIN_THEMES:
            return self.BUILTIN_THEMES[name]
        
        # Try to load custom theme
        custom_path = self.THEMES_DIR / f"{name}.json"
        if custom_path.exists():
            try:
                data = json.loads(custom_path.read_text())
                return ColorScheme(**data)
            except Exception as e:
                logger.error(f"Failed to load theme {name}: {e}")
        
        return None
    
    def set_theme(self, name: str) -> bool:
        """
        Set the current theme.
        
        Args:
            name: Theme name
            
        Returns:
            True if successful
        """
        theme = self.get_theme(name)
        if not theme:
            logger.warning(f"Theme not found: {name}")
            return False
        
        self._current_theme = name
        logger.info(f"Switched to theme: {name}")
        return True
    
    def get_current_theme(self) -> ColorScheme:
        """Get current theme."""
        theme = self.get_theme(self._current_theme)
        return theme or self.BUILTIN_THEMES["dark"]
    
    def customize_color(self, color_name: str, color_value: str) -> None:
        """Customize a color in the current theme."""
        self._custom_colors[color_name] = color_value
        logger.debug(f"Customized {color_name} to {color_value}")
    
    def get_current_css(self) -> str:
        """Get CSS for current theme with customizations."""
        theme = self.get_current_theme()
        css = theme.to_css()
        
        # Add custom colors
        if self._custom_colors:
            custom_css = "\n".join([
                f"    --{k}: {v};"
                for k, v in self._custom_colors.items()
            ])
            css = css.replace(":root {", f":root {{\n{custom_css}")
        
        return css
    
    def save_custom_theme(self, name: str, scheme: ColorScheme) -> bool:
        """Save a custom theme."""
        try:
            path = self.THEMES_DIR / f"{name}.json"
            path.write_text(json.dumps(asdict(scheme), indent=2))
            logger.info(f"Saved custom theme: {name}")
            return True
        except Exception as e:
            logger.error(f"Failed to save theme: {e}")
            return False
    
    def delete_custom_theme(self, name: str) -> bool:
        """Delete a custom theme."""
        try:
            path = self.THEMES_DIR / f"{name}.json"
            if path.exists():
                path.unlink()
                logger.info(f"Deleted theme: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete theme: {e}")
            return False
    
    def _load_custom_themes(self) -> None:
        """Load custom themes from disk."""
        for theme_file in self.THEMES_DIR.glob("*.json"):
            try:
                data = json.loads(theme_file.read_text())
                # Custom themes are loaded on demand
            except Exception as e:
                logger.error(f"Failed to load theme file {theme_file}: {e}")
    
    def list_themes(self) -> List[str]:
        """Get list of available themes."""
        themes = list(self.BUILTIN_THEMES.keys())
        custom = [f.stem for f in self.THEMES_DIR.glob("*.json")]
        return themes + custom
    
    def get_summary(self) -> Dict[str, Any]:
        """Get theme engine summary."""
        return {
            "current_theme": self._current_theme,
            "builtin_count": len(self.BUILTIN_THEMES),
            "custom_count": len(list(self.THEMES_DIR.glob("*.json"))),
            "customizations": len(self._custom_colors),
            "available_themes": self.list_themes()
        }


# Global instance
theme_engine = ThemeEngine()
