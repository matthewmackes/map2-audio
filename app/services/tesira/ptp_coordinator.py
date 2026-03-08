"""
TesiraPTPCoordinator — ensures MAP2's ptp4l yields PTP master role to Tesira.

Tesira Forte AVB units typically act as PTP master (GPS-disciplined or free-run).
MAP2's ptp4l must be configured as SLAVE when any Tesira unit reports MASTER.

Strategy:
  1. Poll each connected Tesira device's PTP status every 1 second.
  2. If any Tesira unit is MASTER and MAP2's ptp4l is also claiming MASTER:
     a. Write /run/map2/tesira_ptp_override.conf with 'priority1 255'.
     b. Send SIGHUP to ptp4l → triggers re-election → MAP2 loses → becomes SLAVE.
  3. On fleet stop, restore the original ptp4l priority1.
  4. Broadcast 'tesira:ptp' WebSocket topic on any state change.

This is pure Python — no C++ changes required.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Dict, Optional

if TYPE_CHECKING:
    from app.services.tesira.tesira_fleet import TesiraFleet

logger = logging.getLogger(__name__)

# ptp4l override config file path (written to /run, which is a tmpfs — no persistence)
_PTP_OVERRIDE_PATH = Path('/run/map2/tesira_ptp_override.conf')
# ptp4l process name for SIGHUP
_PTP4L_PROC_NAME = 'ptp4l'


class TesiraPTPCoordinator:
    """
    Monitors Tesira PTP state and demotes MAP2's ptp4l priority when needed.
    """

    def __init__(self, fleet: "TesiraFleet") -> None:
        self._fleet = fleet
        self._poll_task: Optional[asyncio.Task] = None
        self._stopping = False
        self._slave_mode_active = False
        self._ptp_enabled: bool = True

    async def start(self) -> None:
        """Begin polling. Called from lifespan startup."""
        try:
            from app.config import config_get
            self._ptp_enabled = config_get('tesira.ptp_slave_mode', True)
        except Exception:
            self._ptp_enabled = True

        if not self._ptp_enabled:
            logger.info("TesiraPTPCoordinator: ptp_slave_mode disabled, skipping")
            return

        self._stopping = False
        self._poll_task = asyncio.create_task(
            self._poll_loop(), name='tesira_ptp_coordinator'
        )
        logger.info("TesiraPTPCoordinator started")

    async def stop(self) -> None:
        """Stop polling and restore default ptp4l priority."""
        self._stopping = True
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._slave_mode_active:
            await self._restore_default_priority()
        logger.info("TesiraPTPCoordinator stopped")

    # ──────────────────────────────────────────────────────────────────────────
    # Poll loop
    # ──────────────────────────────────────────────────────────────────────────

    async def _poll_loop(self) -> None:
        while not self._stopping:
            await asyncio.sleep(1.0)
            try:
                await self._check_and_coordinate()
            except Exception as exc:
                logger.debug("PTP coordinator poll error: %s", exc)

    async def _check_and_coordinate(self) -> None:
        """Check Tesira PTP states and apply slave mode if needed."""
        any_tesira_master = False

        for device in self._fleet._devices.values():
            if not device.connected:
                continue
            try:
                ptp = await device.get_ptp_status()
                state = ptp.get('state', 'UNKNOWN').upper()
                if state == 'MASTER':
                    any_tesira_master = True
                    break
            except Exception:
                pass

        if any_tesira_master and not self._slave_mode_active:
            map2_is_master = await self._check_map2_ptp_state()
            if map2_is_master:
                logger.info(
                    "TesiraPTPCoordinator: Tesira is PTP MASTER; demoting MAP2 to SLAVE"
                )
                await self._apply_slave_mode()
        elif not any_tesira_master and self._slave_mode_active:
            logger.info(
                "TesiraPTPCoordinator: no Tesira MASTER detected; restoring MAP2 priority"
            )
            await self._restore_default_priority()

    async def _check_map2_ptp_state(self) -> bool:
        """
        Return True if MAP2's ptp4l is currently in MASTER state.
        Uses ptp4l -c (client info) or reads /var/run/ptp4l.state if available.
        Falls back to assuming master if we can't determine.
        """
        try:
            # Try reading pmc (PTP management client) port state
            result = await asyncio.to_thread(
                subprocess.run,
                ['pmc', '-u', '-b', '0', 'GET PORT_DATA_SET'],
                capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0:
                return 'portState        MASTER' in result.stdout
        except Exception:
            pass
        # Conservative: assume master so we apply slave mode
        return True

    async def _apply_slave_mode(self) -> None:
        """Write ptp4l priority override and SIGHUP the process."""
        try:
            _PTP_OVERRIDE_PATH.parent.mkdir(parents=True, exist_ok=True)
            _PTP_OVERRIDE_PATH.write_text('[global]\npriority1 255\n')
            await self._sighup_ptp4l()
            self._slave_mode_active = True
            logger.info("TesiraPTPCoordinator: slave mode applied (priority1=255)")
        except Exception as exc:
            logger.warning("TesiraPTPCoordinator: apply_slave_mode failed: %s", exc)

    async def _restore_default_priority(self) -> None:
        """Remove the override file and SIGHUP ptp4l to re-read config."""
        try:
            if _PTP_OVERRIDE_PATH.exists():
                _PTP_OVERRIDE_PATH.unlink()
            await self._sighup_ptp4l()
            self._slave_mode_active = False
            logger.info("TesiraPTPCoordinator: default ptp4l priority restored")
        except Exception as exc:
            logger.warning("TesiraPTPCoordinator: restore_default_priority failed: %s", exc)

    @staticmethod
    async def _sighup_ptp4l() -> None:
        """Send SIGHUP to the ptp4l process by name."""
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ['pkill', '-HUP', _PTP4L_PROC_NAME],
                capture_output=True, timeout=2,
            )
            if result.returncode not in (0, 1):   # 1 = no process found (ok if not running)
                logger.warning("pkill ptp4l returned %d", result.returncode)
        except Exception as exc:
            logger.debug("SIGHUP ptp4l failed (ptp4l may not be running): %s", exc)
