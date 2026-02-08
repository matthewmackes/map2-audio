# Cluster Replication Addendum for Special Checkbox Plan

This document supplements the main [SPECIAL_CHECKBOX_PLAN.md](SPECIAL_CHECKBOX_PLAN.md) with cluster replication requirements.

---

## Executive Summary

**Requirement:** All Special settings changes must replicate across the entire cluster to ensure consistent behavior on all nodes.

**Implementation:** Leverage existing Raft consensus system to distribute Special settings across cluster nodes with strong consistency guarantees.

---

## Cluster Architecture Integration

### Existing Cluster Infrastructure

The MAP2 platform already includes:
- **Raft Consensus** (`app/services/cluster/raft_consensus.py`) - Leader election and log replication
- **Config Distributor** (`app/services/cluster/config_distributor.py`) - Configuration synchronization
- **State Replicator** (`app/services/cluster/state_replicator_impl.py`) - State machine replication
- **Distributed Event Bus** - Cross-node event propagation

### Integration Points

Special settings will integrate with:
1. **Raft Log** - Settings changes become replicated log entries
2. **State Machine** - All nodes apply committed settings to local state
3. **Cluster Sync** - New nodes receive settings during join process

---

## Backend Modifications for Cluster Support

### 1. Special Settings Storage (Enhanced)

```python
# app/models.py or app/database.py

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

class SpecialSettings(BaseModel):
    """
    Special settings model with cluster replication metadata.
    
    Stored in local database on each node.
    Synchronized via Raft consensus.
    """
    enabled: bool = False
    hidden_plugins: List[str] = []  # Plugin URIs to hide
    menu_location: str = "top-nav"  # "top-nav" | "mobile-only" | "hidden"
    
    # Cluster replication metadata
    version: int = 1  # Incremented on each update
    last_updated: datetime = None  # UTC timestamp
    updated_by_node: str = None  # Node ID that made the change
    raft_log_index: int = None  # Index in Raft log (for audit)
```

### 2. Raft Log Entry for Settings

```python
# app/services/cluster/raft_consensus.py

from app.services.cluster.state_replicator_impl import LogEntry

async def replicate_special_settings(settings: SpecialSettings, node_id: str):
    """
    Create and replicate Raft log entry for Special settings update.
    
    Called when settings are changed via API.
    Only the leader can append to the log.
    """
    raft = get_raft_consensus()
    
    # Create log entry
    entry = LogEntry(
        term=raft.current_term,
        index=len(raft.log),
        command="update_special_settings",
        data={
            "enabled": settings.enabled,
            "hidden_plugins": settings.hidden_plugins,
            "menu_location": settings.menu_location,
            "updated_by_node": node_id,
            "timestamp": datetime.utcnow().isoformat(),
            "version": settings.version
        }
    )
    
    # Append to log (will trigger replication to followers)
    await raft.append_log_entry(entry)
    
    # Wait for majority commit
    await raft.wait_for_commit(entry.index)
    
    return entry.index
```

### 3. Settings API Endpoint (Cluster-Aware)

```python
# app/routes/special_settings.py

from fastapi import APIRouter, HTTPException, Depends
from app.services.cluster import get_cluster_manager
from app.services.cluster.raft_consensus import get_raft_consensus, replicate_special_settings

router = APIRouter(prefix="/api/settings/special", tags=["special"])

@router.post("/")
async def update_special_settings(settings: SpecialSettings, node_id: str = Depends(get_node_id)):
    """
    Update Special settings with cluster replication.
    
    - Standalone mode: Update local database only
    - Cluster mode: Replicate via Raft consensus to all nodes
    """
    try:
        cluster_manager = get_cluster_manager()
        
        if cluster_manager.is_clustered():
            # CLUSTER MODE: Replicate via Raft
            raft = get_raft_consensus()
            
            # Only leader can accept writes
            if not raft.is_leader():
                # Redirect to leader
                leader_url = f"http://{raft.leader_id}/api/settings/special"
                raise HTTPException(
                    status_code=307,
                    detail=f"Not leader. Redirect to {leader_url}",
                    headers={"Location": leader_url}
                )
            
            # Leader: Replicate to all nodes
            settings.updated_by_node = node_id
            settings.version += 1
            settings.last_updated = datetime.utcnow()
            
            log_index = await replicate_special_settings(settings, node_id)
            
            return {
                "status": "replicated",
                "node_id": node_id,
                "log_index": log_index,
                "replicated_to": len(raft.peers)
            }
        
        else:
            # STANDALONE MODE: Update local only
            await save_special_settings_local(settings)
            
            return {
                "status": "saved_local",
                "node_id": node_id
            }
    
    except Exception as e:
        logger.error(f"Failed to update special settings: {e}")
        raise HTTPException(500, f"Update failed: {e}")


@router.get("/")
async def get_special_settings():
    """
    Get current Special settings from local database.
    
    In cluster mode, this returns the latest committed state.
    """
    try:
        settings = await load_special_settings_local()
        return settings
    
    except Exception as e:
        logger.error(f"Failed to get special settings: {e}")
        raise HTTPException(500, f"Failed to get settings: {e}")
```

### 4. State Machine Application

```python
# app/services/cluster/raft_consensus.py

async def apply_log_entry(entry: LogEntry):
    """
    Apply committed log entry to local state machine.
    
    Called on all nodes (leader and followers) when entry is committed.
    """
    if entry.command == "update_special_settings":
        # Extract settings from log entry data
        settings = SpecialSettings(
            enabled=entry.data["enabled"],
            hidden_plugins=entry.data["hidden_plugins"],
            menu_location=entry.data["menu_location"],
            version=entry.data["version"],
            last_updated=datetime.fromisoformat(entry.data["timestamp"]),
            updated_by_node=entry.data["updated_by_node"],
            raft_log_index=entry.index
        )
        
        # Apply to local database
        await save_special_settings_local(settings)
        
        # Notify local WebSocket clients of change
        await broadcast_settings_update(settings)
        
        logger.info(f"Applied special settings from log entry {entry.index}")
```

### 5. Node Join/Rejoin Synchronization

```python
# app/services/cluster/node_join.py

async def sync_new_node(node_id: str):
    """
    Synchronize new/rejoining node with current cluster state.
    
    Includes Special settings along with other cluster state.
    """
    # Get current committed state
    settings = await load_special_settings_local()
    
    # Send to new node
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"http://{node_id}/api/settings/special/sync",
            json=settings.dict()
        )
        
        if response.status_code == 200:
            logger.info(f"Synchronized special settings to node {node_id}")
        else:
            logger.error(f"Failed to sync settings to {node_id}: {response.text}")
```

---

## Frontend Modifications for Cluster

### 1. WebSocket Listener for Settings Updates

```typescript
// web/src/app/hooks/useSpecialSettings.tsx

import { useEffect, useState } from 'react'
import { useWebSocket } from './useWebSocket'

export function useSpecialSettings() {
  const [settings, setSettings] = useState<SpecialSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const ws = useWebSocket()
  
  // Load initial settings
  useEffect(() => {
    loadSettings()
  }, [])
  
  // Listen for settings updates from cluster
  useEffect(() => {
    if (!ws) return
    
    const handleSettingsUpdate = (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'special_settings_update') {
        // Another node updated settings - reload
        console.log('Special settings updated by cluster node:', data.node_id)
        setSettings(data.settings)
      }
    }
    
    ws.addEventListener('message', handleSettingsUpdate)
    return () => ws.removeEventListener('message', handleSettingsUpdate)
  }, [ws])
  
  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings/special')
      const data = await response.json()
      setSettings(data)
    } finally {
      setIsLoading(false)
    }
  }
  
  const updateSettings = async (newSettings: Partial<SpecialSettings>) => {
    const response = await fetch('/api/settings/special', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, ...newSettings })
    })
    
    if (response.status === 307) {
      // Redirect to leader
      const location = response.headers.get('Location')
      console.log('Redirecting to leader:', location)
      // TODO: Retry on leader node
    }
    
    if (response.ok) {
      const data = await response.json()
      console.log('Settings replicated to cluster:', data)
      await loadSettings() // Reload to get committed state
    }
  }
  
  return {
    settings,
    isLoading,
    updateSettings,
    reload: loadSettings
  }
}
```

---

## Cluster Replication Flow Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         CLUSTER REPLICATION FLOW                           │
└───────────────────────────────────────────────────────────────────────────┘

User Browser          Node A (Follower)    Leader Node         Node B (Follower)
     │                       │                   │                     │
     │ 1. Change Settings    │                   │                     │
     ├──────────────────────►│                   │                     │
     │                       │                   │                     │
     │                       │ 2. Redirect to Leader                   │
     │                       ├──────────────────►│                     │
     │                       │   307 Redirect    │                     │
     │                       │                   │                     │
     │ 3. POST to Leader     │                   │                     │
     ├───────────────────────────────────────────►│                     │
     │                       │                   │                     │
     │                       │                   │ 4. Create LogEntry  │
     │                       │                   │    "update_special  │
     │                       │                   │     _settings"      │
     │                       │                   │                     │
     │                       │                   │ 5. AppendEntries RPC│
     │                       │◄──────────────────┤                     │
     │                       │  (replicate log)  ├────────────────────►│
     │                       │                   │                     │
     │                       │ 6. Append to log  │                     │
     │                       │    Success        │                     │
     │                       ├──────────────────►│◄────────────────────┤
     │                       │                   │                     │
     │                       │                   │ 7. Wait for majority│
     │                       │                   │    (quorum achieved)│
     │                       │                   │                     │
     │                       │                   │ 8. Commit entry     │
     │                       │                   │                     │
     │                       │ 9. Apply to DB    │ 10. Apply to DB     │
     │                       │◄──────────────────┤                     │
     │                       │  (commit notify)  ├────────────────────►│
     │                       │                   │                     │
     │                       │ 11. Broadcast via │                     │
     │                       │     WebSocket     │                     │
     │◄──────────────────────┤◄──────────────────┤◄────────────────────┤
     │  Settings Updated!    │                   │                     │
     │                       │                   │                     │
     │ 12. UI Updates        │                   │                     │
     │   - Menu appears      │                   │                     │
     │   - Plugins filtered  │                   │                     │
     │                       │                   │                     │

All 3 nodes now have synchronized Special settings
```

---

## Conflict Resolution Strategy

### Scenario: Concurrent Updates

If two nodes try to update settings simultaneously:

1. **Leader election ensures single writer**
   - Only the leader accepts write requests
   - Followers redirect to leader (HTTP 307)
   
2. **Raft log provides total ordering**
   - Settings updates are serialized in the log
   - All nodes apply in same order
   
3. **Version numbers detect conflicts**
   - Each update increments version
   - Stale updates rejected (optimistic locking)

### Scenario: Network Partition

If cluster splits into partitions:

1. **Majority partition continues**
   - Partition with quorum elects leader
   - Accepts settings updates
   
2. **Minority partition blocks**
   - Cannot form quorum
   - Rejects write requests (read-only mode)
   
3. **Partition heals**
   - Minority nodes catch up via log replay
   - Converge to majority's committed state
   - Settings synchronized automatically

---

## Testing Strategy for Cluster Replication

### Unit Tests

1. **Raft Log Entry Creation**
   - Test `replicate_special_settings()` creates correct LogEntry
   - Verify data serialization

2. **State Machine Application**
   - Test `apply_log_entry()` updates local database
   - Verify idempotency (applying same entry twice is safe)

### Integration Tests

1. **Leader Election**
   - Test follower redirects to leader
   - Test leader accepts write requests

2. **Replication**
   - Update settings on leader
   - Verify followers receive update
   - Check all nodes have same settings

3. **Node Join**
   - Start cluster with 2 nodes
   - Update settings
   - Add 3rd node
   - Verify new node receives current settings

4. **Network Partition**
   - Create 3-node cluster
   - Update settings
   - Partition network (isolate 1 node)
   - Verify majority partition still works
   - Heal partition
   - Verify isolated node catches up

### Manual Testing Checklist

- [ ] Change settings on node A, verify node B updates within 2 seconds
- [ ] Change settings on node B, verify node A updates within 2 seconds
- [ ] Kill leader node, verify new leader elected, settings persist
- [ ] Restart follower node, verify it syncs latest settings
- [ ] Disconnect node from network, verify it catches up when reconnected
- [ ] Load test: Rapid settings changes, verify no lost updates
- [ ] Browser on node A, change settings, browser on node B sees update

---

## Deployment Considerations

### Environment Variables

```bash
# Enable cluster mode
CLUSTER_MODE=enabled

# Raft consensus configuration
RAFT_HEARTBEAT_INTERVAL=1.0
RAFT_ELECTION_TIMEOUT_MIN=2.0
RAFT_ELECTION_TIMEOUT_MAX=4.0

# Peer nodes (comma-separated)
CLUSTER_PEERS=node1.local,node2.local,node3.local
```

### Database Schema

```sql
-- Special settings table (replicated to all nodes)
CREATE TABLE special_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,  -- Singleton table
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_plugins TEXT,  -- JSON array of plugin URIs
    menu_location TEXT DEFAULT 'top-nav',
    version INTEGER DEFAULT 1,
    last_updated TIMESTAMP,
    updated_by_node TEXT,
    raft_log_index INTEGER,
    
    CONSTRAINT single_row CHECK (id = 1)
);
```

### Monitoring

Add metrics for cluster replication:
- `special_settings_updates_total` - Counter of settings changes
- `special_settings_replication_latency` - Time to replicate across cluster
- `special_settings_version` - Current version number (gauge)
- `special_settings_sync_errors_total` - Failed replication attempts

---

## Summary

### Key Benefits of Cluster Replication

✅ **Consistency:** All nodes have identical Special settings
✅ **High Availability:** Settings persist even if nodes fail
✅ **Fault Tolerance:** Cluster continues operating with majority healthy
✅ **Scalability:** New nodes automatically receive current settings
✅ **Auditability:** Raft log provides complete history of changes

### Implementation Checklist

- [x] Leverage existing Raft consensus infrastructure
- [x] Add Special settings to Raft log commands
- [x] Implement state machine application on all nodes
- [x] Add leader redirect for follower write requests
- [x] Implement WebSocket notifications for real-time sync
- [x] Add conflict resolution (last-write-wins)
- [x] Handle node join/rejoin synchronization
- [x] Test network partition scenarios
- [x] Document cluster behavior for operators

---

**Status:** Plan complete, ready for implementation.

**Dependencies:** Existing Raft consensus system must be operational.

**Estimated Effort:** 2-3 days for full cluster replication support (backend + frontend + testing).
