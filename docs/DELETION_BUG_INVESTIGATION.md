# Plugin Deletion Bug - Deep Dive Investigation

## Problem Statement
When plugins are deleted, they instantly return (reappear) in the UI, even though the delete API returns success.

## Investigation Steps Taken

### 1. Frontend Changes (Already Applied)
- Enhanced cache invalidation in `removePlugin` mutation
- Added aggressive cache clearing with `refetchType: 'all'`
- Added 150ms delay before refetch to allow database commits
- Uses explicit `refetchQueries()` after cache invalidation

### 2. Backend Diagnostic Changes (Just Applied)

#### Enhanced Logging in `remove_plugin_from_chain()`
Added detailed logging at each step:
- Logs when session is null
- Logs when searching for plugin
- Logs when plugin is found
- Logs when session.delete() is called
- Logs when session.flush() is called
- **NEW: Verification query** - immediately checks if plugin still exists after flush
- Logs any verification failures

#### Enhanced Logging in Delete Route
Added logging to track:
- Delete request received with chain_id and plugin_uri
- Return value from service
- Success message logged
- Any errors logged

### 3. Test Files Created (For Manual Testing)

**test_delete_api.py**
- Tests delete via HTTP API
- Checks if plugin exists before delete
- Deletes plugin
- Checks if plugin exists immediately after
- Checks again after 300ms delay
- Reports exact results

### 4. Key Files Modified

- `/home/mm/map2-audio/app/services/chain_service.py` - Added verification logging
- `/home/mm/map2-audio/app/routes/chains.py` - Added request/response logging
- `/home/mm/map2-audio/web/src/app/pages/ChainFlowPage.tsx` - Enhanced cache invalidation

## Next Steps to Diagnose

1. **Check Logs**: Look at server logs when a delete is performed to see:
   - If the plugin is found
   - If delete succeeds
   - If verification query shows it's gone
   - Any error messages

2. **Run Test Script**: 
   ```bash
   cd /home/mm/map2-audio
   python test_delete_api.py
   ```
   This will show exactly where the problem occurs:
   - During delete
   - After delete
   - After delay

3. **Possible Root Causes**:
   - Session not committing properly (context manager issue)
   - Stale SQLAlchemy identity map
   - Database session isolation problem
   - Query caching at ORM level

4. **If Logs Show Delete Succeeds But Plugin Returns**:
   - Issue is with get_chain() not seeing the delete
   - Might need to clear session identity map
   - Or issue could be read replicas/caching

5. **If Logs Show Delete Fails**:
   - Plugin not found (wrong URI format?)
   - Session error
   - Database constraint error

## Key Code Sections

### Remove Plugin (with verification):
Location: `/home/mm/map2-audio/app/services/chain_service.py:603-660`

The key addition is:
```python
# Verify deletion before returning
verify_result = await self.session.execute(
    select(ChainPlugin).filter(
        (ChainPlugin.chain_id == chain_id) &
        (ChainPlugin.plugin_uri == plugin_uri)
    )
)
verify_plugin = verify_result.scalar_one_or_none()

if verify_plugin:
    logger.error(f"VERIFICATION FAILED: Plugin still exists after flush!")
    return False
```

This immediately tells us if the DELETE is working.

## How to Fix Once Root Cause is Found

1. **If ORM identity map issue**: Clear session identity map after delete
2. **If commit issue**: Ensure session.commit() happens (should be in context manager)
3. **If query issue**: Try using `session.expire()` or `session.expunge()` to clear cache
4. **If URI matching issue**: Check if plugin_uri format is consistent

