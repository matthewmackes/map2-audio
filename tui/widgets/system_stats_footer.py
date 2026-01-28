"""
System Stats Footer Widget for MAP2 TUI
Displays real-time system stats in the footer bar.
"""

import asyncio
import logging
from typing import Optional, Dict, Any

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal
    from textual.widgets import Static, Label
    from textual.reactive import reactive
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False

logger = logging.getLogger(__name__)


class SystemStatsFooter(Static):
    """
    Real-time system stats footer bar.

    Displays:
    - CPU usage (system)
    - Memory usage
    - DSP load
    - Audio latency
    - Active chain count
    - MIDI status
    - Network status
    - Uptime
    """

    DEFAULT_CSS = """
    SystemStatsFooter {
        width: 100%;
        height: 3;
        background: $panel;
        border-top: solid $accent;
        padding: 0;
        layout: horizontal;
    }

    .stats-section {
        height: 100%;
        padding: 0 1;
        border-right: solid $panel-lighten-1;
        content-align: center middle;
    }

    .stats-section:last-child {
        border-right: none;
    }

    .stat-label {
        color: $text-muted;
        text-style: dim;
    }

    .stat-value {
        color: $text;
        text-style: bold;
    }

    .stat-good {
        color: $success;
    }

    .stat-warn {
        color: $warning;
    }

    .stat-bad {
        color: $error;
    }

    #cpu-stat {
        width: auto;
        min-width: 12;
    }

    #mem-stat {
        width: auto;
        min-width: 12;
    }

    #dsp-stat {
        width: auto;
        min-width: 14;
    }

    #latency-stat {
        width: auto;
        min-width: 12;
    }

    #chains-stat {
        width: auto;
        min-width: 12;
    }

    #midi-stat {
        width: auto;
        min-width: 10;
    }

    #net-stat {
        width: auto;
        min-width: 10;
    }

    #uptime-stat {
        width: auto;
        min-width: 14;
    }

    #keys-hint {
        width: 1fr;
        content-align: right middle;
        color: $text-muted;
        text-style: dim;
        padding: 0 1;
    }
    """

    # Reactive values for stats
    cpu_percent: reactive[float] = reactive(0.0)
    mem_percent: reactive[float] = reactive(0.0)
    dsp_load: reactive[float] = reactive(0.0)
    latency_ms: reactive[float] = reactive(0.0)
    active_chains: reactive[int] = reactive(0)
    midi_enabled: reactive[bool] = reactive(False)
    network_ok: reactive[bool] = reactive(False)
    uptime: reactive[str] = reactive("0:00:00")

    def __init__(self, api_client, id: str = "system-stats-footer"):
        super().__init__(id=id)
        self.api_client = api_client
        self._refresh_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Label("CPU: ---%", id="cpu-stat", classes="stats-section")
            yield Label("MEM: ---%", id="mem-stat", classes="stats-section")
            yield Label("DSP: ---%", id="dsp-stat", classes="stats-section")
            yield Label("LAT: ---ms", id="latency-stat", classes="stats-section")
            yield Label("CHAINS: -", id="chains-stat", classes="stats-section")
            yield Label("MIDI: --", id="midi-stat", classes="stats-section")
            yield Label("NET: --", id="net-stat", classes="stats-section")
            yield Label("UP: --:--:--", id="uptime-stat", classes="stats-section")
            yield Label("KEYS: 1-7 tabs | r refresh | q quit", id="keys-hint")

    async def on_mount(self) -> None:
        """Start periodic stats refresh."""
        await self._refresh_stats()
        # Refresh every 2 seconds for responsive updates
        self._refresh_task = self.set_interval(2.0, self._refresh_stats)

    async def _refresh_stats(self) -> None:
        """Fetch all stats from API."""
        try:
            # Run API calls in parallel
            results = await asyncio.gather(
                self._fetch_system_metrics(),
                self._fetch_dsp_stats(),
                self._fetch_audio_stats(),
                self._fetch_chains_stats(),
                self._fetch_midi_stats(),
                self._fetch_network_stats(),
                return_exceptions=True
            )

            # Update display
            self._update_display()

        except Exception as e:
            logger.debug(f"Stats refresh error: {e}")

    async def _fetch_system_metrics(self) -> None:
        """Fetch CPU, memory, uptime."""
        try:
            result = await self.api_client.get_current_metrics()
            if result.success and result.data:
                data = result.data
                self.cpu_percent = float(data.get("cpu_percent", 0))
                self.mem_percent = float(data.get("memory_percent", 0))

                # Format uptime
                uptime_secs = data.get("uptime_seconds", data.get("uptime", 0))
                if isinstance(uptime_secs, (int, float)):
                    hours = int(uptime_secs // 3600)
                    minutes = int((uptime_secs % 3600) // 60)
                    seconds = int(uptime_secs % 60)
                    self.uptime = f"{hours}:{minutes:02d}:{seconds:02d}"
                elif isinstance(uptime_secs, str):
                    self.uptime = uptime_secs[:10]
        except Exception as e:
            logger.debug(f"System metrics error: {e}")

    async def _fetch_dsp_stats(self) -> None:
        """Fetch DSP load."""
        try:
            result = await self.api_client.get_dsp_status()
            if result.success and result.data:
                data = result.data
                # API returns utilization_percent for DSP load
                self.dsp_load = float(data.get("utilization_percent", data.get("current_load_percent", data.get("cpu_used", 0))))
        except Exception as e:
            logger.debug(f"DSP stats error: {e}")

    async def _fetch_audio_stats(self) -> None:
        """Fetch audio latency."""
        try:
            result = await self.api_client.get_audio_latency()
            if result.success and result.data:
                data = result.data
                self.latency_ms = float(data.get("latency_ms", data.get("latency", 0)))
        except Exception as e:
            logger.debug(f"Audio stats error: {e}")

    async def _fetch_chains_stats(self) -> None:
        """Fetch active chains count."""
        try:
            result = await self.api_client.list_chains()
            if result.success and result.data:
                chains = result.data if isinstance(result.data, list) else result.data.get("chains", [])
                active = sum(1 for c in chains if c.get("is_active", False))
                self.active_chains = active
        except Exception as e:
            logger.debug(f"Chains stats error: {e}")

    async def _fetch_midi_stats(self) -> None:
        """Fetch MIDI status."""
        try:
            result = await self.api_client.get_midi_status()
            if result.success and result.data:
                data = result.data
                self.midi_enabled = data.get("enabled", False) or data.get("running", False)
        except Exception as e:
            logger.debug(f"MIDI stats error: {e}")

    async def _fetch_network_stats(self) -> None:
        """Fetch network status."""
        try:
            result = await self.api_client.get_network_status()
            if result.success and result.data:
                data = result.data
                self.network_ok = data.get("internet_connected", False) or data.get("connected", False)
        except Exception as e:
            logger.debug(f"Network stats error: {e}")

    def _update_display(self) -> None:
        """Update all stat labels."""
        try:
            # CPU
            cpu_label = self.query_one("#cpu-stat", Label)
            cpu_status = "good" if self.cpu_percent < 50 else "warn" if self.cpu_percent < 80 else "bad"
            cpu_icon = "🟢" if cpu_status == "good" else "🟡" if cpu_status == "warn" else "🔴"
            cpu_label.update(f"{cpu_icon} CPU:{self.cpu_percent:4.0f}%")

            # Memory
            mem_label = self.query_one("#mem-stat", Label)
            mem_status = "good" if self.mem_percent < 70 else "warn" if self.mem_percent < 85 else "bad"
            mem_icon = "🟢" if mem_status == "good" else "🟡" if mem_status == "warn" else "🔴"
            mem_label.update(f"{mem_icon} MEM:{self.mem_percent:4.0f}%")

            # DSP
            dsp_label = self.query_one("#dsp-stat", Label)
            dsp_status = "good" if self.dsp_load < 50 else "warn" if self.dsp_load < 80 else "bad"
            dsp_icon = "🟢" if dsp_status == "good" else "🟡" if dsp_status == "warn" else "🔴"
            dsp_label.update(f"{dsp_icon} DSP:{self.dsp_load:4.0f}%")

            # Latency
            lat_label = self.query_one("#latency-stat", Label)
            lat_status = "good" if self.latency_ms < 10 else "warn" if self.latency_ms < 20 else "bad"
            lat_icon = "🟢" if lat_status == "good" else "🟡" if lat_status == "warn" else "🔴"
            lat_label.update(f"{lat_icon} LAT:{self.latency_ms:4.1f}ms")

            # Chains
            chains_label = self.query_one("#chains-stat", Label)
            chains_icon = "🎸" if self.active_chains > 0 else "⚪"
            chains_label.update(f"{chains_icon} CHAINS:{self.active_chains}")

            # MIDI
            midi_label = self.query_one("#midi-stat", Label)
            midi_icon = "🎹" if self.midi_enabled else "⚪"
            midi_text = "ON" if self.midi_enabled else "OFF"
            midi_label.update(f"{midi_icon} MIDI:{midi_text}")

            # Network
            net_label = self.query_one("#net-stat", Label)
            net_icon = "🌐" if self.network_ok else "⚪"
            net_text = "OK" if self.network_ok else "OFF"
            net_label.update(f"{net_icon} NET:{net_text}")

            # Uptime
            up_label = self.query_one("#uptime-stat", Label)
            up_label.update(f"⏱️ UP:{self.uptime}")

        except Exception as e:
            logger.debug(f"Display update error: {e}")

    def watch_cpu_percent(self, value: float) -> None:
        """React to CPU changes."""
        self._update_display()

    def watch_mem_percent(self, value: float) -> None:
        """React to memory changes."""
        self._update_display()

    def watch_dsp_load(self, value: float) -> None:
        """React to DSP load changes."""
        self._update_display()
