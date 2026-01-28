"""
LCD Alert Router - Routes alerts to specific LCD displays

Features:
- Per-alert-type routing configuration
- Per-LCD page configuration
- Custom message display
- Alert queue with priority handling
"""

import logging
import threading
import time
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
import json
from pathlib import Path

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    USER = "user"


@dataclass
class AlertRoutingConfig:
    """Per-alert-type routing configuration."""
    alert_type: str
    target_lcd: int  # 0, 1, or -1 for both
    duration_seconds: int
    enabled: bool = True
    priority: int = 5  # 1-10, lower is higher priority
    severity: AlertSeverity = AlertSeverity.INFO


@dataclass
class LCDPageConfig:
    """Per-LCD page configuration."""
    lcd_id: int
    default_page: str = "status"
    allow_alert_interrupt: bool = True
    auto_cycle: bool = False
    cycle_interval_seconds: int = 10


@dataclass
class QueuedAlert:
    """An alert queued for display."""
    alert_type: str
    message: str
    target_lcd: int
    duration: int
    priority: int
    timestamp: float = field(default_factory=time.time)
    displayed: bool = False


class AlertRouter:
    """Routes alerts to LCD displays based on configuration."""

    # Default alert routing configuration
    DEFAULT_ROUTING = {
        "XRUN": AlertRoutingConfig("XRUN", 0, 5, True, 3, AlertSeverity.WARNING),
        "HIGH_XRUN_RATE": AlertRoutingConfig("HIGH_XRUN_RATE", -1, 10, True, 1, AlertSeverity.CRITICAL),
        "THREAD_STALL": AlertRoutingConfig("THREAD_STALL", -1, 30, True, 1, AlertSeverity.CRITICAL),
        "SIGNAL_LOST": AlertRoutingConfig("SIGNAL_LOST", 1, 3, True, 5, AlertSeverity.INFO),
        "AUTO_MUTED": AlertRoutingConfig("AUTO_MUTED", 1, 3, True, 5, AlertSeverity.INFO),
        "BUFFER_UNDERRUN": AlertRoutingConfig("BUFFER_UNDERRUN", 0, 5, True, 2, AlertSeverity.WARNING),
        "CPU_HIGH": AlertRoutingConfig("CPU_HIGH", 0, 5, True, 4, AlertSeverity.WARNING),
    }

    # Default page configuration
    DEFAULT_PAGE_CONFIG = {
        0: LCDPageConfig(0, "status", True, False, 10),
        1: LCDPageConfig(1, "vu", False, True, 10),
    }

    def __init__(self, lcd_manager=None, config_path: Optional[str] = None):
        """Initialize alert router.

        Args:
            lcd_manager: IntegratedLCDManager instance
            config_path: Path to configuration file
        """
        self.lcd_manager = lcd_manager
        self.config_path = Path(config_path) if config_path else Path.home() / ".config" / "map2" / "lcd_alerts.json"

        # Configuration
        self.routing_config: Dict[str, AlertRoutingConfig] = dict(self.DEFAULT_ROUTING)
        self.page_config: Dict[int, LCDPageConfig] = dict(self.DEFAULT_PAGE_CONFIG)

        # State
        self.alert_queue: List[QueuedAlert] = []
        self._lock = threading.RLock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

        # Callbacks
        self._on_alert_displayed: Optional[Callable[[QueuedAlert], None]] = None

        # Load saved configuration
        self._load_config()

    def start(self) -> None:
        """Start the alert router."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._process_loop, daemon=True)
        self._thread.start()
        logger.info("Alert router started")

    def stop(self) -> None:
        """Stop the alert router."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
        logger.info("Alert router stopped")

    def route_alert(self, alert_type: str, message: str = "") -> bool:
        """Route an alert to appropriate LCD(s).

        Args:
            alert_type: Type of alert (e.g., "XRUN", "CPU_HIGH")
            message: Optional message to display

        Returns:
            True if alert was queued
        """
        config = self.routing_config.get(alert_type)
        if not config or not config.enabled:
            logger.debug(f"Alert {alert_type} not configured or disabled")
            return False

        # Check if LCD allows interrupts
        if config.target_lcd >= 0:
            page_cfg = self.page_config.get(config.target_lcd)
            if page_cfg and not page_cfg.allow_alert_interrupt:
                logger.debug(f"LCD {config.target_lcd} does not allow interrupts")
                return False

        # Create queued alert
        alert = QueuedAlert(
            alert_type=alert_type,
            message=message or f"{alert_type}",
            target_lcd=config.target_lcd,
            duration=config.duration_seconds,
            priority=config.priority
        )

        with self._lock:
            # Add to queue sorted by priority
            self.alert_queue.append(alert)
            self.alert_queue.sort(key=lambda a: (a.priority, a.timestamp))

            # Limit queue size
            if len(self.alert_queue) > 50:
                self.alert_queue = self.alert_queue[:50]

        logger.debug(f"Alert queued: {alert_type} for LCD {config.target_lcd}")
        return True

    def display_custom_message(self, lcd_id: int, lines: List[str], duration: int = 5) -> bool:
        """Display custom message on specific LCD.

        Args:
            lcd_id: LCD to display on (0, 1, or -1 for both)
            lines: Lines of text to display
            duration: Display duration in seconds

        Returns:
            True if message was queued
        """
        message = "\n".join(lines[:4])  # Max 4 lines

        alert = QueuedAlert(
            alert_type="CUSTOM",
            message=message,
            target_lcd=lcd_id,
            duration=duration,
            priority=10  # Low priority for custom messages
        )

        with self._lock:
            self.alert_queue.append(alert)

        return True

    def set_routing_config(self, alert_type: str, config: AlertRoutingConfig) -> None:
        """Update routing configuration for an alert type.

        Args:
            alert_type: Alert type to configure
            config: New configuration
        """
        self.routing_config[alert_type] = config
        self._save_config()

    def set_page_config(self, lcd_id: int, config: LCDPageConfig) -> None:
        """Update page configuration for an LCD.

        Args:
            lcd_id: LCD ID (0 or 1)
            config: New configuration
        """
        self.page_config[lcd_id] = config
        self._save_config()

    def set_default_page(self, lcd_id: int, page: str) -> None:
        """Set default page for an LCD.

        Args:
            lcd_id: LCD ID (0 or 1)
            page: Page name
        """
        if lcd_id in self.page_config:
            self.page_config[lcd_id].default_page = page
            self._save_config()

            # Apply immediately if manager available
            if self.lcd_manager:
                try:
                    from lcd.ui_engine import PageType
                    page_map = {
                        'status': PageType.STATUS,
                        'vu': PageType.VU_METERS,
                        'chain': PageType.CHAIN,
                        'plugins': PageType.PLUGINS,
                        'midi': PageType.MIDI,
                        'perf': PageType.PERF,
                        'settings': PageType.SETTINGS,
                        'menu': PageType.MENU,
                    }
                    if page.lower() in page_map:
                        self.lcd_manager.set_page(page_map[page.lower()])
                except Exception as e:
                    logger.debug(f"Error setting page: {e}")

    def get_config(self) -> Dict[str, Any]:
        """Get complete configuration.

        Returns:
            Configuration dictionary
        """
        return {
            "routing": {
                name: {
                    "alert_type": cfg.alert_type,
                    "target_lcd": cfg.target_lcd,
                    "duration_seconds": cfg.duration_seconds,
                    "enabled": cfg.enabled,
                    "priority": cfg.priority,
                    "severity": cfg.severity.value
                }
                for name, cfg in self.routing_config.items()
            },
            "pages": {
                str(lcd_id): {
                    "lcd_id": cfg.lcd_id,
                    "default_page": cfg.default_page,
                    "allow_alert_interrupt": cfg.allow_alert_interrupt,
                    "auto_cycle": cfg.auto_cycle,
                    "cycle_interval_seconds": cfg.cycle_interval_seconds
                }
                for lcd_id, cfg in self.page_config.items()
            }
        }

    def update_config(self, config: Dict[str, Any]) -> None:
        """Update configuration from dictionary.

        Args:
            config: Configuration dictionary
        """
        if "routing" in config:
            for name, cfg_dict in config["routing"].items():
                self.routing_config[name] = AlertRoutingConfig(
                    alert_type=cfg_dict.get("alert_type", name),
                    target_lcd=cfg_dict.get("target_lcd", 0),
                    duration_seconds=cfg_dict.get("duration_seconds", 5),
                    enabled=cfg_dict.get("enabled", True),
                    priority=cfg_dict.get("priority", 5),
                    severity=AlertSeverity(cfg_dict.get("severity", "info"))
                )

        if "pages" in config:
            for lcd_id_str, cfg_dict in config["pages"].items():
                lcd_id = int(lcd_id_str)
                self.page_config[lcd_id] = LCDPageConfig(
                    lcd_id=lcd_id,
                    default_page=cfg_dict.get("default_page", "status"),
                    allow_alert_interrupt=cfg_dict.get("allow_alert_interrupt", True),
                    auto_cycle=cfg_dict.get("auto_cycle", False),
                    cycle_interval_seconds=cfg_dict.get("cycle_interval_seconds", 10)
                )

        self._save_config()

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current alert queue status.

        Returns:
            Queue status dictionary
        """
        with self._lock:
            return {
                "queue_length": len(self.alert_queue),
                "alerts": [
                    {
                        "alert_type": a.alert_type,
                        "target_lcd": a.target_lcd,
                        "priority": a.priority,
                        "age_seconds": time.time() - a.timestamp
                    }
                    for a in self.alert_queue[:10]
                ]
            }

    def clear_queue(self) -> None:
        """Clear the alert queue."""
        with self._lock:
            self.alert_queue.clear()

    def _process_loop(self) -> None:
        """Background processing loop."""
        while self._running:
            try:
                self._process_alerts()
                time.sleep(0.1)
            except Exception as e:
                logger.error(f"Alert processing error: {e}")
                time.sleep(1.0)

    def _process_alerts(self) -> None:
        """Process queued alerts."""
        with self._lock:
            if not self.alert_queue:
                return

            # Get highest priority alert
            alert = self.alert_queue[0]

            if not alert.displayed:
                self._display_alert(alert)
                alert.displayed = True

            # Check if duration expired
            if time.time() - alert.timestamp > alert.duration:
                self.alert_queue.pop(0)
                self._restore_default_page(alert.target_lcd)

    def _display_alert(self, alert: QueuedAlert) -> None:
        """Display an alert on LCD(s).

        Args:
            alert: Alert to display
        """
        if not self.lcd_manager:
            logger.debug(f"No LCD manager - alert {alert.alert_type} not displayed")
            return

        try:
            # Format message for LCD
            lines = alert.message.split("\n")[:2]  # Max 2 lines per display

            # Would need to implement actual display logic here
            # For now, log the alert
            logger.info(f"Alert displayed: {alert.alert_type} on LCD {alert.target_lcd}")

            if self._on_alert_displayed:
                self._on_alert_displayed(alert)

        except Exception as e:
            logger.error(f"Error displaying alert: {e}")

    def _restore_default_page(self, lcd_id: int) -> None:
        """Restore default page after alert.

        Args:
            lcd_id: LCD to restore (-1 for all)
        """
        if not self.lcd_manager:
            return

        try:
            if lcd_id == -1:
                # Restore both
                for lid in [0, 1]:
                    cfg = self.page_config.get(lid)
                    if cfg:
                        self.set_default_page(lid, cfg.default_page)
            else:
                cfg = self.page_config.get(lcd_id)
                if cfg:
                    self.set_default_page(lcd_id, cfg.default_page)
        except Exception as e:
            logger.debug(f"Error restoring page: {e}")

    def _load_config(self) -> None:
        """Load configuration from file."""
        try:
            if self.config_path.exists():
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                    self.update_config(config)
                logger.debug(f"Loaded alert config from {self.config_path}")
        except Exception as e:
            logger.debug(f"Could not load alert config: {e}")

    def _save_config(self) -> None:
        """Save configuration to file."""
        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, 'w') as f:
                json.dump(self.get_config(), f, indent=2)
            logger.debug(f"Saved alert config to {self.config_path}")
        except Exception as e:
            logger.debug(f"Could not save alert config: {e}")


# Global instance
_alert_router: Optional[AlertRouter] = None


def get_alert_router() -> AlertRouter:
    """Get or create global alert router instance."""
    global _alert_router
    if _alert_router is None:
        _alert_router = AlertRouter()
    return _alert_router


def set_alert_router(router: AlertRouter) -> None:
    """Set the global alert router instance."""
    global _alert_router
    _alert_router = router
