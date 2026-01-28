"""
Command Palette System
=====================
Searchable, fuzzy-matched command system for rapid navigation and action discovery.
"""

import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class CommandCategory(Enum):
    """Command categories."""
    NAVIGATION = "Navigation"
    CHAIN = "Chain"
    EFFECT = "Effect"
    SETTINGS = "Settings"
    HELP = "Help"
    DEBUG = "Debug"


@dataclass
class Command:
    """A single command in the palette."""
    id: str
    name: str
    category: CommandCategory
    description: str
    keybinding: Optional[str] = None
    action: Optional[Callable] = None
    frequency: int = 0  # Track usage frequency
    last_used: float = 0.0  # Track last use time


class CommandPalette:
    """Command palette with fuzzy search and recent tracking."""
    
    def __init__(self):
        """Initialize command palette."""
        self._commands: Dict[str, Command] = {}
        self._history: List[str] = []  # Track recently used commands
        self._max_history = 50
    
    def register_command(
        self,
        command_id: str,
        name: str,
        category: CommandCategory,
        description: str,
        keybinding: Optional[str] = None,
        action: Optional[Callable] = None
    ) -> None:
        """
        Register a command.
        
        Args:
            command_id: Unique command identifier
            name: Display name
            category: Command category
            description: Short description
            keybinding: Optional keyboard shortcut
            action: Optional callable to execute
        """
        command = Command(
            id=command_id,
            name=name,
            category=category,
            description=description,
            keybinding=keybinding,
            action=action
        )
        self._commands[command_id] = command
        logger.debug(f"Registered command: {command_id}")
    
    def search(self, query: str, limit: int = 20) -> List[Command]:
        """
        Search commands with fuzzy matching.
        
        Args:
            query: Search query
            limit: Maximum results
            
        Returns:
            List of matching commands, sorted by relevance
        """
        if not query:
            return self._get_recent(limit)
        
        results = []
        query_lower = query.lower()
        
        for cmd in self._commands.values():
            score = self._calculate_relevance(query_lower, cmd)
            if score > 0:
                results.append((cmd, score))
        
        # Sort by score (higher first), then by frequency
        results.sort(key=lambda x: (-x[1], -x[0].frequency))
        
        return [cmd for cmd, score in results[:limit]]
    
    def _calculate_relevance(self, query: str, cmd: Command) -> float:
        """
        Calculate relevance score for a command.
        
        Args:
            query: Search query
            cmd: Command to score
            
        Returns:
            Relevance score (0 = no match)
        """
        name_lower = cmd.name.lower()
        desc_lower = cmd.description.lower()
        
        # Exact match in name
        if name_lower == query:
            return 100.0
        
        # Starts with query
        if name_lower.startswith(query):
            return 80.0
        
        # Word starts with query
        if any(word.startswith(query) for word in name_lower.split()):
            return 60.0
        
        # Contains all characters in order
        if self._contains_pattern(name_lower, query):
            return 40.0
        
        # Fuzzy match in description
        if self._contains_pattern(desc_lower, query):
            return 20.0
        
        return 0.0
    
    def _contains_pattern(self, text: str, pattern: str) -> bool:
        """Check if text contains all pattern chars in order."""
        idx = 0
        for char in pattern:
            idx = text.find(char, idx)
            if idx == -1:
                return False
            idx += 1
        return True
    
    def execute(self, command_id: str) -> Any:
        """
        Execute a command.
        
        Args:
            command_id: ID of command to execute
            
        Returns:
            Result from command action
        """
        if command_id not in self._commands:
            logger.warning(f"Command not found: {command_id}")
            return None
        
        cmd = self._commands[command_id]
        
        # Update tracking
        cmd.frequency += 1
        self._history.append(command_id)
        if len(self._history) > self._max_history:
            self._history.pop(0)
        
        # Execute action
        if cmd.action:
            logger.debug(f"Executing command: {command_id}")
            return cmd.action()
        
        return None
    
    def _get_recent(self, limit: int) -> List[Command]:
        """Get recently used commands."""
        recent_ids = list(dict.fromkeys(reversed(self._history)))[:limit]
        return [self._commands[cid] for cid in recent_ids if cid in self._commands]
    
    def get_all_by_category(self, category: CommandCategory) -> List[Command]:
        """Get all commands in a category."""
        return [cmd for cmd in self._commands.values() if cmd.category == category]
    
    def get_keybinding_map(self) -> Dict[str, str]:
        """Get all keybindings as a map."""
        return {
            cmd.keybinding: cmd.id
            for cmd in self._commands.values()
            if cmd.keybinding
        }
    
    def format_for_display(self, commands: List[Command]) -> str:
        """Format commands for display."""
        lines = []
        current_category = None
        
        for cmd in commands:
            if cmd.category != current_category:
                current_category = cmd.category
                lines.append(f"\n  {current_category.value}")
                lines.append("  " + "─" * 40)
            
            keybind = f" [{cmd.keybinding}]" if cmd.keybinding else ""
            lines.append(f"  {cmd.name:<30}{keybind}")
            lines.append(f"    {cmd.description}")
        
        return "\n".join(lines)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get command palette summary."""
        return {
            "total_commands": len(self._commands),
            "by_category": {
                cat.name: len(self.get_all_by_category(cat))
                for cat in CommandCategory
            },
            "recent_count": len(self._history),
            "commands_with_keybindings": len(self.get_keybinding_map())
        }


# Global instance
command_palette = CommandPalette()
