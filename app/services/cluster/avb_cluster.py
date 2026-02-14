"""
AVB/TSN Integration with Cluster Services

Provides functions to populate AVB-specific data in cluster node metadata.
Only runs when avb.enabled=true. Gracefully returns empty data when unavailable.
"""

import logging
from typing import Dict, List, Optional

from app.config import config_get
from app.services.avb import is_avb_available

logger = logging.getLogger(__name__)


async def get_local_avb_metadata() -> Dict:
    """
    Get AVB metadata for the local node.

    Returns:
        Dictionary with AVB fields for ClusterNodeMetadata:
        - avb_enabled: bool
        - avb_interface: Optional[str]
        - avb_ptp_synced: bool
        - avb_ptp_offset_ns: Optional[float]
        - avb_tsn_configured: bool
        - avb_streams: List[Dict]

    Returns empty/false values when AVB unavailable.
    """
    # Default empty metadata
    metadata = {
        "avb_enabled": False,
        "avb_interface": None,
        "avb_ptp_synced": False,
        "avb_ptp_offset_ns": None,
        "avb_tsn_configured": False,
        "avb_streams": []
    }

    # Check if AVB is enabled
    if not config_get("avb.enabled", False):
        return metadata

    # Update enabled flag
    metadata["avb_enabled"] = True
    metadata["avb_interface"] = config_get("avb.interface", None)

    # Check if AVB is actually available (hardware + software)
    if not is_avb_available():
        return metadata

    try:
        # Get PTP status
        from app.services.avb.ptp_monitor import get_ptp_monitor

        ptp_monitor = get_ptp_monitor()
        ptp_status = await ptp_monitor.get_status()

        if ptp_status and ptp_status.available:
            metadata["avb_ptp_synced"] = True
            metadata["avb_ptp_offset_ns"] = ptp_status.offset_ns

    except Exception as e:
        logger.debug(f"Failed to get PTP status for cluster metadata: {e}")

    try:
        # Get TSN status
        from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager

        tsn_manager = get_tsn_qdisc_manager()
        tsn_status = await tsn_manager.get_status()

        if tsn_status and tsn_status.available:
            metadata["avb_tsn_configured"] = True

    except Exception as e:
        logger.debug(f"Failed to get TSN status for cluster metadata: {e}")

    try:
        # Get AVB streams
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()
        if avb_service.is_available():
            streams = avb_service.get_all_streams()
            # Convert to simplified format for cluster metadata
            metadata["avb_streams"] = [
                {
                    "stream_id": s.get("stream_id"),
                    "direction": s.get("direction"),
                    "state": s.get("state"),
                    "channels": (s.get("config") or {}).get("channels", s.get("channels")),
                    "sample_rate": (s.get("config") or {}).get("sample_rate", s.get("sample_rate"))
                }
                for s in streams
            ]

    except Exception as e:
        logger.debug(f"Failed to get AVB streams for cluster metadata: {e}")

    return metadata


async def get_remote_avb_metadata(node_url: str) -> Dict:
    """
    Get AVB metadata from a remote node.

    Args:
        node_url: Base URL of the remote node (e.g., "http://192.168.1.100:8000")

    Returns:
        Dictionary with AVB fields for ClusterNodeMetadata.
        Returns empty/false values on error or when AVB unavailable.
    """
    # Default empty metadata
    metadata = {
        "avb_enabled": False,
        "avb_interface": None,
        "avb_ptp_synced": False,
        "avb_ptp_offset_ns": None,
        "avb_tsn_configured": False,
        "avb_streams": []
    }

    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            # Get AVB status
            response = await client.get(f"{node_url}/api/avb/status")

            if response.status_code != 200:
                return metadata

            avb_status = response.json()

            if not avb_status.get("enabled"):
                return metadata

            # Populate metadata
            metadata["avb_enabled"] = avb_status.get("enabled", False)
            metadata["avb_interface"] = avb_status.get("interface")

            # Parse PTP status
            ptp = avb_status.get("ptp", {})
            if ptp.get("available"):
                metadata["avb_ptp_synced"] = True
                metadata["avb_ptp_offset_ns"] = ptp.get("offset_ns")

            # Get stream list
            streams_response = await client.get(f"{node_url}/api/avb/streams")
            if streams_response.status_code == 200:
                streams_data = streams_response.json()
                if streams_data.get("available"):
                    metadata["avb_streams"] = [
                        {
                            "stream_id": s.get("stream_id"),
                            "direction": s.get("direction"),
                            "state": s.get("state"),
                            "channels": s.get("channels"),
                            "sample_rate": s.get("sample_rate")
                        }
                        for s in streams_data.get("streams", [])
                    ]

            # Get TSN status
            tsn_response = await client.get(f"{node_url}/api/avb/tsn/status")
            if tsn_response.status_code == 200:
                tsn_data = tsn_response.json()
                metadata["avb_tsn_configured"] = tsn_data.get("available", False)

    except Exception as e:
        logger.debug(f"Failed to get AVB metadata from {node_url}: {e}")

    return metadata


def get_avb_cluster_summary(nodes: List) -> Dict:
    """
    Get AVB summary across the cluster.

    Args:
        nodes: List of ClusterNode objects

    Returns:
        Dictionary with cluster-wide AVB statistics:
        - total_nodes_with_avb: int
        - nodes_ptp_synced: int
        - total_talker_streams: int
        - total_listener_streams: int
        - nodes_with_tsn: int
    """
    summary = {
        "total_nodes_with_avb": 0,
        "nodes_ptp_synced": 0,
        "total_talker_streams": 0,
        "total_listener_streams": 0,
        "nodes_with_tsn": 0
    }

    for node in nodes:
        if not hasattr(node, "metadata") or not node.metadata:
            continue

        metadata = node.metadata

        # Count AVB-enabled nodes
        if getattr(metadata, "avb_enabled", False):
            summary["total_nodes_with_avb"] += 1

        # Count PTP-synced nodes
        if getattr(metadata, "avb_ptp_synced", False):
            summary["nodes_ptp_synced"] += 1

        # Count TSN-configured nodes
        if getattr(metadata, "avb_tsn_configured", False):
            summary["nodes_with_tsn"] += 1

        # Count streams
        streams = getattr(metadata, "avb_streams", [])
        for stream in streams:
            direction = stream.get("direction", "")
            if direction == "talker":
                summary["total_talker_streams"] += 1
            elif direction == "listener":
                summary["total_listener_streams"] += 1

    return summary
