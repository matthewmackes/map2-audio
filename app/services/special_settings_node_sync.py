"""
Special Settings Node Join Synchronization

Handles synchronization of special settings when new nodes join the cluster.
New nodes receive current committed settings during join process.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def sync_special_settings_to_node(
    node_id: str,
    node_url: str,
    raft_consensus
) -> bool:
    """
    Synchronize current special settings to a newly joined node.
    
    Called when a node joins the cluster to ensure it has current state.
    
    Args:
        node_id: ID of the node joining
        node_url: URL of the node to sync to
        raft_consensus: Raft consensus instance with current state
    
    Returns:
        True if successful, False otherwise
    """
    try:
        # Get current special settings from state machine
        current_state = raft_consensus.state_machine.state.get("special_settings", {})
        
        if not current_state:
            logger.debug(f"No special settings to sync to {node_id}")
            return True
        
        # Send sync request to node
        import httpx
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{node_url}/api/settings/special/sync",
                json=current_state,
                headers={"X-Sync-Node": "cluster-leader"}
            )
            
            if response.status_code == 200:
                logger.info(f"Synchronized special settings to new node {node_id}")
                return True
            else:
                logger.warning(
                    f"Failed to sync special settings to {node_id}: "
                    f"HTTP {response.status_code}"
                )
                return False
    
    except Exception as e:
        logger.error(f"Failed to sync special settings to {node_id}: {e}")
        return False


async def handle_special_settings_sync(data: dict) -> bool:
    """
    Handle incoming special settings sync from leader.
    
    Called on follower nodes when they receive settings from leader during join.
    
    Args:
        data: Special settings data to apply
    
    Returns:
        True if successfully applied
    """
    try:
        from app.database import get_session
        from app.services.special_settings_raft import SpecialSettingsStateManager
        
        state_manager = SpecialSettingsStateManager(get_session)
        success = await state_manager.apply_entry(data)
        
        if success:
            logger.info(
                f"Applied synced special settings from leader "
                f"(version={data.get('version')})"
            )
        
        return success
    
    except Exception as e:
        logger.error(f"Failed to apply synced special settings: {e}")
        return False
