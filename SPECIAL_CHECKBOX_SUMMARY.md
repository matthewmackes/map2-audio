# Special Checkbox Implementation - Complete Plan Summary

## Overview Documents

This implementation is documented across two files:

1. **[SPECIAL_CHECKBOX_PLAN.md](SPECIAL_CHECKBOX_PLAN.md)** - Core implementation plan
2. **[SPECIAL_CHECKBOX_CLUSTER_ADDENDUM.md](SPECIAL_CHECKBOX_CLUSTER_ADDENDUM.md)** - Cluster replication details

---

## Quick Reference

### What Gets Replicated Across Cluster?

All Special settings changes replicate to every node:
- ✅ Checkbox enabled/disabled state
- ✅ Hidden plugins list (which native plugins to hide)
- ✅ Advanced Menu location preference

### How Replication Works

1. **Raft Consensus** - Leader-based log replication
2. **State Machine** - All nodes apply committed changes
3. **WebSocket Sync** - Real-time UI updates across cluster
4. **Automatic Catchup** - New/rejoining nodes get current state

### Key Guarantees

- **Strong Consistency:** All nodes have identical settings
- **Fault Tolerance:** Cluster survives node failures (with quorum)
- **Atomic Updates:** Settings change on all nodes or none
- **Ordered Updates:** Changes applied in same order everywhere

---

## Implementation Phases

### Phase 1-2: Backend (Standalone + Cluster)
- Create database model with cluster metadata
- Add password authentication
- Implement settings API endpoints
- Integrate with Raft consensus
- Add log replication for settings
- Implement state machine application

### Phase 3-4: Frontend (Dialogs + State)
- Build password dialog
- Build settings configuration dialog
- Create `useSpecialSettings()` hook
- Add WebSocket listener for cluster sync

### Phase 5-6: Frontend (Integration + Filtering)
- Update AboutPage with Special checkbox
- Move Advanced Menu to AppShell top nav
- Make menu conditional on Special state
- Implement plugin filtering in GridFlowPage

### Phase 7-8: Testing
- Standalone mode testing
- Cluster replication testing
- Network partition scenarios
- Node join/leave scenarios

---

## Files Created/Modified

### Backend
- **NEW** `app/routes/auth.py`
- **NEW** `app/routes/special_settings.py`
- **MODIFY** `app/models.py` or `app/database.py`
- **MODIFY** `app/services/cluster/raft_consensus.py`
- **MODIFY** `app/main.py`

### Frontend
- **NEW** `web/src/app/components/PasswordDialog.tsx`
- **NEW** `web/src/app/components/SpecialSettingsDialog.tsx`
- **NEW** `web/src/app/hooks/useSpecialSettings.tsx`
- **MODIFY** `web/src/app/pages/AboutPage.tsx`
- **MODIFY** `web/src/app/layout/AppShell.tsx`
- **MODIFY** `web/src/app/pages/GridFlowPage.tsx`

---

## User Experience Flow

```
1. User navigates to About page
2. Clicks "Special" checkbox
3. Password dialog appears → enters "backdoor" password
4. Settings dialog opens:
   - See list of all native plugins
   - Toggle visibility for each plugin
   - Choose Advanced Menu location
5. Click Save
6. Settings replicate across cluster
7. Advanced Menu appears in top nav (if enabled)
8. Hidden plugins disappear from Grid plugin chooser
9. All browsers on all nodes see same state
```

---

## Cluster Behavior

### Single Node (Standalone)
- Settings stored locally only
- No replication
- Immediate persistence

### Multi-Node Cluster
- Settings replicate via Raft consensus
- Leader accepts write requests
- Followers redirect to leader
- Majority quorum required for commit
- All nodes apply committed settings
- WebSocket notifies all connected clients

### Network Partition
- Majority partition continues accepting changes
- Minority partition enters read-only mode
- Partition heals → minority catches up
- Last-write-wins conflict resolution

---

## Testing Checklist

### Standalone
- [ ] Password authentication works
- [ ] Settings save and persist across reboots
- [ ] Advanced Menu shows/hides correctly
- [ ] Plugins filter correctly
- [ ] Menu location respected

### Cluster (2+ nodes)
- [ ] Settings replicate to all nodes
- [ ] All nodes show same menu state
- [ ] All nodes filter same plugins
- [ ] New node joins and syncs settings
- [ ] Node restart preserves settings
- [ ] Leader failure → new leader elected → settings persist
- [ ] Network partition → minority blocks → partition heals → sync works

---

## Success Criteria

✅ Password-protected Special checkbox on About page
✅ Settings dialog lists all native plugins dynamically
✅ Can hide/show individual plugins
✅ Can configure Advanced Menu location
✅ Advanced Menu appears ONLY when Special checked
✅ Hidden plugins excluded from Grid chooser
✅ Settings persist across browser reloads
✅ Settings persist across system reboots
✅ **CLUSTER:** Settings replicate to all nodes
✅ **CLUSTER:** All nodes synchronized within 2 seconds
✅ **CLUSTER:** New nodes receive current settings
✅ **CLUSTER:** Partition tolerance maintained

---

## Ready for Implementation

All planning complete. Proceed with Phase 1 (Backend Standalone) when approved.

**Estimated Total Effort:** 5-7 days
- Backend: 3 days
- Frontend: 2 days  
- Testing: 2 days
