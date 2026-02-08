# Quick Testing Guide - Special Checkbox

## Standalone Mode Testing

### Setup
```bash
# Start the application in standalone mode
python -m app.main

# Server running at http://localhost:8000
```

### Test Sequence

#### 1. Test Password Authentication
```
Navigate to: http://localhost:8000/about
Click: Advanced Menu (Dragon icon) → ✨ Special checkbox
Expected: PasswordDialog appears
Enter: "backdoor" (or configured password)
Click: Submit
Expected: SpecialSettingsDialog appears (password was correct)

Test wrong password:
Click: ✨ Special checkbox again
Enter: "wrong-password"
Click: Submit
Expected: Error message "Incorrect password"
```

#### 2. Test Settings Dialog
```
With SpecialSettingsDialog open:

Plugin Visibility:
- See list of all native plugins (map2://*)
- Toggle checkboxes to hide/show plugins
- Hidden plugins show with EyeOff icon
- Visible plugins show with Eye icon

Advanced Menu Location:
- Select "Show in Top Navigation" (default)
- Select "Mobile Menu Only"
- Select "Hide Completely"

Click Save
Expected: Dialog closes, settings saved
```

#### 3. Test Advanced Menu Visibility
```
After enabling Special:
- Check top nav: Advanced Menu appears (Dragon icon with red border)
- Check mobile menu (if testing on mobile): Menu items appear/disappear

Click Advanced Menu:
- See all menu items (Overview, Presets, MIDI, Plugins, etc.)
- Click items to navigate
- Menu closes when clicking item

Disable Special (click checkbox and uncheck):
- Advanced Menu disappears immediately
- Top nav returns to normal
```

#### 4. Test Plugin Filtering in Grid
```
Navigate to: Grid page (click Grid in left nav)
Plugin Chooser:
- If Special is disabled: All native plugins visible
- If Special is enabled: Only unhidden plugins shown
- Hidden plugins do not appear in "Core Integrated" section
- LV2 plugins unaffected (always shown)

Test dynamic filtering:
1. Go to About → Advanced → Special checkbox
2. Uncheck some plugins in settings
3. Navigate back to Grid
4. Verify hidden plugins are filtered out
5. Change settings again
6. Verify Grid updates automatically
```

#### 5. Test Persistence
```
1. Enable Special mode
2. Configure settings (hide some plugins, set menu location)
3. Hard refresh browser (Ctrl+F5 or Cmd+Shift+R)
4. Expected: Settings still enabled, same plugins hidden
5. Close browser window
6. Reopen browser
7. Navigate to About → Advanced
8. Expected: Special checkbox still checked
9. Expected: Same plugins hidden in Grid
```

#### 6. Verify Database
```bash
# Check SQLite database directly
sqlite3 data/map2.db "SELECT * FROM special_settings;"

# Expected output (example):
# id|enabled|hidden_plugins|menu_location|version|last_updated|updated_by_node|raft_log_index
# 1|1|["map2://eventide_h9000"]|top-nav|2|2026-02-07T...|standalone|

# Verify it updates:
sqlite3 data/map2.db "SELECT version, updated_by_node FROM special_settings;"
# Version should increment with each save
```

---

## Cluster Mode Testing (Multi-Node)

### Setup
```bash
# Terminal 1 - Node 1 (Leader initially)
export CLUSTER_MODE=enabled
export NODE_ID=node-1
export CLUSTER_PEERS=node-1:8001,node-2:8002,node-3:8003
export SPECIAL_MODE_PASSWORD=backdoor
python -m app.main --port 8001

# Terminal 2 - Node 2 (Follower)
export CLUSTER_MODE=enabled
export NODE_ID=node-2
export CLUSTER_PEERS=node-1:8001,node-2:8002,node-3:8003
export SPECIAL_MODE_PASSWORD=backdoor
python -m app.main --port 8002

# Terminal 3 - Node 3 (Follower)
export CLUSTER_MODE=enabled
export NODE_ID=node-3
export CLUSTER_PEERS=node-1:8001,node-2:8002,node-3:8003
export SPECIAL_MODE_PASSWORD=backdoor
python -m app.main --port 8003
```

### Test Sequence

#### 1. Test Leader Election
```
Terminal 1: Check logs
Expected: "Starting Raft consensus (node_id=node-1)"
Expected: After timeout, one node becomes leader
Check which node logs: "Elected as leader"

Kill leader (Ctrl+C in Terminal 1)
Wait 5 seconds for election timeout
Expected: Another node becomes leader
Check remaining terminals for: "Elected as leader"
```

#### 2. Test Settings Replication
```
Browser 1 (connected to Node 1):
Navigate to: http://localhost:8001/about
Advanced → Special checkbox
Enter password, save settings with custom hidden plugins

Check Node 1 logs:
Expected: "Special settings replicated to Raft log at index X"
Expected: "Special settings committed at index X"

Check Node 2 logs:
Expected: "Applied special settings: enabled=True, hidden=1..."

Check Node 3 logs:
Expected: "Applied special settings: enabled=True, hidden=1..."

Browser 2 (connected to Node 2):
Navigate to: http://localhost:8002
Expected: Grid page should show same hidden plugins as Browser 1
No need to enable Special - it's already synchronized!
```

#### 3. Test Follower Redirect
```
Browser: Connect to follower node
http://localhost:8002/about

Try to update settings:
Special checkbox → Password → Change settings → Save

Browser logs or network tab:
Expected: Request to /api/settings/special
Expected: HTTP 307 response (redirect)
Expected: Automatic retry to leader (node-1)
Expected: Settings saved successfully

Verify:
Check Browser 3 (connected to node-3):
Expected: Same settings visible
```

#### 4. Test Node Join
```
Kill Node 2 (Ctrl+C in Terminal 2)
Make settings change on active nodes:
Browser: Change hidden plugins, save

Restart Node 2:
export CLUSTER_MODE=enabled
export NODE_ID=node-2
export CLUSTER_PEERS=node-1:8001,node-2:8002,node-3:8003
python -m app.main --port 8002

Check Node 2 logs:
Expected: "Synchronized special settings to new node node-2"
Expected: "Applied special settings from leader"

Check Node 2 database:
sqlite3 data/map2.db "SELECT version FROM special_settings WHERE id=1;"
Expected: Same version as other nodes
```

#### 5. Test Network Partition
```
Kill Node 1 (leader):
Ctrl+C in Terminal 1

Try to update settings from Browser on Node 2:
Expected: Error or redirect with timeout

Terminals 2 & 3 should elect new leader:
Expected: One logs "Elected as leader"

Now try settings change again:
Expected: Succeeds with new leader

Restart Node 1:
It will follow the other nodes
Check Node 1 database:
sqlite3 data/map2.db "SELECT version FROM special_settings WHERE id=1;"
Expected: Caught up to same version as Node 2/3
```

#### 6. Monitor Cluster State
```bash
# Watch Node 1 logs for Raft state
tail -f node1.log | grep Raft

# Expected pattern:
# Starting Raft consensus
# Election timeout
# Elected as leader (or voted for node-X)
# Sending heartbeats to followers
# AppendEntries RPC acknowledged by node-2
# AppendEntries RPC acknowledged by node-3
# Applying special_settings entry
```

---

## Debugging Tips

### Check Current Settings
```bash
# GET current settings
curl http://localhost:8000/api/settings/special

# Example response:
{
  "enabled": true,
  "hidden_plugins": ["map2://eventide_h9000"],
  "menu_location": "top-nav",
  "version": 2,
  "last_updated": "2026-02-07T...",
  "updated_by_node": "standalone"
}
```

### Test Password Endpoint
```bash
# Correct password
curl -X POST http://localhost:8000/api/auth/special-backdoor \
  -H "Content-Type: application/json" \
  -d '{"password": "backdoor"}'
# Expected: {"success": true, "message": "..."}

# Wrong password
curl -X POST http://localhost:8000/api/auth/special-backdoor \
  -H "Content-Type: application/json" \
  -d '{"password": "wrong"}'
# Expected: {"success": false, "message": "Incorrect password"}
```

### Check Database
```bash
# View special settings table
sqlite3 data/map2.db ".schema special_settings"

# View all settings
sqlite3 data/map2.db "SELECT * FROM special_settings;"

# Reset to defaults
sqlite3 data/map2.db "DELETE FROM special_settings;"
```

### View Logs
```bash
# Follow application logs
tail -f /tmp/map2-audio.log

# Filter for Special settings logs
grep -i "special" /tmp/map2-audio.log

# Filter for Raft logs
grep -i "raft\|consensus" /tmp/map2-audio.log
```

### Test Raft State
```bash
# On any node, check Raft status
curl http://localhost:8000/api/cluster/status
# (if /api/cluster/status endpoint exists)

# Check leader
curl http://localhost:8000/api/cluster/leader
# (if /api/cluster/leader endpoint exists)
```

---

## Success Criteria

### Standalone Mode ✅
- [x] Password protection works
- [x] Settings persist in database
- [x] Advanced Menu shows/hides correctly
- [x] Plugins filter in Grid
- [x] Settings survive browser reload
- [x] Settings survive app restart

### Cluster Mode ✅
- [ ] Settings replicate to all nodes
- [ ] Follower redirects to leader
- [ ] New nodes sync on join
- [ ] Leader election works
- [ ] Network partition handling works
- [ ] Concurrent updates resolved correctly

---

## Common Issues & Solutions

**Issue**: PasswordDialog doesn't appear
- Solution: Check browser console for errors
- Solution: Verify `/api/auth/special-backdoor` endpoint exists
- Solution: Try hard refresh (Ctrl+Shift+R)

**Issue**: Settings don't persist
- Solution: Check browser localStorage (clear if needed)
- Solution: Check database exists: `ls -la data/map2.db`
- Solution: Check API response status codes

**Issue**: Advanced Menu not showing
- Solution: Verify Special checkbox is actually enabled
- Solution: Check AppShell.tsx for conditional rendering
- Solution: Try refreshing page

**Issue**: Plugins still visible when hidden
- Solution: Verify hiddenPlugins array is updated
- Solution: Check GridFlowPage filtering logic
- Solution: Clear browser cache

**Issue**: Cluster sync not working
- Solution: Verify CLUSTER_MODE=enabled on all nodes
- Solution: Check Raft logs in application logs
- Solution: Verify CLUSTER_PEERS matches actual nodes
- Solution: Check network connectivity between nodes

---

## Performance Testing

```bash
# Test rapid updates
for i in {1..10}; do
  curl -X POST http://localhost:8000/api/settings/special \
    -H "Content-Type: application/json" \
    -d "{\"enabled\": $((i % 2)), \"hidden_plugins\": [], \"menu_location\": \"top-nav\"}"
  sleep 0.1
done

# Check database version incremented 10 times
sqlite3 data/map2.db "SELECT version FROM special_settings;"
# Expected: version=11 (started at 1, incremented 10 times)
```

---

Ready to test! Follow the sequences above for comprehensive testing of both standalone and cluster modes.
