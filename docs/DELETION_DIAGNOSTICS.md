# Plugin Deletion Bug - Diagnostic Instructions

## The Issue
You're reporting that when a plugin is deleted from a flow, it returns moments later (reappears after page refresh).

## Latest Fixes Applied (Jan 22, 2026)
1. Changed `expire_on_commit=False` → `expire_on_commit=True` in TWO places
2. Removed explicit double-commit in delete endpoint
3. Added dual deletion method (ORM + raw SQL)
4. Enhanced logging with detailed step-by-step tracing
5. Increased verification attempts to 5 with exponential backoff
6. Fixed async/await bug in shutdown checkpoint

## How to Diagnose

### Step 1: Start the server and check logs
```bash
# In terminal, start the server and watch for logs
cd /home/mm/map2-audio
./start_web.sh  # or however you start it
```

### Step 2: Monitor deletion logs
When you delete a plugin, look for these log patterns:

```
REMOVE_PLUGIN: === START deletion of [plugin_uri] from chain [chain_id] ===
REMOVE_PLUGIN: Step 1 - Checking if plugin exists...
REMOVE_PLUGIN: Found X matching record(s)
REMOVE_PLUGIN: Step 2a - Trying ORM DELETE...
REMOVE_PLUGIN: ORM DELETE returned rowcount=X
REMOVE_PLUGIN: Step 2b - Trying raw SQL DELETE...
REMOVE_PLUGIN: Raw SQL DELETE returned rowcount=X
REMOVE_PLUGIN: Step 3 - Flushing session...
REMOVE_PLUGIN: Flush successful
REMOVE_PLUGIN: Step 4 - Verifying deletion...
REMOVE_PLUGIN: ORM verify - X record(s) still exist
REMOVE_PLUGIN: Raw SQL verify - X record(s) still exist
REMOVE_PLUGIN: === SUCCESS - Deletion verified, X record(s) removed ===
```

### Step 3: Check for these error patterns
If you see ANY of these, report them:
- "Plugin NOT FOUND"
- "DELETE returned 0 rows"
- "Both methods returned 0 rows"
- "Flush FAILED"
- "VERIFICATION FAILED"
- "Exception during removal"

### Step 4: Verify the DELETE response
After deletion, the API should return:
```json
{
  "status": "plugin_removed",
  "chain_id": <number>
}
```

If you're getting an HTTP 500 error or different response, note it.

### Step 5: Check frontend refetch
After the plugin is "deleted" (before refresh), does the frontend show it removed? 
- If YES: The deletion works but it reappears after refresh (cache issue)
- If NO: The deletion endpoint itself is failing silently

### Step 6: Verify with GET /chains/{chain_id}
Immediately after deletion, try:
```bash
curl http://localhost:8080/api/chains/<chain_id>
```

Does the plugin still appear in the plugins list? 
- If YES: Deletion didn't persist to database
- If NO: Something is re-inserting it or restoring it

## What to Report
Please tell me:
1. What error/log messages you see (if any)
2. Whether the plugin disappears from UI immediately or stays
3. Whether it's truly gone after refresh or comes back
4. Any HTTP status codes you see
5. Any patterns in which plugins fail to delete (all? specific ones?)

## Next Steps
Based on your findings, we may need to:
- Check if something is restoring plugins after deletion
- Investigate WebSocket event handlers
- Check for background tasks syncing data
- Look for triggers or constraints in database
- Examine transaction isolation levels in SQLite
