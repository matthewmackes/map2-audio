"""
Undo/Redo System
===============
Full action history with time-travel debugging.
"""

import logging
import json
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from copy import deepcopy

logger = logging.getLogger(__name__)


@dataclass
class Action:
    """A single undoable action."""
    id: str
    name: str
    timestamp: float = field(default_factory=datetime.now().timestamp)
    previous_state: Dict[str, Any] = field(default_factory=dict)
    new_state: Dict[str, Any] = field(default_factory=dict)
    undo_fn: Optional[Callable] = None
    redo_fn: Optional[Callable] = None
    grouped: bool = False  # Part of a group
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def execute_undo(self) -> bool:
        """Execute undo."""
        if self.undo_fn:
            try:
                self.undo_fn(self.previous_state)
                return True
            except Exception as e:
                logger.error(f"Undo failed for {self.name}: {e}")
                return False
        return False
    
    def execute_redo(self) -> bool:
        """Execute redo."""
        if self.redo_fn:
            try:
                self.redo_fn(self.new_state)
                return True
            except Exception as e:
                logger.error(f"Redo failed for {self.name}: {e}")
                return False
        return False


class UndoRedoSystem:
    """Full undo/redo stack with history management."""
    
    def __init__(self, max_history: int = 100):
        """
        Initialize undo/redo system.
        
        Args:
            max_history: Maximum history size
        """
        self._undo_stack: List[Action] = []
        self._redo_stack: List[Action] = []
        self._max_history = max_history
        self._grouping = False
        self._grouped_actions: List[Action] = []
        self._state_snapshots: Dict[str, Dict[str, Any]] = {}
    
    def record_action(
        self,
        action_id: str,
        name: str,
        previous_state: Dict[str, Any],
        new_state: Dict[str, Any],
        undo_fn: Optional[Callable] = None,
        redo_fn: Optional[Callable] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Record an action for undo/redo.
        
        Args:
            action_id: Unique action ID
            name: Display name
            previous_state: State before action
            new_state: State after action
            undo_fn: Function to undo
            redo_fn: Function to redo
            metadata: Additional metadata
        """
        action = Action(
            id=action_id,
            name=name,
            previous_state=deepcopy(previous_state),
            new_state=deepcopy(new_state),
            undo_fn=undo_fn,
            redo_fn=redo_fn,
            grouped=self._grouping,
            metadata=metadata or {}
        )
        
        if self._grouping:
            self._grouped_actions.append(action)
        else:
            self._undo_stack.append(action)
            # Clear redo stack on new action
            self._redo_stack.clear()
            self._enforce_max_history()
        
        logger.debug(f"Recorded action: {name}")
    
    def undo(self) -> bool:
        """
        Undo last action.
        
        Returns:
            True if successful
        """
        if not self._undo_stack:
            logger.debug("Nothing to undo")
            return False
        
        action = self._undo_stack.pop()
        
        if action.execute_undo():
            self._redo_stack.append(action)
            logger.info(f"Undid: {action.name}")
            return True
        else:
            # Put back if undo failed
            self._undo_stack.append(action)
            return False
    
    def redo(self) -> bool:
        """
        Redo last undone action.
        
        Returns:
            True if successful
        """
        if not self._redo_stack:
            logger.debug("Nothing to redo")
            return False
        
        action = self._redo_stack.pop()
        
        if action.execute_redo():
            self._undo_stack.append(action)
            logger.info(f"Redid: {action.name}")
            return True
        else:
            # Put back if redo failed
            self._redo_stack.append(action)
            return False
    
    def begin_group(self) -> None:
        """Begin grouping actions (undo multiple as one)."""
        self._grouping = True
        self._grouped_actions = []
        logger.debug("Began action group")
    
    def end_group(self, group_name: str) -> None:
        """End grouping actions."""
        if not self._grouping:
            logger.warning("No group in progress")
            return
        
        self._grouping = False
        
        # Create composite action
        if self._grouped_actions:
            composite = Action(
                id=f"group_{len(self._undo_stack)}",
                name=group_name,
                grouped=True
            )
            
            # Combine undo/redo functions
            actions_copy = self._grouped_actions.copy()
            
            def composite_undo(state):
                for action in reversed(actions_copy):
                    action.execute_undo()
            
            def composite_redo(state):
                for action in actions_copy:
                    action.execute_redo()
            
            composite.undo_fn = composite_undo
            composite.redo_fn = composite_redo
            
            self._undo_stack.append(composite)
            self._enforce_max_history()
            logger.info(f"Grouped {len(actions_copy)} actions: {group_name}")
    
    def clear_history(self) -> None:
        """Clear all history."""
        self._undo_stack.clear()
        self._redo_stack.clear()
        self._grouped_actions.clear()
        logger.info("Cleared all history")
    
    def create_snapshot(self, snapshot_id: str, state: Dict[str, Any]) -> None:
        """Create a named snapshot for time-travel."""
        self._state_snapshots[snapshot_id] = deepcopy(state)
        logger.debug(f"Created snapshot: {snapshot_id}")
    
    def get_snapshot(self, snapshot_id: str) -> Optional[Dict[str, Any]]:
        """Get a snapshot."""
        return self._state_snapshots.get(snapshot_id)
    
    def _enforce_max_history(self) -> None:
        """Enforce maximum history size."""
        if len(self._undo_stack) > self._max_history:
            self._undo_stack = self._undo_stack[-self._max_history:]
    
    def can_undo(self) -> bool:
        """Check if undo is available."""
        return len(self._undo_stack) > 0
    
    def can_redo(self) -> bool:
        """Check if redo is available."""
        return len(self._redo_stack) > 0
    
    def get_history(self, limit: int = 20) -> List[str]:
        """Get action history."""
        actions = (self._undo_stack + self._redo_stack)[-limit:]
        return [f"  {a.name}" for a in actions]
    
    def get_summary(self) -> Dict[str, Any]:
        """Get undo/redo system summary."""
        return {
            "undo_available": self.can_undo(),
            "redo_available": self.can_redo(),
            "undo_stack_size": len(self._undo_stack),
            "redo_stack_size": len(self._redo_stack),
            "max_history": self._max_history,
            "snapshots": len(self._state_snapshots),
            "grouping_active": self._grouping
        }


# Global instance
undo_redo = UndoRedoSystem()
