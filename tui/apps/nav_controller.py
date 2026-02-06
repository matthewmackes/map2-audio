"""
Navigation Controller for Cluster Screens
Manages screen state, transitions, and shared resources.
"""

from enum import Enum
from typing import Optional, Dict, Any, Callable, Awaitable
from dataclasses import dataclass
import asyncio

try:
    from textual.app import App
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_websocket import ClusterWebSocketManager


class ScreenName(Enum):
    """Available screen names."""
    DASHBOARD = "Dashboard"
    MATRIX = "Assignment Matrix"
    RECOMMENDATIONS = "Recommendations"
    FAILOVER = "Failover"
    DIAGNOSTICS = "Diagnostics"
    BATCH = "Batch Operations"
    HELP = "Help"
    SETTINGS = "Settings"


@dataclass
class NavigationContext:
    """Context passed between screens."""
    api_client: ClusterAPIClient
    ws_manager: ClusterWebSocketManager
    selected_node_id: Optional[str] = None
    selected_flow_id: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        """Initialize metadata if not provided."""
        if self.metadata is None:
            self.metadata = {}


class ScreenTransition:
    """Screen transition with animation and state management."""
    
    def __init__(
        self,
        from_screen: ScreenName,
        to_screen: ScreenName,
        animation_duration: float = 0.3
    ):
        """Initialize transition."""
        self.from_screen = from_screen
        self.to_screen = to_screen
        self.animation_duration = animation_duration
        self.start_time = None
        self.is_complete = False
    
    async def execute(self) -> None:
        """Execute transition animation."""
        # Simulate transition
        await asyncio.sleep(self.animation_duration)
        self.is_complete = True


class NavigationController:
    """
    Controller for managing screen navigation and state.
    
    Features:
    - Screen stack management
    - Navigation history
    - Shared context between screens
    - Transition management
    - Navigation callbacks
    
    Example usage:
        nav = NavigationController(api_client, ws_manager)
        nav.register_callback(on_navigation)
        await nav.navigate_to(ScreenName.DASHBOARD)
    """
    
    def __init__(
        self,
        api_client: ClusterAPIClient,
        ws_manager: ClusterWebSocketManager
    ):
        """
        Initialize navigation controller.
        
        Args:
            api_client: Cluster API client
            ws_manager: WebSocket manager
        """
        self.api_client = api_client
        self.ws_manager = ws_manager
        self.context = NavigationContext(
            api_client=api_client,
            ws_manager=ws_manager
        )
        
        # State
        self.current_screen = ScreenName.DASHBOARD
        self.screen_history: list[ScreenName] = [ScreenName.DASHBOARD]
        self.current_transition: Optional[ScreenTransition] = None
        
        # Callbacks
        self.on_before_navigate: list[Callable[[ScreenName, ScreenName], Awaitable[None]]] = []
        self.on_after_navigate: list[Callable[[ScreenName, ScreenName], Awaitable[None]]] = []
        self.on_navigation_error: list[Callable[[Exception], Awaitable[None]]] = []
    
    def register_callback(
        self,
        event: str,
        callback: Callable
    ) -> None:
        """
        Register navigation callback.
        
        Args:
            event: Event name (before_navigate, after_navigate, error)
            callback: Async callback function
        """
        if event == "before_navigate":
            self.on_before_navigate.append(callback)
        elif event == "after_navigate":
            self.on_after_navigate.append(callback)
        elif event == "error":
            self.on_navigation_error.append(callback)
    
    async def navigate_to(
        self,
        screen: ScreenName,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Navigate to screen.
        
        Args:
            screen: Target screen
            data: Optional data to pass to screen
            
        Returns:
            Success flag
        """
        try:
            # Call before callbacks
            for callback in self.on_before_navigate:
                await callback(self.current_screen, screen)
            
            # Update state
            previous_screen = self.current_screen
            self.current_screen = screen
            self.screen_history.append(screen)
            
            # Update context
            if data:
                self.context.metadata.update(data)
            
            # Execute transition
            transition = ScreenTransition(previous_screen, screen)
            self.current_transition = transition
            await transition.execute()
            
            # Call after callbacks
            for callback in self.on_after_navigate:
                await callback(previous_screen, screen)
            
            return True
        
        except Exception as e:
            # Call error callbacks
            for callback in self.on_navigation_error:
                await callback(e)
            
            # Revert state
            self.current_screen = self.screen_history[-2] if len(self.screen_history) > 1 else ScreenName.DASHBOARD
            return False
    
    async def navigate_back(self) -> bool:
        """
        Navigate back to previous screen.
        
        Returns:
            Success flag
        """
        if len(self.screen_history) <= 1:
            return False
        
        self.screen_history.pop()
        previous_screen = self.screen_history[-1]
        
        return await self.navigate_to(previous_screen)
    
    def can_navigate_back(self) -> bool:
        """Check if can navigate back."""
        return len(self.screen_history) > 1
    
    def get_screen_history(self) -> list[ScreenName]:
        """Get navigation history."""
        return self.screen_history.copy()
    
    def clear_history(self) -> None:
        """Clear navigation history."""
        self.screen_history = [self.current_screen]
    
    def update_context(self, **kwargs) -> None:
        """
        Update navigation context.
        
        Args:
            **kwargs: Context fields to update
        """
        for key, value in kwargs.items():
            if hasattr(self.context, key):
                setattr(self.context, key, value)
            else:
                self.context.metadata[key] = value
    
    def get_context(self) -> NavigationContext:
        """Get current navigation context."""
        return self.context
    
    def get_current_screen(self) -> ScreenName:
        """Get current screen."""
        return self.current_screen
    
    def is_transitioning(self) -> bool:
        """Check if currently transitioning."""
        return (
            self.current_transition is not None
            and not self.current_transition.is_complete
        )


class ScreenStack:
    """Stack-based screen management (like a back button)."""
    
    def __init__(self, initial_screen: ScreenName = ScreenName.DASHBOARD):
        """Initialize screen stack."""
        self.stack: list[ScreenName] = [initial_screen]
    
    def push(self, screen: ScreenName) -> None:
        """Push screen onto stack."""
        self.stack.append(screen)
    
    def pop(self) -> Optional[ScreenName]:
        """Pop screen from stack."""
        if len(self.stack) > 1:
            return self.stack.pop()
        return None
    
    def peek(self) -> ScreenName:
        """Peek at top of stack."""
        return self.stack[-1]
    
    def clear(self) -> None:
        """Clear stack."""
        self.stack = [ScreenName.DASHBOARD]
    
    def size(self) -> int:
        """Get stack size."""
        return len(self.stack)
    
    def can_pop(self) -> bool:
        """Check if can pop."""
        return len(self.stack) > 1
