"""
PTP (Precision Time Protocol) Monitor

Monitors ptp4l (linuxptp) for IEEE 802.1AS gPTP time synchronization status.
Gracefully handles ptp4l not running by returning available=False.
"""

import asyncio
import logging
import subprocess
import re
from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class PTPStatus:
    """PTP synchronization status"""
    available: bool
    state: Optional[str] = None  # LISTENING, SLAVE, MASTER, PASSIVE, etc.
    offset_ns: Optional[float] = None  # Clock offset in nanoseconds
    mean_path_delay_ns: Optional[float] = None  # Network path delay
    grandmaster_id: Optional[str] = None  # GM clock identity
    grandmaster_priority1: Optional[int] = None
    grandmaster_clock_class: Optional[int] = None
    local_clock_id: Optional[str] = None
    domain: Optional[int] = None
    last_update: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self):
        """Convert to dict for JSON serialization"""
        return asdict(self)


class PTPMonitor:
    """
    Monitors ptp4l daemon for gPTP synchronization status.

    Uses `pmc` (PTP management client) to query ptp4l over its UDS socket.
    Falls back to parsing ptp4l journalctl logs if pmc unavailable.
    """

    def __init__(self):
        self.last_status: Optional[PTPStatus] = None
        self._monitoring = False
        self._monitor_task: Optional[asyncio.Task] = None

    async def get_status(self) -> PTPStatus:
        """
        Get current PTP status.

        Returns PTPStatus with available=False if ptp4l not running or unavailable.
        """
        try:
            # Check if ptp4l service is running
            result = subprocess.run(
                ["systemctl", "is-active", "map2-ptp4l.service"],
                capture_output=True,
                text=True,
                timeout=2
            )

            if result.returncode != 0:
                # Service not active
                return PTPStatus(
                    available=False,
                    error="ptp4l service not running"
                )

            # Try to get status via pmc (PTP management client)
            status = await self._query_pmc()
            if status:
                self.last_status = status
                return status

            # Fallback: parse recent journalctl logs
            status = await self._parse_journal()
            if status:
                self.last_status = status
                return status

            # ptp4l running but no status available yet
            return PTPStatus(
                available=True,
                state="INITIALIZING",
                last_update=datetime.utcnow().isoformat()
            )

        except subprocess.TimeoutExpired:
            logger.warning("Timeout checking ptp4l status")
            return PTPStatus(available=False, error="Status check timeout")

        except Exception as e:
            logger.error(f"Error getting PTP status: {e}")
            return PTPStatus(available=False, error=str(e))

    async def _query_pmc(self) -> Optional[PTPStatus]:
        """Query ptp4l via pmc (PTP management client)"""
        try:
            # Check if pmc is available
            import shutil
            if not shutil.which("pmc"):
                logger.debug("pmc not found")
                return None

            # Query current dataset (includes offset, GM, etc.)
            proc = await asyncio.create_subprocess_exec(
                "pmc", "-u", "-b", "0",
                "GET CURRENT_DATA_SET",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=2.0)

            if proc.returncode != 0:
                logger.debug(f"pmc failed: {stderr.decode()}")
                return None

            output = stdout.decode()

            # Parse pmc output
            # Example:
            #   CURRENT_DATA_SET
            #     offsetFromMaster     -123
            #     meanPathDelay        456
            #     stepsRemoved         1

            offset_match = re.search(r'offsetFromMaster\s+(-?\d+)', output)
            delay_match = re.search(r'meanPathDelay\s+(-?\d+)', output)
            steps_match = re.search(r'stepsRemoved\s+(\d+)', output)

            offset_ns = float(offset_match.group(1)) if offset_match else None
            delay_ns = float(delay_match.group(1)) if delay_match else None
            steps_removed = int(steps_match.group(1)) if steps_match else None

            # Determine state based on steps removed
            if steps_removed is not None:
                if steps_removed == 0:
                    state = "MASTER"
                elif steps_removed == 1:
                    state = "SLAVE"
                else:
                    state = f"SLAVE (steps={steps_removed})"
            else:
                state = "UNKNOWN"

            # Get parent dataset for GM info
            proc2 = await asyncio.create_subprocess_exec(
                "pmc", "-u", "-b", "0",
                "GET PARENT_DATA_SET",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout2, _ = await asyncio.wait_for(proc2.communicate(), timeout=2.0)
            output2 = stdout2.decode()

            # Parse GM identity
            gm_match = re.search(r'grandmasterIdentity\s+([0-9a-f.]+)', output2)
            gm_priority_match = re.search(r'grandmasterPriority1\s+(\d+)', output2)
            gm_class_match = re.search(r'grandmasterClockClass\s+(\d+)', output2)

            gm_id = gm_match.group(1) if gm_match else None
            gm_priority = int(gm_priority_match.group(1)) if gm_priority_match else None
            gm_class = int(gm_class_match.group(1)) if gm_class_match else None

            return PTPStatus(
                available=True,
                state=state,
                offset_ns=offset_ns,
                mean_path_delay_ns=delay_ns,
                grandmaster_id=gm_id,
                grandmaster_priority1=gm_priority,
                grandmaster_clock_class=gm_class,
                last_update=datetime.utcnow().isoformat()
            )

        except asyncio.TimeoutError:
            logger.debug("pmc query timeout")
            return None
        except Exception as e:
            logger.debug(f"pmc query failed: {e}")
            return None

    async def _parse_journal(self) -> Optional[PTPStatus]:
        """Fallback: parse recent ptp4l journal logs"""
        try:
            proc = await asyncio.create_subprocess_exec(
                "journalctl", "-u", "map2-ptp4l.service",
                "-n", "50", "--no-pager",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=2.0)
            output = stdout.decode()

            # Look for state changes: "port 1: LISTENING to SLAVE on MASTER_CLOCK_SELECTED"
            state_match = re.search(r'port \d+: \w+ to (\w+)', output)
            state = state_match.group(1) if state_match else None

            # Look for offset: "master offset        -123 s2 freq  +12345 path delay       456"
            offset_match = re.search(r'master offset\s+(-?\d+)', output)
            delay_match = re.search(r'path delay\s+(-?\d+)', output)

            offset_ns = float(offset_match.group(1)) if offset_match else None
            delay_ns = float(delay_match.group(1)) if delay_match else None

            if state or offset_ns is not None:
                return PTPStatus(
                    available=True,
                    state=state or "UNKNOWN",
                    offset_ns=offset_ns,
                    mean_path_delay_ns=delay_ns,
                    last_update=datetime.utcnow().isoformat()
                )

            return None

        except Exception as e:
            logger.debug(f"Journal parsing failed: {e}")
            return None

    async def start_monitoring(self, interval_seconds: float = 1.0):
        """Start periodic monitoring (for health aggregator integration)"""
        if self._monitoring:
            logger.warning("PTP monitoring already started")
            return

        self._monitoring = True

        async def monitor_loop():
            while self._monitoring:
                try:
                    await self.get_status()
                    await asyncio.sleep(interval_seconds)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"PTP monitor loop error: {e}")
                    await asyncio.sleep(interval_seconds)

        self._monitor_task = asyncio.create_task(monitor_loop())
        logger.info(f"PTP monitoring started (interval={interval_seconds}s)")

    async def stop_monitoring(self):
        """Stop periodic monitoring"""
        if not self._monitoring:
            return

        self._monitoring = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

        logger.info("PTP monitoring stopped")


# Singleton instance
_ptp_monitor: Optional[PTPMonitor] = None


def get_ptp_monitor() -> PTPMonitor:
    """Get singleton PTP monitor instance"""
    global _ptp_monitor
    if _ptp_monitor is None:
        _ptp_monitor = PTPMonitor()
    return _ptp_monitor
