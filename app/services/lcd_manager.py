"""
LCD Manager

Coordinates all LCD components:
- Event bus (local events)
- Event router (remote events)
- Remote aggregator (collect remote events)
- LCD display (hardware)

Manages the display queue and updates the physical LCD.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from app.services.lcd_event_bus import LCDEventBus
from app.services.lcd_event_router import LCDEventRouter
from app.services.remote_event_aggregator import RemoteEventAggregator
from app.drivers.lcd_display import LCDDisplay, MockLCDDisplay
from app.models.lcd_event import LCDEvent

logger = logging.getLogger(__name__)


class LCDManager:
    """
    Main coordinator for the distributed LCD event system.
    
    Manages:
    - Local event bus
    - Remote event router
    - Remote event aggregator
    - Physical LCD display
    - Display update logic
    """
    
    def __init__(
        self,
        node_id: str,
        node_label: str,
        lcd_port: str = "/dev/ttyUSB0",
        use_mock_lcd: bool = False,
    ):
        self.node_id = node_id
        self.node_label = node_label
        
        # Components
        self.event_bus = LCDEventBus(node_id, node_label)
        self.event_router = LCDEventRouter(node_id, node_label)
        self.remote_aggregator = RemoteEventAggregator()
        
        # LCD hardware
        if use_mock_lcd:
            self.lcd = MockLCDDisplay()
        else:
            self.lcd = LCDDisplay(port=lcd_port)
        
        # Display queue (events waiting to be shown)
        self.display_queue: asyncio.Queue = asyncio.Queue()
        
        # Current event being displayed
        self.current_event: Optional[LCDEvent] = None
        
        # Background tasks
        self._display_task = None
        self._cleanup_task = None
        
    async def start(self):
        """Start all components"""
        logger.info(f"Starting LCD Manager for {self.node_label}")
        
        # Connect LCD
        try:
            await self.lcd.connect()
        except Exception as e:
            logger.error(f"Failed to connect LCD, using mock: {e}")
            self.lcd = MockLCDDisplay()
            await self.lcd.connect()
        
        # Start event bus
        await self.event_bus.start()
        
        # Start router
        await self.event_router.start()
        
        # Wire up components
        self.event_bus.set_remote_broadcast_handler(self.event_router.broadcast_event)
        self.event_router.set_remote_event_handler(self.remote_aggregator.receive_remote_event)
        
        # Subscribe to local events for display
        self.event_bus.subscribe(self._queue_event_for_display)
        
        # Subscribe to remote events for display
        self.remote_aggregator.subscribe(self._queue_event_for_display)
        
        # Start display update task
        self._display_task = asyncio.create_task(self._update_display_loop())
        
        # Start cleanup task
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        
        # Show welcome message
        await self._show_welcome()
        
        logger.info("LCD Manager started successfully")
    
    async def stop(self):
        """Stop all components"""
        logger.info("Stopping LCD Manager")
        
        # Stop tasks
        if self._display_task:
            self._display_task.cancel()
        if self._cleanup_task:
            self._cleanup_task.cancel()
        
        # Stop components
        await self.event_bus.stop()
        await self.event_router.stop()
        
        # Disconnect LCD
        await self.lcd.disconnect()
        
        logger.info("LCD Manager stopped")
    
    async def _show_welcome(self):
        """Show welcome message on LCD"""
        await self.lcd.write_lines([
            "MAP2 AUDIO PLATFORM",
            self.node_label,
            "",
            "Initializing..."
        ])
        await asyncio.sleep(2)
    
    async def _queue_event_for_display(self, event: LCDEvent):
        """Add event to display queue"""
        # Check if event should be displayed on this node
        if not event.should_display_on_node(self.node_id):
            return
        
        await self.display_queue.put(event)
        logger.debug(f"Queued event for display: {event.title}")
    
    async def _update_display_loop(self):
        """Background task to update LCD display"""
        while True:
            try:
                # Get next event (wait if queue empty)
                event = await self.display_queue.get()
                
                # Display event
                await self._display_event(event)
                
                # Play sound if requested
                if event.sound:
                    await self.lcd.play_sound()
                
                # Store as current event
                self.current_event = event
                
                # Auto-dismiss after delay
                if event.dismiss_auto:
                    await asyncio.sleep(5)
                else:
                    # For non-auto-dismiss, wait longer
                    await asyncio.sleep(15)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Display update error: {e}")
    
    async def _display_event(self, event: LCDEvent):
        """Display event on LCD"""
        # Format source indicator
        source = "[LOCAL]" if event.source_node == self.node_label else "[REMOTE]"
        
        # Line 0: Header
        header = f"MAP2 - {self.node_label[:16]}"
        
        # Line 1: Source + Icon + Title
        line1 = f"{source} {event.icon} {event.title}"
        
        # Line 2: Message (first 20 chars)
        line2 = event.message[:20]
        
        # Line 3: Message continuation or timestamp
        if len(event.message) > 20:
            line3 = event.message[20:40]
        else:
            timestamp = event.timestamp.strftime("%H:%M:%S")
            line3 = f"{event.source_node[:13]} {timestamp}"
        
        # Write to LCD
        await self.lcd.write_lines([
            header,
            line1,
            line2,
            line3
        ])
        
        logger.info(f"Displayed: {event.title}")
    
    async def _cleanup_loop(self):
        """Periodic cleanup of expired events"""
        while True:
            try:
                await asyncio.sleep(60)  # Every minute
                await self.event_bus.clear_expired_events()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
    
    async def connect_to_peer(self, node_id: str, node_url: str):
        """Connect to a peer node for event sharing"""
        await self.event_router.connect_to_peer(node_id, node_url)
    
    async def publish_event(self, event: LCDEvent):
        """Publish event (convenience method)"""
        await self.event_bus.publish(event)
    
    def get_recent_local_events(self, limit: int = 50):
        """Get recent local events"""
        return self.event_bus.get_recent_events(limit)
    
    def get_recent_remote_events(self, limit: int = 50):
        """Get recent remote events"""
        return self.remote_aggregator.get_all_remote_events(limit)
    
    def get_all_recent_events(self, limit: int = 100):
        """Get combined local + remote events"""
        local = self.event_bus.get_recent_events(limit)
        remote = self.remote_aggregator.get_all_remote_events(limit)
        
        # Combine and sort by timestamp
        all_events = local + remote
        all_events.sort(key=lambda e: e.timestamp, reverse=True)
        
        return all_events[:limit]
