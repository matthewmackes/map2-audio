# Plugin Deletion - Final Diagnostic Guide

## Status
After extensive fixes to database sessions, transactions, and verification, the plugin deletion is still not persisting. This document guides you through determining the root cause.

## Tools Created

### 1. Database Inspector
```bash
cd /home/mm/map2-audio
python3 inspect_database.py
```

This will show:
- All chains and their plugins (raw SQLite data)
- Database integrity (orphaned records, duplicates, NULLs)
- WAL/journal file status
- Optionally delete a plugin and verify: `python3 inspect_database.py 1 "plugin-uri"`

### 2. Enhanced Logging
The code now logs:
- Exact plugin_uri representation (bytes, length, type)
- All plugins in chain (to compare against what's being searched for)
- Step-by-step deletion process
- ORM AND raw SQL verification results

## Root Cause Analysis

### Most Likely Issues (in order)

1. **Plugin URI Mismatch**
   - Frontend sends: `"http://example.com/plugin"`
   - Database has: `"http://example.com/plugin "` (extra space)
   - Or different encoding (UTF-8 vs ASCII)
   - **Check**: Run `inspect_database.py` and look at exact URIs

2. **Multiple Database Files**
   - App writing to one file, reading from another
   - Stale cache/backup being used
   - **Check**: `ls -la /home/mm/map2-audio/data/map2.db*`

3. **Something Re-Inserting the Plugin**
   - Background task restoring deleted plugins
   - WebSocket event handler re-adding plugins
   - Backup/restore process interfering
   - **Check**: Grep for code that inserts ChainPlugin records

4. **Transaction Not Actually Committing**
   - Silent rollback somewhere
   - Exception being swallowed
   - Pool/connection issue
   - **Check**: Server logs for "FAILURE" or "Exception" messages

5. **Database File Corruption/Lock**
   - SQLite database locked
   - Write failing silently
   - Journal file not being processed
   - **Check**: `fuser /home/mm/map2-audio/data/map2.db`

6. **Multiple App Instances**
   - Two servers running on different ports
   - Deleting from one, reading from other
   - **Check**: `ps aux | grep "python.*main.py"`

## Testing Procedure

### Step 1: Inspect Current Database
```bash
python3 inspect_database.py
```
Note:
- How many chains exist
- How many plugins per chain
- Exact plugin URIs (copy the repr() output)

### Step 2: Direct Database Test
Test deletion directly at database level:
```bash
python3 inspect_database.py <chain_id> "<exact-plugin-uri>"
```

Example:
```bash
python3 inspect_database.py 1 "http://gx.lv2.plug.in/plugins/gxsd1"
```

### Step 3: Check Logs During Deletion
Start the server and watch logs:
```bash
# In terminal 1
./start_web.sh
# or
python3 app/main.py

# In terminal 2
tail -f logs/map2.log | grep -E "REMOVE_PLUGIN|DELETE_ENDPOINT"
```

Delete a plugin via UI, then check logs for:
- "REMOVE_PLUGIN: Found X matching record(s)" - should be >0
- "ORM DELETE returned rowcount=X" - should be >0
- "Raw SQL DELETE returned rowcount=X" - should be >0
- "ORM verify - X record(s) still exist" - should be 0
- "Raw SQL verify - X record(s) still exist" - should be 0

### Step 4: Check for URI Mismatch
If logs show "Found 0 matching record(s)" but plugin exists:
- Look at REMOVE_PLUGIN log entries
- Compare "uri=repr(...)" with actual database URIs from inspect_database.py
- Look for whitespace differences, encoding issues

### Step 5: Verify No Re-Insertion
After deletion succeeds in logs:
1. Immediately run: `python3 inspect_database.py`
2. Check if plugin is really gone
3. Wait 5 seconds, run again
4. Check if it came back

## What to Report

If the plugin deletion is still failing, tell me:

1. **Output from `inspect_database.py`**:
   - Total chains and plugins shown
   - Exact plugin URIs (copy the repr() output)
   - Any warnings about duplicates/orphaned records

2. **Test deletion logs**:
   - What messages appear for "REMOVE_PLUGIN" and "DELETE_ENDPOINT"
   - Any FAILURE or Exception messages
   - Exact rowcounts from DELETE operations

3. **Direct deletion test**:
   - Does `python3 inspect_database.py 1 "uri"` succeed?
   - Plugin gone after the test?

4. **How plugin returns**:
   - Does it reappear immediately?
   - After page refresh?
   - After server restart?
   - After waiting 5 minutes?

5. **Server configuration**:
   - Single instance or multiple servers running?
   - Any error messages on startup?
   - Database file permissions: `ls -la /home/mm/map2-audio/data/map2.db*`

## If Direct Deletion Works

If `python3 inspect_database.py 1 "uri"` successfully deletes but the API doesn't:
- The issue is in how the API calls the service
- Likely a session/transaction problem
- Possible connection pool issue

## If Direct Deletion Fails

If even direct SQLite deletion doesn't work:
- Database file corruption
- File permission issue
- Disk full
- Constraint violation preventing delete

Run: `sqlite3 /home/mm/map2-audio/data/map2.db "PRAGMA integrity_check;"`

## Next Debug Steps (In Code)

If this is STILL an issue after all fixes, the fundamental problem is likely:
1. The delete statement executes but doesn't actually delete (silent failure)
2. Some system-level process is preventing/rolling back deletes
3. The application is using multiple database instances

At this point, we need:
- Raw SQL query trace to see exact DELETE statements
- Filesystem monitor to verify db file is changing
- Transaction history to find rollbacks
