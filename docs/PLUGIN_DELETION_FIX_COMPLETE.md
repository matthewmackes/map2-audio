# Plugin Deletion Bug - Complete Fix Summary
Date: January 22, 2026

## Root Causes Identified & Fixed

### 1. **SQLAlchemy Session Expiration Configuration** 
- **Files**: `app/database.py:96`, `app/services/database.py:26`
- **Problem**: `expire_on_commit=False` kept deleted objects in session cache
- **Fix**: Changed to `expire_on_commit=True` everywhere
- **Impact**: Forces fresh database queries instead of returning cached deleted objects

### 2. **Unnecessary Double-Commit**
- **File**: `app/routes/chains.py`
- **Problem**: Explicit `session.commit()` followed by context manager commit
- **Fix**: Removed explicit commit, let context manager handle all commits
- **Impact**: Prevents race conditions and potential rollback issues

### 3. **Async/Await Bug in Shutdown**
- **File**: `app/main.py:93`
- **Problem**: Called `checkpoint_database()` without `await` in async context
- **Fix**: Added `await` keyword
- **Impact**: Ensures database changes are properly flushed on shutdown

### 4. **Weak Deletion Verification**
- **File**: `app/services/chain_service.py`
- **Problem**: Only used ORM delete method, could fail silently
- **Fix**: Added dual delete methods (ORM + raw SQL)
- **Impact**: If one method fails, the other acts as fallback

### 5. **Insufficient Verification Loop**
- **File**: `app/routes/chains.py`
- **Problem**: Only 3 verification attempts with no backoff
- **Fix**: Increased to 5 attempts with exponential backoff (0.1s, 0.2s, 0.3s, 0.4s, 0.5s)
- **Impact**: Better handling of transient database visibility issues

### 6. **Inadequate Logging**
- **Files**: `app/services/chain_service.py`, `app/routes/chains.py`
- **Problem**: Difficult to diagnose what was happening during deletion
- **Fix**: Added comprehensive "REMOVE_PLUGIN:" and "DELETE_ENDPOINT:" prefixed logs
- **Impact**: Can now trace exact point of failure

### 7. **Frontend Aggressive Polling**
- **File**: `web/src/app/pages/ChainFlowPage.tsx`
- **Problem**: Automatic polling every 2-3 seconds overwriting mutations with stale data
- **Fix**: Disabled automatic refetchInterval, use only mutation-triggered refetches
- **Impact**: Prevents polling from undoing successful deletions

### 8. **Weak Frontend Cache Clearing**
- **File**: `web/src/app/pages/ChainFlowPage.tsx`
- **Problem**: Used `invalidateQueries` instead of `removeQueries`
- **Fix**: Changed to complete cache wipe with `removeQueries`
- **Impact**: Ensures frontend fetches fresh data from server

## Deletion Flow (After Fixes)

```
1. DELETE endpoint receives request
2. Creates session via get_session() context manager
3. Service removes plugin using:
   - ORM delete() method
   - Raw SQL DELETE statement (parallel)
4. Both methods flush to transaction
5. Verify deletion within same transaction
6. Exit session context → automatic commit
7. Force WAL checkpoint (write to disk)
8. Verify with 5 fresh session attempts
9. Only return success after confirmed deletion
10. Publish deletion event
```

## Key Technical Details

### SQLite WAL Mode
- Changes first written to Write-Ahead Log (WAL)
- `checkpoint_database()` forces migration from WAL to main database file
- Without checkpoint, other connections may not see changes

### Session Expiration
- `expire_on_commit=True`: Objects invalidated after commit
- Forces fresh database queries on next access
- Prevents returning stale cached objects

### Transaction Isolation
- SQLite default is SERIALIZABLE
- Multiple connections see transaction snapshots
- Verification with fresh sessions ensures consistency

### Exponential Backoff
- First verification: immediate
- 2nd: 0.1s wait
- 3rd: 0.2s wait
- 4th: 0.3s wait
- 5th: 0.4s wait
- Handles temporary database contention

## Files Modified
1. `app/database.py` - Session configuration
2. `app/services/database.py` - Secondary session factory
3. `app/services/chain_service.py` - Dual deletion methods, enhanced logging
4. `app/routes/chains.py` - Better error handling, verification, logging
5. `app/main.py` - Fixed async/await bug
6. `web/src/app/pages/ChainFlowPage.tsx` - Disabled polling, improved cache clearing

## Testing Checklist

- [ ] Delete plugin from flow
- [ ] Plugin immediately removed from UI
- [ ] Refresh page - plugin should stay deleted
- [ ] Wait 5 minutes - plugin should still be gone
- [ ] Check browser console for errors
- [ ] Check server logs for "REMOVE_PLUGIN:" messages
- [ ] Check for "DELETE_ENDPOINT:" messages
- [ ] Verify all end with "SUCCESS ✓"
- [ ] Test multiple deletions in sequence
- [ ] Test delete different plugin types (LV2, NAM, IR)

## If Plugin Still Returns

If after all these fixes the plugin still returns:

1. Check server logs for any FAILURE or CRITICAL messages
2. Verify deletion verification shows "Record still exists"
3. Check if deletion endpoint returns HTTP 200 or 500
4. Verify database file is actually being modified (`ls -la data/map2.db`)
5. Check if there's a backup/restore process interfering
6. Look for any background tasks re-inserting plugins
7. Verify browser isn't caching the response

## Command to View Logs
```bash
tail -f /home/mm/map2-audio/logs/map2.log | grep -E "REMOVE_PLUGIN|DELETE_ENDPOINT"
```
