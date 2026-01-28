# Plugin Deletion Bug Fix - Complete Solution

## Problem
When deleting a plugin from a flow, it returns moments later (even after page refresh), indicating the deletion isn't persisting to the database.

## Root Causes (Multiple Layers)

### 1. **SQLAlchemy Session Configuration** (PRIMARY CAUSE)
- **File**: `app/database.py` line 92
- **Issue**: `expire_on_commit=False` in async_sessionmaker
- **Impact**: After commit, deleted objects remained attached to session with stale state, preventing fresh queries from seeing the deletion
- **Fix**: Changed to `expire_on_commit=True` to force object expiration after commit

### 2. **Frontend Polling Race Condition**
- **File**: `web/src/app/pages/ChainFlowPage.tsx` lines 1237-1248  
- **Issue**: Automatic polling with `refetchInterval: 3000` on chains query would overwrite deletions with stale data
- **Fix**: Removed automatic polling, rely only on mutation-triggered refetches

### 3. **Mutation-Level Cache Management**
- **File**: `web/src/app/pages/ChainFlowPage.tsx` lines 1474-1509
- **Issue**: Cache invalidation wasn't aggressive enough; stale data could linger in query client
- **Fix**: Changed from `invalidateQueries` to `removeQueries` for complete cache wipe before refetch

### 4. **Server-Side Deletion Verification**
- **File**: `app/routes/chains.py` lines 179-290
- **Issue**: No confirmation that deletion actually persisted before returning success
- **Fix**: Added multi-step verification with fresh sessions and WAL checkpoint

### 5. **Service-Layer Deletion Method**
- **File**: `app/services/chain_service.py` lines 603-660
- **Issue**: Used object iteration with session.delete() instead of atomic delete statement
- **Fix**: Changed to use SQLAlchemy `delete()` statement for more atomic operation

## Changes Made

### Backend Changes

#### 1. Database Configuration
```python
# app/database.py line 92
_async_session_maker = async_sessionmaker(_async_engine, expire_on_commit=True)
```
**Why**: Ensures objects are expired after each commit, forcing fresh queries

#### 2. Deletion Service Method
```python
# app/services/chain_service.py 
# Uses: from sqlalchemy import delete
delete_stmt = delete(ChainPlugin).where(
    (ChainPlugin.chain_id == chain_id) &
    (ChainPlugin.plugin_uri == plugin_uri)
)
result = await self.session.execute(delete_stmt)
```
**Why**: More atomic, uses database-level delete instead of object iteration

#### 3. Route Handler with Multi-Step Verification
```python
# app/routes/chains.py
# Step 1: Delete with explicit commit
async with get_session() as session:
    success = await service.remove_plugin_from_chain(chain_id, plugin_uri)
    await session.commit()
    session.expunge_all()

# Step 2: Force WAL checkpoint
await checkpoint_database()

# Step 3: Verify with fresh session (3 attempts)
async with get_session() as verify_session:
    verify_result = await verify_session.execute(select(ChainPlugin)...)
    if verify_plugin is None:
        deletion_confirmed = True
```
**Why**: Multi-layer verification ensures deletion is:
- Committed to transaction
- Written to database file (WAL checkpoint)
- Visible in fresh queries

### Frontend Changes

#### 1. Query Configuration
```typescript
// web/src/app/pages/ChainFlowPage.tsx line 1237
const chainsQuery = useQuery<ChainsResponse>({ 
    queryKey: chainsKey, 
    queryFn: chainsApi.list,
    staleTime: 30000, // 30 seconds, not 1 minute
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // NO refetchInterval - completely disabled polling
})
```
**Why**: Prevents polling from overwriting mutation-based updates

#### 2. Mutation Cache Clearing
```typescript
// web/src/app/pages/ChainFlowPage.tsx line 1493
onSettled: async () => {
    await queryClient.cancelQueries({ queryKey: chainsKey })
    queryClient.removeQueries({ queryKey: chainsKey })  // Complete removal
    await new Promise(resolve => setTimeout(resolve, 50))
    await queryClient.refetchQueries({ queryKey: chainsKey, type: 'all' })
}
```
**Why**: `removeQueries` completely wipes cache, forcing fresh fetch from server

## Testing

Create a chain with plugins, delete one, and:
1. ✓ Plugin should be removed from UI immediately
2. ✓ Plugin should stay removed after page refresh
3. ✓ Plugin should stay removed after 5+ minute delay
4. ✓ Multiple deletes in sequence should work reliably

## Technical Details

### Why `expire_on_commit=True` Was Critical

SQLAlchemy has an identity map that caches loaded objects. With `expire_on_commit=False`:
1. Delete plugin from chain
2. Commit transaction
3. Object still in identity map with stale state
4. New query on fresh session loads from connection pool
5. Connection may still be in transaction isolation snapshot
6. Query sees old data because of transaction isolation

With `expire_on_commit=True`:
1. Delete plugin from chain  
2. Commit transaction
3. All objects expire (removed from identity map)
4. New query forces fresh load
5. Gets latest data from database

### WAL Checkpoint Importance

SQLite WAL (Write-Ahead Logging) mode:
- Changes written to WAL file first
- Main database file updated periodically (checkpoint)
- Without explicit checkpoint, changes stay in WAL
- Other connections reading main file don't see changes
- `checkpoint_database()` forces WAL→main migration

### Transaction Isolation

SQLite default isolation is SERIALIZABLE:
- Transactions see snapshot at start time
- Multiple connections could see different states
- Multi-step verification with fresh sessions ensures all connections see deletion

## Summary

The deletion bug was caused by a **perfect storm** of issues:
1. Session config kept stale objects
2. Frontend polling overwrote mutations
3. No server-side verification of persistence
4. WAL checkpoint wasn't forced
5. Frontend cache management was too lenient

All five layers have been fixed to ensure deletions are:
- **Atomic** (database-level delete statement)
- **Committed** (explicit commit + context manager commit)
- **Persisted** (WAL checkpoint)
- **Verified** (fresh session queries)
- **Cached** (complete cache wipe before refetch)

This makes the deletion system significantly more reliable.
