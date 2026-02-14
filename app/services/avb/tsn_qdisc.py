"""
TSN Qdisc (Traffic Shaping) Manager

Manages Traffic Control (tc) qdiscs for TSN-compliant network traffic shaping.
Provides safe wrappers around tc commands with graceful error handling.
"""

import asyncio
import logging
import subprocess
import re
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


@dataclass
class TsnStatus:
    """TSN qdisc configuration status"""
    available: bool
    interface: Optional[str] = None
    mqprio_configured: bool = False
    cbs_configured: bool = False
    etf_configured: bool = False
    vlan_configured: bool = False
    num_traffic_classes: Optional[int] = None
    cbs_idleslope: Optional[int] = None  # bits/sec
    cbs_sendslope: Optional[int] = None  # bits/sec
    queue_stats: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def to_dict(self):
        """Convert to dict for JSON serialization"""
        return asdict(self)


@dataclass
class QdiscStats:
    """Queue discipline statistics"""
    sent_bytes: int = 0
    sent_packets: int = 0
    dropped: int = 0
    overlimits: int = 0
    requeues: int = 0
    backlog_bytes: int = 0
    backlog_packets: int = 0


class TsnQdiscManager:
    """
    Manages TSN qdiscs (mqprio, CBS, ETF) for AVB audio traffic.

    All methods are safe to call - failures return TsnStatus(available=False)
    rather than raising exceptions.
    """

    def __init__(self):
        self.last_status: Optional[TsnStatus] = None

    async def get_status(self, interface: Optional[str] = None) -> TsnStatus:
        """
        Get TSN qdisc configuration status for an interface.

        Args:
            interface: Network interface (e.g., 'enp3s0'). If None, reads from config.

        Returns:
            TsnStatus with qdisc information or available=False
        """
        try:
            # Get interface from config if not provided
            if not interface:
                from app.config import config_get
                interface = config_get("avb.interface", "")

            if not interface:
                return TsnStatus(
                    available=False,
                    error="No interface configured"
                )

            # Check if interface exists
            import os
            if not os.path.exists(f"/sys/class/net/{interface}"):
                return TsnStatus(
                    available=False,
                    interface=interface,
                    error=f"Interface {interface} does not exist"
                )

            # Query qdiscs on the interface
            proc = await asyncio.create_subprocess_exec(
                "tc", "qdisc", "show", "dev", interface,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=2.0)

            if proc.returncode != 0:
                return TsnStatus(
                    available=False,
                    interface=interface,
                    error=f"tc command failed: {stderr.decode()}"
                )

            output = stdout.decode()

            # Parse qdisc output
            mqprio_configured = "mqprio" in output
            cbs_configured = "cbs" in output
            etf_configured = "etf" in output

            # Extract CBS parameters if configured
            cbs_idleslope = None
            cbs_sendslope = None
            if cbs_configured:
                idleslope_match = re.search(r'idleslope\s+(\d+)', output)
                sendslope_match = re.search(r'sendslope\s+(-?\d+)', output)
                if idleslope_match:
                    cbs_idleslope = int(idleslope_match.group(1))
                if sendslope_match:
                    cbs_sendslope = int(sendslope_match.group(1))

            # Extract number of traffic classes from mqprio
            num_tc = None
            if mqprio_configured:
                tc_match = re.search(r'tc\s+(\d+)', output)
                if tc_match:
                    num_tc = int(tc_match.group(1))

            # Check for VLAN interface
            vlan_interface = f"{interface}.2"
            vlan_configured = os.path.exists(f"/sys/class/net/{vlan_interface}")

            # Get queue statistics
            queue_stats = await self._get_queue_stats(interface)

            status = TsnStatus(
                available=True,
                interface=interface,
                mqprio_configured=mqprio_configured,
                cbs_configured=cbs_configured,
                etf_configured=etf_configured,
                vlan_configured=vlan_configured,
                num_traffic_classes=num_tc,
                cbs_idleslope=cbs_idleslope,
                cbs_sendslope=cbs_sendslope,
                queue_stats=queue_stats
            )

            self.last_status = status
            return status

        except asyncio.TimeoutError:
            logger.warning("Timeout querying TSN qdisc status")
            return TsnStatus(available=False, error="Query timeout")

        except Exception as e:
            logger.error(f"Error getting TSN qdisc status: {e}")
            return TsnStatus(available=False, error=str(e))

    async def _get_queue_stats(self, interface: str) -> Dict[str, QdiscStats]:
        """
        Get detailed queue statistics for the interface.

        Returns:
            Dict mapping qdisc handle to QdiscStats
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "tc", "-s", "qdisc", "show", "dev", interface,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=2.0)

            if proc.returncode != 0:
                return {}

            output = stdout.decode()
            stats_dict = {}

            # Parse tc -s output
            # Example:
            # qdisc mqprio 100: root
            #  Sent 12345 bytes 123 pkt (dropped 0, overlimits 0 requeues 0)
            #  backlog 0b 0p requeues 0

            current_qdisc = None
            for line in output.split('\n'):
                line = line.strip()

                # Match qdisc line
                qdisc_match = re.match(r'qdisc\s+(\w+)\s+([0-9a-f]+):', line)
                if qdisc_match:
                    current_qdisc = f"{qdisc_match.group(1)}_{qdisc_match.group(2)}"
                    stats_dict[current_qdisc] = QdiscStats()
                    continue

                if current_qdisc and "Sent" in line:
                    # Parse: Sent 12345 bytes 123 pkt (dropped 0, overlimits 0 requeues 0)
                    sent_match = re.search(r'Sent\s+(\d+)\s+bytes\s+(\d+)\s+pkt', line)
                    dropped_match = re.search(r'dropped\s+(\d+)', line)
                    overlimits_match = re.search(r'overlimits\s+(\d+)', line)
                    requeues_match = re.search(r'requeues\s+(\d+)', line)

                    if sent_match:
                        stats_dict[current_qdisc].sent_bytes = int(sent_match.group(1))
                        stats_dict[current_qdisc].sent_packets = int(sent_match.group(2))
                    if dropped_match:
                        stats_dict[current_qdisc].dropped = int(dropped_match.group(1))
                    if overlimits_match:
                        stats_dict[current_qdisc].overlimits = int(overlimits_match.group(1))
                    if requeues_match:
                        stats_dict[current_qdisc].requeues = int(requeues_match.group(1))

                if current_qdisc and "backlog" in line:
                    # Parse: backlog 0b 0p requeues 0
                    backlog_match = re.search(r'backlog\s+(\d+)b\s+(\d+)p', line)
                    if backlog_match:
                        stats_dict[current_qdisc].backlog_bytes = int(backlog_match.group(1))
                        stats_dict[current_qdisc].backlog_packets = int(backlog_match.group(2))

            # Convert QdiscStats to dicts
            return {k: asdict(v) for k, v in stats_dict.items()}

        except Exception as e:
            logger.debug(f"Error getting queue stats: {e}")
            return {}

    @staticmethod
    def calculate_cbs_parameters(
        sample_rate: int = 48000,
        channels: int = 2,
        bit_depth: int = 24,
        link_speed_mbps: int = 1000
    ) -> Dict[str, int]:
        """
        Calculate CBS (Credit-Based Shaper) parameters for AVB audio.

        Args:
            sample_rate: Audio sample rate in Hz
            channels: Number of audio channels
            bit_depth: Bits per sample
            link_speed_mbps: Link speed in Mbps (typically 1000)

        Returns:
            Dict with idleslope, sendslope, hicredit, locredit in appropriate units
        """
        # Calculate raw audio bandwidth
        # bandwidth = sample_rate * channels * (bit_depth / 8) bytes/sec
        audio_bandwidth_bytes_per_sec = sample_rate * channels * (bit_depth // 8)

        # Add AVB overhead (Ethernet + AVTP headers ~20%)
        overhead_factor = 1.2
        total_bandwidth_bytes_per_sec = int(audio_bandwidth_bytes_per_sec * overhead_factor)

        # Convert to bits/sec
        audio_bandwidth_bps = total_bandwidth_bytes_per_sec * 8

        # Allocate bandwidth with safety margin (2x for headroom)
        idleslope = audio_bandwidth_bps * 2

        # Ensure we don't exceed link capacity
        link_speed_bps = link_speed_mbps * 1000000
        if idleslope > link_speed_bps * 0.75:  # Max 75% for Class A
            idleslope = int(link_speed_bps * 0.75)

        # sendslope: negative of remaining bandwidth
        sendslope = -(link_speed_bps - idleslope)

        # hicredit/locredit: based on MTU
        mtu = 1522  # 1500 + Ethernet overhead
        hicredit = (idleslope * mtu * 8) // link_speed_bps
        locredit = (sendslope * mtu * 8) // link_speed_bps

        return {
            "idleslope": idleslope,
            "sendslope": sendslope,
            "hicredit": hicredit,
            "locredit": locredit,
            "estimated_bandwidth_mbps": round(audio_bandwidth_bps / 1000000, 2)
        }


# Singleton instance
_tsn_qdisc_manager: Optional[TsnQdiscManager] = None


def get_tsn_qdisc_manager() -> TsnQdiscManager:
    """Get singleton TSN qdisc manager instance"""
    global _tsn_qdisc_manager
    if _tsn_qdisc_manager is None:
        _tsn_qdisc_manager = TsnQdiscManager()
    return _tsn_qdisc_manager
