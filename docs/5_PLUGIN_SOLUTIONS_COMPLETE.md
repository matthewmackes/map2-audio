# 5 Solutions for Plugin Display Issues - Complete Guide

**Status**: Plugin display issues are ongoing - providing 5 complete solutions  
**Date**: January 20, 2026

---

## 🎯 Executive Summary

Despite applying the async/await fix, plugins may still not display due to:
1. System-level issues (lilv, LV2 plugins)
2. Configuration issues (cache, API response)
3. Frontend issues (browser, CORS)

This document provides **5 complete, independent solutions** to fix plugin display.

---

## ✅ System Status Check

**Current Environment**:
- ✅ lilv library: INSTALLED (164 plugins available in /usr/lib64/lv2)
- ✅ LV2 plugins: FOUND (164 plugins)
- ✅ API fix: APPLIED (async/await in place)
- ✅ Frontend: CONFIGURED (PluginsPage.tsx set up)

---

## 📋 5 Complete Solutions

### SOLUTION 1: Ensure lilv Library is Installed
**Problem**: Plugin loader can't communicate with LV2 system  
**Symptoms**: API returns 0 plugins, console shows "lilv not available"  
**Root Cause**: lilv library not installed or outdated

**Fix**:
```bash
# Method A: pip (Python package manager)
pip install pylilv

# Method B: apt (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install lilv-0 python3-lilv

# Verify installation
python3 -c "import lilv; print('✅ lilv installed')"

# Restart server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

**Verification**: 
```bash
curl http://localhost:8080/api/plugins/discover | grep -o '"count": [0-9]*'
# Should show: "count": 164 (or similar)
```

---

### SOLUTION 2: Install LV2 Plugins on System
**Problem**: Discovery runs but returns 0 plugins  
**Symptoms**: API returns empty plugins array  
**Root Cause**: No LV2 plugins installed on the system

**Fix**:
```bash
# Install popular LV2 plugins
sudo apt-get install calf-studio-gear

# Or install individual plugins
sudo apt-get install zita-rev1 zita-at1 calf-studio-gear

# Verify plugins installed
ls /usr/lib/lv2/ | head -10
# Should show: calf.lv2, ZitaAtOne.lv2, ZitaRev1.lv2, etc.

# Clear cache and refresh
rm -rf ~/.cache/map2/

# Test discovery
curl "http://localhost:8080/api/plugins/discover?refresh=true" | jq '.count'
```

**Verification**:
```bash
# Check that count is > 0
curl http://localhost:8080/api/plugins/discover | jq '.plugins | length'
```

---

### SOLUTION 3: Clear and Rebuild Plugin Cache
**Problem**: Stale or corrupted cache preventing fresh discovery  
**Symptoms**: Same plugins showing, or discovery hangs  
**Root Cause**: Old cache from previous versions or failed previous discovery

**Fix**:
```bash
# Stop the server (Ctrl+C if running)

# Clear all caches
rm -rf ~/.cache/map2/
rm -rf ~/.cache/map2/plugins_unified.json

# Optional: Clear browser cache
# In browser: Ctrl+Shift+Delete
# Or hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

# Start server fresh
cd /home/mm/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Access in browser with refresh:
# http://localhost:8080/web
# Then F5 or Ctrl+R to refresh
```

**Verification**:
```bash
# Cache should be recreated
ls -lah ~/.cache/map2/plugins_unified.json
cat ~/.cache/map2/plugins_unified.json | jq '.version, (.plugins | length)'
```

---

### SOLUTION 4: Verify API Endpoint Has Async/Await Fix
**Problem**: API returns error or hangs on plugin discovery  
**Symptoms**: API times out, returns empty, or shows error in logs  
**Root Cause**: Missing `await` when calling async plugin discovery method

**Fix**:
```bash
# Verify fix is in place
grep -n "import inspect" app/routes/plugins.py
# Should show: 8:import inspect

grep -n "inspect.iscoroutinefunction" app/routes/plugins.py
# Should show: 100:if inspect.iscoroutinefunction...

grep -n "await loader.discover_plugins" app/routes/plugins.py
# Should show: 102:plugins = await loader.discover_plugins...

# If any of these are missing, apply the fix from PLUGIN_LISTING_FIX.md:
# 1. Add "import inspect" to line 8
# 2. Update discover_plugins endpoint (lines 93-114) to properly await
```

**The Fix (if needed)**:
```python
# File: app/routes/plugins.py, lines 93-114

try:
    # Check if the loader has async or sync discover method
    if hasattr(loader, 'discover_plugins_sync'):
        # Use sync version
        plugins = loader.discover_plugins_sync()
    else:
        # Use async version (this is for the unified loader)
        # Check if discover_plugins is coroutine
        if inspect.iscoroutinefunction(loader.discover_plugins):
            plugins = await loader.discover_plugins(force_refresh=refresh)  # ✅ MUST HAVE await!
        else:
            plugins = loader.discover_plugins()
    
    _discovered_plugins = [_transform_plugin(p) for p in plugins]
    # ... rest of code
```

**Verification**:
```bash
# Test API endpoint directly
curl "http://localhost:8080/api/plugins/discover?refresh=true" -v

# Check response
# Should have 200 status
# Should have "plugins" array
# Should show "count" > 0
```

---

### SOLUTION 5: Debug and Fix Frontend Issues
**Problem**: Web interface shows no plugins despite API returning them  
**Symptoms**: Blank plugin list, or shows "Nothing matches that filter"  
**Root Cause**: Browser cache, CORS issues, or JavaScript errors

**Fix - Step by Step**:

**Step 1: Hard Refresh Browser**
```
Windows/Linux: Ctrl+Shift+R
Mac: Cmd+Shift+R
Or: Ctrl+F5
```

**Step 2: Check Browser Console for Errors**
```
1. Open browser DevTools: F12
2. Click "Console" tab
3. Look for red error messages
4. Note any errors about:
   - CORS (Cross-Origin Resource Sharing)
   - fetch failed
   - undefined response
```

**Step 3: Check Network Tab**
```
1. Open DevTools: F12
2. Click "Network" tab
3. Reload page: F5
4. Find request: /api/plugins/discover
5. Check:
   - Status: Should be 200 (not 404, 500, etc.)
   - Response: Should have JSON with plugins array
   - Headers: Check for CORS headers
```

**Step 4: Test API Directly**
```bash
# Terminal test
curl http://localhost:8080/api/plugins/discover | python3 -m json.tool | head -30

# Should show:
{
  "plugins": [
    {
      "uri": "...",
      "name": "...",
      "category": "..."
    }
  ],
  "count": N,
  "cached": false
}
```

**Step 5: Fix Common Issues**

If you see CORS errors:
```bash
# Restart backend server (it enables CORS)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

If you see "Empty response" or no plugins:
```bash
# Run Solution 2: Install LV2 plugins
sudo apt-get install calf-studio-gear
```

If you see 500 error:
```bash
# Check server logs
# Restart server with debug output
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level debug
```

If you see JavaScript errors in console:
```bash
# Clear browser cache
# Navigate to: http://localhost:8080/web
# Hard refresh: Ctrl+Shift+R
```

**Verification**:
```bash
# In browser:
1. Go to: http://localhost:8080/web
2. Click "Plugins" in navigation
3. You should see:
   - Plugin count badge (e.g., "164 discovered")
   - Search box
   - Category filter
   - List of plugins (if LV2 plugins installed)
```

---

## 🚀 Quick Test Script

Use this command to test all components at once:

```bash
#!/bin/bash
echo "Testing Plugin Display System..."

# Test 1: lilv library
echo -n "1. lilv library: "
python3 -c "import lilv; print('✅ OK')" 2>&1 || echo "❌ FAILED"

# Test 2: LV2 plugins
echo -n "2. LV2 plugins: "
COUNT=$(find /usr/lib/lv2 -name "*.lv2" -type d 2>/dev/null | wc -l)
if [ $COUNT -gt 0 ]; then echo "✅ OK ($COUNT plugins)"; else echo "❌ FAILED"; fi

# Test 3: Cache
echo -n "3. Plugin cache: "
if [ -f ~/.cache/map2/plugins_unified.json ]; then echo "✅ OK"; else echo "⚠️  Not created yet"; fi

# Test 4: API fix
echo -n "4. API endpoint fix: "
grep -q "await loader.discover_plugins" /home/mm/map2-audio/app/routes/plugins.py && echo "✅ OK" || echo "❌ MISSING"

# Test 5: API response
echo -n "5. API response: "
curl -s http://localhost:8080/api/plugins/discover 2>/dev/null | grep -q '"count"' && echo "✅ OK" || echo "❌ FAILED"

echo ""
echo "If any test fails, apply the corresponding solution above."
```

---

## 📊 Troubleshooting Decision Tree

```
Plugins not showing?
│
├─ API returns 0 plugins?
│  ├─ Solution 1: Install lilv library
│  ├─ Solution 2: Install LV2 plugins
│  └─ Solution 3: Clear cache and rebuild
│
├─ API returns error?
│  ├─ Solution 4: Verify async/await fix
│  └─ Solution 5: Check server logs
│
├─ API returns plugins but frontend shows none?
│  ├─ Solution 5: Hard refresh browser
│  ├─ Check browser console for errors
│  └─ Check Network tab for 200 status
│
└─ Everything seems OK but still not working?
   └─ See "Advanced Debugging" section below
```

---

## 🔍 Advanced Debugging

### Enable Debug Logging

```bash
# Start server with debug logging
LOGLEVEL=DEBUG python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Check Plugin Loader Statistics

```python
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.plugin_loader_unified import UnifiedPluginLoader

loader = UnifiedPluginLoader()
stats = loader.get_stats()
print(stats)

# Output should show:
# {
#   'plugin_count': 164,
#   'category_count': 12,
#   'lilv_available': True,
#   'cache_exists': False,
#   'initialized': False
# }
```

### Manual Plugin Discovery Test

```python
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.plugin_loader_unified import UnifiedPluginLoader

loader = UnifiedPluginLoader()
try:
    # This might hang - be patient
    plugins = loader.discover_sync()
    print(f"Found {len(plugins)} plugins")
    for p in plugins[:5]:
        print(f"  - {p.name} ({p.category})")
except Exception as e:
    print(f"Error: {e}")
```

### View Current Cache

```bash
# Check if cache exists
ls -lah ~/.cache/map2/plugins_unified.json

# View cache contents
cat ~/.cache/map2/plugins_unified.json | python3 -m json.tool | head -100

# Count cached plugins
cat ~/.cache/map2/plugins_unified.json | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Cached plugins: {len(data.get(\"plugins\", {}))}')"
```

---

## ✅ Verification Checklist

After applying solutions, verify everything:

- [ ] lilv library installed: `python3 -c "import lilv; print('OK')"`
- [ ] LV2 plugins found: `ls /usr/lib/lv2/ | head -5`
- [ ] Cache cleared: `rm -rf ~/.cache/map2/`
- [ ] API fix applied: `grep "await" app/routes/plugins.py`
- [ ] Server restarted: `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080`
- [ ] Browser hard refreshed: `Ctrl+Shift+R`
- [ ] API test passed: `curl http://localhost:8080/api/plugins/discover | jq '.count'`
- [ ] Frontend shows plugins: Visit `http://localhost:8080/web` and click Plugins

---

## 📞 Support Resources

- **PLUGIN_LISTING_FIX.md** - Details of async/await fix (Solution 4)
- **test_plugin_discovery.py** - Automated test script
- **5_PLUGIN_SOLUTIONS.py** - This diagnostic tool

---

## 🎯 Expected Results

After applying all solutions:

**Web Interface Plugins Page Should Show**:
- ✅ Plugin count badge: "164 discovered" (or actual count)
- ✅ Search box for filtering
- ✅ Category dropdown filter
- ✅ List of plugins with details
- ✅ Plugin details expandable on click

**API Response**:
```bash
$ curl http://localhost:8080/api/plugins/discover | jq .
{
  "plugins": [
    {
      "uri": "...",
      "name": "...",
      "author": "...",
      "category": "...",
      "parameters": [...],
      ...
    }
  ],
  "count": 164,
  "cached": false
}
```

---

## 📝 Summary

| Solution | Problem | Cause | Impact |
|----------|---------|-------|--------|
| 1 | API: 0 plugins | lilv not installed | Must have for discovery |
| 2 | API: empty list | No LV2 plugins | Blocks all plugin display |
| 3 | Stale data | Corrupted cache | Prevents fresh discovery |
| 4 | API error/timeout | Missing await | Blocks API completely |
| 5 | Frontend blank | Browser/CORS | Blocks UI display |

**Try solutions in order.** Most issues are fixed by Solution 1 + Solution 2.

For ongoing issues: Apply all 5 solutions in sequence, verifying each step.

---

**Last Updated**: January 20, 2026  
**Status**: Ready to implement

