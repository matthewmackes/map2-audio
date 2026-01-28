"""
Contextual Help System
=====================
Hover tooltips, F1 help, and interactive tutorials.
"""

import logging
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class Tooltip:
    """A tooltip definition."""
    id: str
    title: str
    content: str
    examples: List[str] = None
    related: List[str] = None
    shortcut: Optional[str] = None
    
    def format(self) -> str:
        """Format tooltip for display."""
        lines = [f"╭─ {self.title} {'─' * 30}╮"]
        lines.append(f"│ {self.content} │")
        
        if self.shortcut:
            lines.append(f"│ Shortcut: {self.shortcut} │")
        
        if self.examples:
            lines.append("│ Examples: │")
            for ex in self.examples[:2]:
                lines.append(f"│   • {ex} │")
        
        lines.append(f"╰{('─' * 44)}╯")
        return "\n".join(lines)


@dataclass
class TutorialStep:
    """A step in a tutorial."""
    title: str
    instruction: str
    highlight_element: Optional[str] = None
    action_hint: Optional[str] = None


class ContextualHelp:
    """Contextual help system with tooltips and tutorials."""
    
    def __init__(self):
        """Initialize help system."""
        self._tooltips: Dict[str, Tooltip] = {}
        self._tutorials: Dict[str, List[TutorialStep]] = {}
        self._active_tutorial: Optional[str] = None
        self._tutorial_step = 0
        self._user_first_time = True
        self._setup_default_tooltips()
    
    def _setup_default_tooltips(self) -> None:
        """Setup default tooltips."""
        tooltips = {
            "search": Tooltip(
                id="search",
                title="Universal Search",
                content="Search for chains, effects, settings across the entire app",
                examples=["Type to search", "Use Ctrl+F"],
                shortcut="Ctrl+F"
            ),
            "favorites": Tooltip(
                id="favorites",
                title="Favorites",
                content="Save frequently used chains and actions for quick access",
                examples=["Click heart icon", "Quick toolbar"],
                shortcut="Ctrl+L"
            ),
            "analytics": Tooltip(
                id="analytics",
                title="Analytics",
                content="View historical metrics, trends, and performance bottlenecks",
                examples=["CPU trends", "RAM history"]
            ),
            "keybindings": Tooltip(
                id="keybindings",
                title="Keybindings",
                content="Customize keyboard shortcuts. Switch between vim, emacs, default",
                shortcut="Ctrl+K"
            ),
            "chain_editor": Tooltip(
                id="chain_editor",
                title="Chain Editor",
                content="Add, remove, reorder effects in your audio chain",
                examples=["Drag to reorder", "Double-click to edit"],
                shortcut="Tab 1"
            ),
            "diagnostics": Tooltip(
                id="diagnostics",
                title="Diagnostics",
                content="Check system health, performance metrics, and troubleshoot issues",
                shortcut="F2"
            ),
            "command_palette": Tooltip(
                id="command_palette",
                title="Command Palette",
                content="Search and execute any command in the app",
                examples=["Type command name", "See all recent"],
                shortcut="Ctrl+Shift+P"
            ),
        }
        
        for tooltip in tooltips.values():
            self._tooltips[tooltip.id] = tooltip
    
    def register_tooltip(self, tooltip: Tooltip) -> None:
        """Register a tooltip."""
        self._tooltips[tooltip.id] = tooltip
        logger.debug(f"Registered tooltip: {tooltip.id}")
    
    def register_tutorial(self, name: str, steps: List[TutorialStep]) -> None:
        """Register a tutorial."""
        self._tutorials[name] = steps
        logger.info(f"Registered tutorial: {name} ({len(steps)} steps)")
    
    def get_tooltip(self, element_id: str) -> Optional[Tooltip]:
        """Get tooltip for element."""
        return self._tooltips.get(element_id)
    
    def start_tutorial(self, tutorial_name: str) -> Optional[TutorialStep]:
        """
        Start a tutorial.
        
        Args:
            tutorial_name: Name of tutorial
            
        Returns:
            First step or None
        """
        if tutorial_name not in self._tutorials:
            logger.warning(f"Tutorial not found: {tutorial_name}")
            return None
        
        self._active_tutorial = tutorial_name
        self._tutorial_step = 0
        logger.info(f"Started tutorial: {tutorial_name}")
        
        return self._tutorials[tutorial_name][0]
    
    def next_tutorial_step(self) -> Optional[TutorialStep]:
        """Move to next tutorial step."""
        if not self._active_tutorial:
            return None
        
        self._tutorial_step += 1
        tutorial = self._tutorials[self._active_tutorial]
        
        if self._tutorial_step >= len(tutorial):
            logger.info(f"Completed tutorial: {self._active_tutorial}")
            self._active_tutorial = None
            return None
        
        return tutorial[self._tutorial_step]
    
    def skip_tutorial(self) -> None:
        """Skip current tutorial."""
        if self._active_tutorial:
            logger.info(f"Skipped tutorial: {self._active_tutorial}")
            self._active_tutorial = None
            self._tutorial_step = 0
    
    def get_current_tutorial_step(self) -> Optional[TutorialStep]:
        """Get current tutorial step."""
        if not self._active_tutorial:
            return None
        
        tutorial = self._tutorials[self._active_tutorial]
        if self._tutorial_step < len(tutorial):
            return tutorial[self._tutorial_step]
        
        return None
    
    def show_first_time_tour(self) -> Optional[TutorialStep]:
        """Show tour for first-time users."""
        if not self._user_first_time:
            return None
        
        self._user_first_time = False
        return self.start_tutorial("welcome_tour")
    
    def format_tooltip(self, element_id: str) -> str:
        """Format tooltip for display."""
        tooltip = self.get_tooltip(element_id)
        if not tooltip:
            return "(No help available)"
        
        return tooltip.format()
    
    def search_help(self, query: str) -> List[Tooltip]:
        """Search help topics."""
        query_lower = query.lower()
        results = []
        
        for tooltip in self._tooltips.values():
            if (query_lower in tooltip.title.lower() or
                query_lower in tooltip.content.lower()):
                results.append(tooltip)
        
        return results
    
    def get_summary(self) -> Dict[str, any]:
        """Get help system summary."""
        return {
            "tooltips": len(self._tooltips),
            "tutorials": len(self._tutorials),
            "active_tutorial": self._active_tutorial,
            "tutorial_progress": f"{self._tutorial_step}/{len(self._tutorials.get(self._active_tutorial, []))}",
            "first_time": self._user_first_time
        }


# Global instance
context_help = ContextualHelp()

# Setup tutorials
context_help.register_tutorial("welcome_tour", [
    TutorialStep(
        title="Welcome to MAP2 Audio TUI",
        instruction="This is your command center for audio effects. Let's get you up to speed!",
        action_hint="Press SPACE to continue or ESC to skip"
    ),
    TutorialStep(
        title="Navigation",
        instruction="Use Tab to switch between screens: Chains, Effects, Settings, Diagnostics",
        highlight_element="tab_bar",
        action_hint="Press Tab now"
    ),
    TutorialStep(
        title="Search",
        instruction="Press Ctrl+F anytime to search for chains, effects, and settings",
        highlight_element="search",
        action_hint="Press Ctrl+F"
    ),
    TutorialStep(
        title="Command Palette",
        instruction="Press Ctrl+Shift+P to access commands and navigate faster",
        highlight_element="command_palette",
        action_hint="Press Ctrl+Shift+P"
    ),
    TutorialStep(
        title="Diagnostics",
        instruction="Press F2 to check system health and troubleshoot issues",
        highlight_element="diagnostics",
        action_hint="Press F2"
    ),
    TutorialStep(
        title="Help",
        instruction="Press F1 anywhere to get contextual help. Now you're ready!",
        action_hint="You're all set! Press ESC to close"
    ),
])
