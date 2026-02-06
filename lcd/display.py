"""
LCD Display Module
Dual 20x2/20x4 character display with API integration.

Features:
- Real-time system status display
- VU meters and progress bars
- Automatic refresh from API
- Simulation mode for development
"""

import logging
import asyncio
import aiohttp
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Callable
from time import time
from datetime import datetime

logger = logging.getLogger(__name__)

# Default API endpoint
DEFAULT_API_BASE = "http://localhost:8080"


def truncate(text: str, width: int) -> str:
    """Truncate and pad text to width."""
    if len(text) > width:
        return text[:width]
    return text.ljust(width)


def progress_bar(percent: float, width: int = 10) -> str:
    """Create progress bar (e.g., '█████░░░░░')."""
    percent = max(0, min(100, percent))
    filled = int((percent / 100.0) * width)
    return "█" * filled + "░" * (width - filled)


def vu_meter(db: float, width: int = 16, peak_hold: Optional[float] = None) -> str:
    """Create VU meter with optional peak hold.
    
    Args:
        db: Level in dB (0 to -60)
        width: Display width
        peak_hold: Peak level in dB (optional)
        
    Returns:
        VU meter string
    """
    # Map dB to percentage (0dB = 100%, -60dB = 0%)
    percent = max(0, min(100, (db + 60) / 60 * 100))
    filled = int((percent / 100.0) * width)
    
    # Add peak indicator if provided
    if peak_hold is not None:
        peak_percent = max(0, min(100, (peak_hold + 60) / 60 * 100))
        peak_pos = int((peak_percent / 100.0) * width)
        
        bar = list("░" * width)
        for i in range(filled):
            bar[i] = "█"
        if peak_pos < width:
            bar[peak_pos] = "▌"
        return "".join(bar)
    
    return "█" * filled + "░" * (width - filled)


def alert_symbol(high: bool) -> str:
    """Return alert symbol based on threshold."""
    return "▲" if high else "▼"


def format_time(seconds: float) -> str:
    """Format seconds as HH:MM or MM:SS."""
    if seconds >= 3600:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}:{minutes:02d}h"
    else:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"


class APIDataFetcher:
    """Fetch data from MAP2 API for LCD display.
    
    Provides async data fetching with caching and error handling.
    """
    
    def __init__(self, base_url: str = DEFAULT_API_BASE, 
                 timeout: float = 2.0,
                 cache_ttl: float = 0.5):
        """Initialize API fetcher.
        
        Args:
            base_url: API base URL
            timeout: Request timeout in seconds
            cache_ttl: Cache time-to-live in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.cache_ttl = cache_ttl
        
        # Cached data
        self._cache: Dict[str, Any] = {}
        self._cache_time: Dict[str, float] = {}
        
        # Connection state
        self._connected = False
        self._last_error: Optional[str] = None
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session
    
    async def close(self) -> None:
        """Close the session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def _fetch(self, endpoint: str) -> Optional[Dict[str, Any]]:
        """Fetch data from API endpoint.
        
        Args:
            endpoint: API endpoint path
            
        Returns:
            JSON response or None on error
        """
        # Check cache
        now = time()
        if endpoint in self._cache:
            if now - self._cache_time.get(endpoint, 0) < self.cache_ttl:
                return self._cache[endpoint]
        
        try:
            session = await self._get_session()
            url = f"{self.base_url}{endpoint}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    self._cache[endpoint] = data
                    self._cache_time[endpoint] = now
                    self._connected = True
                    self._last_error = None
                    return data
                else:
                    self._last_error = f"HTTP {response.status}"
                    return None
                    
        except asyncio.TimeoutError:
            self._last_error = "Timeout"
            self._connected = False
            return None
        except aiohttp.ClientError as e:
            self._last_error = str(e)
            self._connected = False
            return None
        except Exception as e:
            self._last_error = str(e)
            logger.error(f"API fetch error: {e}")
            return None
    
    async def get_system_status(self) -> Dict[str, Any]:
        """Get system status."""
        data = await self._fetch("/api/system/status")
        return data or {
            "sample_rate": 48000,
            "buffer_size": 256,
            "cpu_percent": 0,
            "xruns": 0,
            "connected": False
        }
    
    async def get_performance(self) -> Dict[str, Any]:
        """Get performance metrics."""
        data = await self._fetch("/api/performance/current")
        return data or {
            "cpu_percent": 0,
            "memory_percent": 0,
            "audio_latency_ms": 0
        }
    
    async def get_audio_levels(self) -> Dict[str, Any]:
        """Get audio input/output levels."""
        data = await self._fetch("/api/audio/levels")
        return data or {
            "input_l": -60,
            "input_r": -60,
            "output_l": -60,
            "output_r": -60
        }
    
    async def get_active_chain(self) -> Dict[str, Any]:
        """Get active audio chain info."""
        data = await self._fetch("/api/chains/active")
        return data or {
            "name": "None",
            "plugins": []
        }
    
    async def get_midi_status(self) -> Dict[str, Any]:
        """Get MIDI engine status."""
        data = await self._fetch("/api/midi/status")
        return data or {
            "running": False,
            "device": "None"
        }
    
    @property
    def is_connected(self) -> bool:
        """Check if API is reachable."""
        return self._connected
    
    @property
    def last_error(self) -> Optional[str]:
        """Get last error message."""
        return self._last_error


@dataclass
class DualLCD:
    """Dual 20x2 character LCD display with API integration.
    
    Displays system status, audio levels, and performance metrics
    on dual LCD displays (or in simulation mode).
    """
    
    # Display content (4 lines for 2x 20x2 displays)
    line1_top: str = ""
    line2_top: str = ""
    line1_bottom: str = ""
    line2_bottom: str = ""
    
    # Timing
    last_update: float = 0.0
    update_interval: float = 0.5  # 500ms refresh
    
    # Display mode
    display_mode: str = "status"  # status, levels, chain, performance
    
    # API fetcher
    _fetcher: Optional[APIDataFetcher] = field(default=None, repr=False)
    
    def __post_init__(self):
        if self._fetcher is None:
            self._fetcher = APIDataFetcher()
    
    async def update_from_api(self, fetcher: Optional[APIDataFetcher] = None) -> None:
        """Update display from API data.
        
        Args:
            fetcher: Optional API fetcher (uses internal if not provided)
        """
        now = time()
        if now - self.last_update < self.update_interval:
            return
        
        fetcher = fetcher or self._fetcher
        if fetcher is None:
            fetcher = APIDataFetcher()
            self._fetcher = fetcher
        
        try:
            if self.display_mode == "status":
                await self._update_status_mode(fetcher)
            elif self.display_mode == "levels":
                await self._update_levels_mode(fetcher)
            elif self.display_mode == "chain":
                await self._update_chain_mode(fetcher)
            elif self.display_mode == "performance":
                await self._update_performance_mode(fetcher)
            else:
                await self._update_status_mode(fetcher)
            
            self.last_update = now
            
        except Exception as e:
            logger.error(f"LCD update error: {e}")
            self._show_error(str(e))
    
    async def _update_status_mode(self, fetcher: APIDataFetcher) -> None:
        """Update display with system status."""
        status = await fetcher.get_system_status()
        perf = await fetcher.get_performance()
        
        sample_rate = status.get("sample_rate", 48000)
        buffer_size = status.get("buffer_size", 256)
        cpu = perf.get("cpu_percent", 0)
        xruns = status.get("xruns", 0)
        
        # Calculate latency
        latency_ms = (buffer_size / sample_rate) * 1000 * 2  # Round trip
        
        # Top display: System info
        self.line1_top = "MAP2 Audio Platform"
        
        if fetcher.is_connected:
            self.line2_top = f"SR:{sample_rate//1000}k Buf:{buffer_size}"
        else:
            self.line2_top = f"API: {fetcher.last_error or 'Offline'}"[:20]
        
        # Bottom display: Performance
        cpu_bar = progress_bar(cpu, 8)
        self.line1_bottom = f"CPU:{cpu_bar} {cpu:4.1f}%"
        self.line2_bottom = f"Lat:{latency_ms:4.1f}ms XR:{xruns:3d}"
    
    async def _update_levels_mode(self, fetcher: APIDataFetcher) -> None:
        """Update display with audio levels."""
        levels = await fetcher.get_audio_levels()
        
        in_l = levels.get("input_l", -60)
        in_r = levels.get("input_r", -60)
        out_l = levels.get("output_l", -60)
        out_r = levels.get("output_r", -60)
        
        # Top display: Input levels
        self.line1_top = f"IN L {vu_meter(in_l, 14)}"
        self.line2_top = f"IN R {vu_meter(in_r, 14)}"
        
        # Bottom display: Output levels  
        self.line1_bottom = f"OUT L{vu_meter(out_l, 14)}"
        self.line2_bottom = f"OUT R{vu_meter(out_r, 14)}"
    
    async def _update_chain_mode(self, fetcher: APIDataFetcher) -> None:
        """Update display with active chain info."""
        chain = await fetcher.get_active_chain()
        
        chain_name = chain.get("name", "None")
        plugins = chain.get("plugins", [])
        
        self.line1_top = f"Chain: {chain_name}"[:20]
        self.line2_top = f"Plugins: {len(plugins)}"
        
        # Show first two plugins
        if len(plugins) > 0:
            self.line1_bottom = f"1:{plugins[0].get('name', '?')}"[:20]
        else:
            self.line1_bottom = "No plugins loaded"
        
        if len(plugins) > 1:
            self.line2_bottom = f"2:{plugins[1].get('name', '?')}"[:20]
        else:
            self.line2_bottom = ""
    
    async def _update_performance_mode(self, fetcher: APIDataFetcher) -> None:
        """Update display with performance details."""
        perf = await fetcher.get_performance()
        
        cpu = perf.get("cpu_percent", 0)
        mem = perf.get("memory_percent", 0)
        uptime = perf.get("uptime_seconds", 0)
        
        self.line1_top = f"CPU: {cpu:.1f}%"
        self.line2_top = f"MEM: {mem:.1f}%"
        self.line1_bottom = f"Uptime: {format_time(uptime)}"
        self.line2_bottom = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    def _show_error(self, error: str) -> None:
        """Show error on display."""
        self.line1_top = "MAP2 Audio Platform"
        self.line2_top = "Error:"
        self.line1_bottom = truncate(error, 20)
        self.line2_bottom = "Check logs"
    
    def set_mode(self, mode: str) -> None:
        """Set display mode.
        
        Args:
            mode: One of 'status', 'levels', 'chain', 'performance'
        """
        if mode in ("status", "levels", "chain", "performance"):
            self.display_mode = mode
            self.last_update = 0  # Force immediate update
    
    def cycle_mode(self) -> str:
        """Cycle to next display mode.
        
        Returns:
            New mode name
        """
        modes = ["status", "levels", "chain", "performance"]
        current_idx = modes.index(self.display_mode) if self.display_mode in modes else 0
        next_idx = (current_idx + 1) % len(modes)
        self.display_mode = modes[next_idx]
        self.last_update = 0
        return self.display_mode

    def simulate(self) -> str:
        """Return ASCII simulation of dual LCD."""
        lines = [
            "┌────────────────────┐",
            f"│{truncate(self.line1_top, 20)}│",
            f"│{truncate(self.line2_top, 20)}│",
            "├────────────────────┤",
            f"│{truncate(self.line1_bottom, 20)}│",
            f"│{truncate(self.line2_bottom, 20)}│",
            "└────────────────────┘",
        ]
        return "\n".join(lines)
    
    def get_lines(self) -> List[str]:
        """Get all display lines as list.
        
        Returns:
            List of 4 strings
        """
        return [
            self.line1_top,
            self.line2_top,
            self.line1_bottom,
            self.line2_bottom
        ]
    
    async def close(self) -> None:
        """Close API connection."""
        if self._fetcher:
            await self._fetcher.close()
