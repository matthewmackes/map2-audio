# Plugin Deletion Issue - Action Items for User

## Current Status
Despite comprehensive fixes to:
- SQLAlchemy session configuration (expire_on_commit)
- Database transaction handling
- Verification logic
- Frontend polling and caching
- Dual deletion methods (ORM + SQL)
- WAL checkpoint forcing

The plugin deletion is still not persisting. This suggests a **fundamental database or system-level issue**.

## What Changed in Latest Update
1. Added extensive debugging to show exact plugin_uri being searched (with repr())
2. Added code to list ALL plugins in chain if the target plugin isn't found
3. Increased verification attempts to 7 with better logging
4. Both ORM and raw SQL verify queries now run in parallel
5. Created `inspect_database.py` tool for raw SQLite inspection
6. Created diagnostic guide with step-by-step testing

## How to Debug This

### CRITICAL FIRST STEP
Run the database inspection tool and review the output carefully:

```bash
cd /home/mm/map2-audio
python3 inspect_database.py
```

This will show you:
- **What's actually in the database right now**
- Exact plugin URIs (important for matching issues)
- Database integrity
- File sizes and WAL status

**IMPORTANT**: Copy the ENTIRE output and review it for:
- How many plugins are in your first chain
- What the exact URIs look like
- Any warnings about duplicates or orphaned records

### SECOND STEP
Test deletion directly at the SQLite level (bypasses all application code):

```bash
# First check what's there
python3 inspect_database.py

# Note a plugin URI and chain ID, then try direct delete
python3 inspect_database.py 1 "exact-plugin-uri-from-above"
```

If this WORKS (plugin is gone):
- Problem is in application code (we can fix)
- Sessions, ORM, or framework issue

If this FAILS (plugin still there):
- Problem is at SQLite level
- Permissions, constraints, or file issue

### THIRD STEP
Check server logs while deleting:

```bash
# Terminal 1: Start the server and capture logs
./start_web.sh > /tmp/server.log 2>&1

# Terminal 2: Watch for deletion messages
tail -f /tmp/server.log | grep -E "REMOVE_PLUGIN|DELETE_ENDPOINT"

# Terminal 3: Delete a plugin via the UI

# Back in Terminal 2: Look for these patterns:
# - "Found X matching record(s)" - should be > 0
# - "ORM DELETE returned rowcount=" - should be > 0
# - "Raw SQL DELETE returned rowcount=" - should be > 0  
# - Any FAILURE messages
```

## Most Likely Root Causes

Given that ALL the standard fixes haven't worked, it's probably:

1. **Plugin URI format mismatch**
   - Frontend sends URL-encoded version
   - Database has different encoding
   - Example: `http://example.com/plugin%20name` vs `http://example.com/plugin name`
   - **FIX**: The new logging will show exact representations

2. **Multiple database files**
   - App deletes from `map2.db`
   - But frontend reads from `map2.db.backup` or similar
   - **CHECK**: `ls -la /home/mm/map2-audio/data/`

3. **SQLite constraints/triggers**
   - A trigger re-inserts deleted plugins
   - Foreign key constraint preventing delete
   - **CHECK**: `sqlite3 /home/mm/map2-audio/data/map2.db ".schema chain_plugins"`

4. **Connection pool issues**
   - Deleting on one connection, reading from stale connection pool
   - **FIX**: We've already added fresh session fetches

5. **File permissions**
   - App can't write to database file
   - **CHECK**: `ls -la /home/mm/map2-audio/data/map2.db`

## Do Not Miss

When you run the diagnostic tools, DO NOT IGNORE:
- Warnings about duplicates
- Warnings about orphaned records  
- "Plugin not found by direct match" messages
- Any file size or WAL file information
- The exact repr() output of plugin URIs

## What I Need From You

After running `python3 inspect_database.py`, please provide:

1. **Full output of inspect_database.py**
2. **Exact plugin URIs shown** (copy-paste the repr() values)
3. **Direct deletion test results**
4. **Server logs during a failed deletion attempt**
5. **Any error messages or warnings**

With this information, I can pinpoint the exact cause and provide a targeted fix.

## If You Can't Run the Tools

If you can't access the server right now, at minimum tell me:
- Has the database schema changed recently?
- Are there multiple instances of the app running?
- Have you added any triggers or constraints to the database?
- Is the database file on a network mount or local disk?
- Any unusual permissions issues?

## The Last Resort

If even direct SQLite deletion fails, the database might be corrupted or locked. In that case:

```bash
# Backup the database
cp /home/mm/map2-audio/data/map2.db /home/mm/map2-audio/data/map2.db.backup

# Try to rebuild it
sqlite3 /home/mm/map2-audio/data/map2.db "VACUUM;"

# Check integrity
sqlite3 /home/mm/map2-audio/data/map2.db "PRAGMA integrity_check;"
```

But do NOT do this unless I confirm it's safe.
