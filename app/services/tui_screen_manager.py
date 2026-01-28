"""
TUI screen manager with debounced updates.
Prevents screen flickering and ensures smooth terminal UI experience.
"""

import asyncio
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class DebouncedScreenUpdater:
    """
    Non-blocking screen updater with debouncing.
    Groups rapid updates into single renders to prevent flickering.
    """
    
    def __init__(
        self,
        screen_driver: Any,
        debounce_ms: float = 100.0,
        max_updates_per_second: float = 10.0
    ):
        """
        Initialize debounced screen updater.
        
        Args:
            screen_driver: Screen rendering object (from Textual or similar)
            debounce_ms: Debounce interval in milliseconds (default: 100)
            max_updates_per_second: Maximum update rate (default: 10 Hz)
        """
        self.screen = screen_driver
        self.debounce_interval = debounce_ms / 1000.0
        self.update_interval = 1.0 / max_updates_per_second
        
        self.pending_update: Optional[Dict[str, Any]] = None
        self.last_update_time = 0.0
        self.update_task: Optional[asyncio.Task] = None
        self.dirty_regions = set()
    
    async def request_update(
        self,
        data: Dict[str, Any],
        regions: Optional[set] = None
    ) -> None:
        """
        Request a screen update (debounced).
        
        Args:
            data: Data to render
            regions: Which screen regions changed (for optimization)
        """
        self.pending_update = data
        
        if regions:
            self.dirty_regions.update(regions)
        
        # Cancel existing pending update
        if self.update_task and not self.update_task.done():
            self.update_task.cancel()
        
        # Check if enough time passed since last update
        elapsed = time.time() - self.last_update_time
        
        if elapsed >= self.update_interval:
            # Update immediately
            await self._execute_update()
        else:
            # Schedule update after debounce interval
            delay = max(
                self.debounce_interval - elapsed,
                0.01  # Minimum 10ms
            )
            self.update_task = asyncio.create_task(
                self._delayed_update(delay)
            )
    
    async def _delayed_update(self, delay: float) -> None:
        """Wait then update"""
        try:
            await asyncio.sleep(delay)
            if self.pending_update:
                await self._execute_update()
        except asyncio.CancelledError:
            pass  # Update was superseded
    
    async def _execute_update(self) -> None:
        """Perform actual screen update (runs in thread pool)"""
        if not self.pending_update:
            return
        
        data = self.pending_update
        loop = asyncio.get_event_loop()
        
        try:
            # Run rendering in thread pool to not block event loop
            regions = self.dirty_regions or None
            await loop.run_in_executor(
                None,
                self._render_to_screen,
                data,
                regions
            )
            
            self.last_update_time = time.time()
            self.dirty_regions.clear()
            
            logger.debug("Screen updated")
            
        except Exception as e:
            logger.error(f"Screen update failed: {e}")
        finally:
            self.pending_update = None
    
    def _render_to_screen(
        self,
        data: Dict[str, Any],
        regions: Optional[set] = None
    ) -> None:
        """
        CPU-bound rendering (runs in thread pool).
        Only update regions that changed.
        """
        try:
            if regions is None or 'full' in regions:
                # Full screen render
                self.screen.clear()
                self.screen.render_full_layout(data)
            else:
                # Partial updates for specific regions
                for region in regions:
                    self.screen.render_region(region, data)
            
            self.screen.refresh()
            
        except Exception as e:
            logger.error(f"Rendering error: {e}")
    
    async def flush(self) -> None:
        """Ensure pending update is processed immediately"""
        if self.update_task and not self.update_task.done():
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                pass
        
        if self.pending_update:
            await self._execute_update()


class ScreenManager:
    """
    High-level screen management with debouncing.
    Coordinates updates from different components.
    """
    
    def __init__(self, screen_driver: Any):
        self.updater = DebouncedScreenUpdater(screen_driver)
        self.component_data: Dict[str, Dict[str, Any]] = {}
    
    async def update_component(
        self,
        component_name: str,
        data: Dict[str, Any]
    ) -> None:
        """
        Update a screen component.
        
        Args:
            component_name: Name of component (e.g., 'chains', 'parameters', 'metrics')
            data: Component data to render
        """
        # Store component data
        self.component_data[component_name] = data
        
        # Request full screen update with dirty region
        full_data = {
            'timestamp': time.time(),
            'components': self.component_data
        }
        
        await self.updater.request_update(
            full_data,
            regions={component_name}
        )
    
    async def update_multiple(
        self,
        updates: Dict[str, Dict[str, Any]]
    ) -> None:
        """
        Update multiple components at once.
        More efficient than individual updates.
        
        Args:
            updates: Dict of component_name -> data
        """
        # Store all updates
        for component_name, data in updates.items():
            self.component_data[component_name] = data
        
        # Single update for all components
        full_data = {
            'timestamp': time.time(),
            'components': self.component_data
        }
        
        await self.updater.request_update(
            full_data,
            regions=set(updates.keys())
        )
    
    async def get_component_data(
        self,
        component_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get last rendered data for a component"""
        return self.component_data.get(component_name)
    
    async def flush(self) -> None:
        """Ensure all pending updates are rendered"""
        await self.updater.flush()


# Global instance
_screen_manager: Optional[ScreenManager] = None


def get_screen_manager() -> Optional[ScreenManager]:
    """Get global screen manager instance"""
    return _screen_manager


def create_screen_manager(screen_driver: Any) -> ScreenManager:
    """Create and set global screen manager instance"""
    global _screen_manager
    _screen_manager = ScreenManager(screen_driver)
    return _screen_manager
