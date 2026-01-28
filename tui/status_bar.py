"""
Status Bar Component
====================
Real-time system metrics display with color-coded status indicators.
"""

import asyncio
from typing import Optional
from datetime import datetime
from textual.widgets import Static
from textual.reactive import reactive


class StatusBar(Static):
    """Real-time system status bar showing metrics and indicators."""
    
    # Reactive properties for auto-update
    cpu_usage: reactive[float] = reactive(0.0)
    ram_usage: reactive[float] = reactive(0.0)
    latency: reactive[float] = reactive(0.0)
    active_chain: reactive[str] = reactive("None")
    plugin_count: reactive[int] = reactive(0)
    sync_status: reactive[str] = reactive("🟢 Synced")
    last_update: reactive[str] = reactive("")
    
    DEFAULT_CSS = """
    StatusBar {
        width: 100%;
        height: 1;
        background: $surface;
        border: solid $primary;
        padding: 0 1;
        text-style: bold;
    }
    """
    
    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self._update_task: Optional[asyncio.Task] = None
    
    def render(self) -> str:
        """Render the status bar."""
        # Color code based on values
        cpu_color = "green" if self.cpu_usage < 70 else "yellow" if self.cpu_usage < 85 else "red"
        ram_color = "green" if self.ram_usage < 70 else "yellow" if self.ram_usage < 85 else "red"
        latency_color = "green" if self.latency < 5 else "yellow" if self.latency < 10 else "red"
        
        status = (
            f"[{cpu_color}]CPU: {self.cpu_usage:.0f}%[/] │ "
            f"[{ram_color}]RAM: {self.ram_usage:.0f}%[/] │ "
            f"[{latency_color}]RTL: {self.latency:.1f}ms[/] │ "
            f"Chain: {self.active_chain} ({self.plugin_count} fx) │ "
            f"{self.sync_status} │ "
            f"[dim]{self.last_update}[/]"
        )
        return status
    
    async def update_metrics(self) -> None:
        """Periodically update metrics from API."""
        while True:
            try:
                if self.api_client:
                    # Get system metrics
                    metrics = await self.api_client.get_system_metrics()
                    if metrics:
                        self.cpu_usage = metrics.get("cpu_usage", 0)
                        self.ram_usage = metrics.get("ram_usage", 0)
                        self.latency = metrics.get("latency", 0)
                    
                    # Get active chain info
                    chain_info = await self.api_client.get_active_chain()
                    if chain_info:
                        self.active_chain = chain_info.get("name", "None")
                        self.plugin_count = len(chain_info.get("plugins", []))
                    
                    # Update timestamp
                    self.last_update = datetime.now().strftime("%H:%M:%S")
                    
            except Exception as e:
                self.sync_status = f"🔴 Error: {str(e)[:20]}"
            
            # Update every 2 seconds
            await asyncio.sleep(2)
    
    def on_mount(self) -> None:
        """Start periodic updates when mounted."""
        if self.api_client:
            self._update_task = asyncio.create_task(self.update_metrics())
    
    def on_unmount(self) -> None:
        """Cancel updates when unmounted."""
        if self._update_task:
            self._update_task.cancel()
