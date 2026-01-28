# 🚀 STEP 2 EXECUTION GUIDE - Real-Time Testing

## START HERE - Live Testing Session

This guide walks you through actually running and testing the Audio Interface feature right now.

---

## ✅ PHASE 0: Pre-Flight Check (2 minutes)

### Test 1: Backend Running?
```bash
# Run this command:
curl -s http://localhost:5000/api/audio/status | head -20
```

**Expected Output**: JSON with audio configuration
```json
{
  "running": true,
  "sample_rate": 48000,
  "buffer_size": 256,
  ...
}
```

**If You See**:
- ✅ JSON data → Backend is running! Continue to Test 2
- ❌ "Connection refused" → Backend not running
  - Start it: `python3 app/main.py`
  - Or: `sudo systemctl start map2-audio`
  - Then retry this test
- ❌ "Command not found" → Install curl: `sudo apt install curl`

---

### Test 2: HTML File Updated?
```bash
# Run this command:
grep -c "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html
```

**Expected Output**: `1`

**If You See**:
- ✅ `1` → File is updated! Continue
- ❌ `0` → File not updated or not in expected location
  - Check file exists: `ls /home/mm/map2-audio/web/overview-dashboard.html`
  - If not found, extract/copy correct version

---

### Test 3: Web Server Responding?
```bash
# Run this command:
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/
```

**Expected Output**: `200`

**If You See**:
- ✅ `200` → Web server is running! Continue
- ❌ `000` or `Connection refused` → Server not running
  - Start it: `python3 app/main.py`
  - Or: `sudo systemctl restart map2-audio`
- ❌ `404` → Dashboard not found at this URL

---

### ✅ Pre-Flight Result

If all 3 tests passed:
```
✅ Backend running
✅ HTML updated
✅ Web server responding

READY TO TEST FRONTEND!
```

If any failed, fix it before continuing.

---

## 🎮 PHASE 1: Visual Rendering Test (5 minutes)

### Step 1: Open Browser
```
URL: http://localhost:5000
Or: http://<your-server-ip>:5000
```

### Step 2: Wait for Page Load
- Look for loading indicators
- Should complete within 3 seconds
- Check there are no red error messages

### Step 3: Look for Audio Interface Section
**Expected**: In the middle of the page between "Key Metrics" and "Phase 1"

**Checklist**:
```
Visual Elements to Verify:
□ Title: "🎙️ Audio Interface Control"
□ Status badge (top-right): Shows "Connected" or device status
□ Device image area (200x200px with emoji or image)
□ 6 specification cards:
  □ Device Name
  □ Sample Rate (e.g., 48.0k)
  □ Buffer Size (e.g., 256)
  □ Input Channels (e.g., 2)
  □ Output Channels (e.g., 2)
  □ Latency (e.g., 10.67 ms)
□ Configuration section with dropdowns
□ 3 buttons: Restart, Test, More Info
□ Green status panel at bottom
```

### Result: PHASE 1

- ✅ All elements visible → **PASS** - Go to Phase 2
- ⚠️ Some elements missing → **WARNING** - Check troubleshooting
- ❌ Section not visible at all → **FAIL** - See STEP_2_TROUBLESHOOTING.md Issue 1

---

## 🔗 PHASE 2: API Integration Test (5 minutes)

### Step 1: Open Developer Tools
```
Press: F12 (Windows/Linux)
Or: Cmd+Option+I (Mac)
```

### Step 2: Go to Console Tab
- Click "Console" tab
- You should see console ready for input

### Step 3: Test Audio Status API
Copy and paste this into the console:
```javascript
fetch('/api/audio/status')
  .then(r => r.json())
  .then(d => console.log('✅ Audio Status:', d))
  .catch(e => console.error('❌ Error:', e))
```

**Expected**: See `✅ Audio Status:` with JSON data

**Check**:
```
✓ Shows: running: true/false
✓ Shows: sample_rate: (number)
✓ Shows: buffer_size: (number)
✓ Shows: cpu_load: (number)
```

### Step 4: Test USB Devices API
Copy and paste this into the console:
```javascript
fetch('/api/usb/devices')
  .then(r => r.json())
  .then(d => console.log('✅ USB Devices:', d))
  .catch(e => console.error('❌ Error:', e))
```

**Expected**: See `✅ USB Devices:` with JSON data

**Check**:
```
✓ Shows: hotone_detected: (true/false)
✓ Shows: device_count: (number)
✓ Shows: all_devices: (array)
```

### Step 5: Monitor Network Requests
1. Click "Network" tab in DevTools
2. Refresh page (F5)
3. Wait for page to load
4. Look for API calls:
   - `/api/audio/status` (GET) - should show in network
   - `/api/usb/devices` (GET) - should show in network
5. Click each request to verify:
   - Status: 200
   - Response type: application/json
   - Response time: <200ms

### Result: PHASE 2

- ✅ Both APIs respond with data → **PASS** - Go to Phase 3
- ⚠️ APIs respond slowly (>500ms) → **WARNING** - May be network issue
- ❌ APIs not responding → **FAIL** - See STEP_2_TROUBLESHOOTING.md Issue 2

---

## 🎮 PHASE 3: Control Testing (10 minutes)

### Test 3.1: Sample Rate Configuration

**In the Browser**:
1. Locate "Sample Rate" dropdown
2. Click it
3. Select "96 kHz" (or different from current)
4. Click "Apply" button

**In DevTools**:
1. Keep Network tab visible
2. You should see a POST request to `/api/audio/config`
3. Click the request to see details
4. Check Request body has: `{"sample_rate": 96000}`
5. Check Response shows: `"success": true`

**Expected Result**:
- ✅ Alert appears: "Audio configuration updated"
- ✅ POST request in Network tab
- ✅ Status code: 200
- ✅ Sample rate in specs updates

---

### Test 3.2: Buffer Size Configuration

**In the Browser**:
1. Locate "Buffer Size" dropdown
2. Click it
3. Select "512 samples" (or different from current)
4. Click "Apply" button

**In DevTools**:
1. Watch Network tab
2. POST to `/api/audio/config` should appear
3. Request body: `{"buffer_size": 512}`

**Expected Result**:
- ✅ Alert appears confirming change
- ✅ POST request succeeds
- ✅ Buffer size in specs updates

---

### Test 3.3: Restart Engine

**In the Browser**:
1. Click "🔄 Restart Engine" button
2. Confirmation dialog appears
3. Click "OK"

**In DevTools**:
1. POST to `/api/audio/restart` should appear
2. Check status: 200
3. You may hear brief audio pause (normal)

**Expected Result**:
- ✅ Alert appears: "Audio engine restarted"
- ✅ POST request to `/api/audio/restart`
- ✅ Specifications refresh after ~1 second

---

### Test 3.4: Run Diagnostics

**In the Browser**:
1. Click "🧪 Run Test" button
2. Wait 2-3 seconds
3. Alert appears with test results

**In DevTools**:
1. POST to `/api/audio/test` should appear
2. Check Response shows:
   - latency_ms (e.g., 10.67)
   - sample_rate (e.g., 48000)
   - buffer_size (e.g., 256)
   - score (0-100)

**Expected Alert Content**:
```
Audio Test Results:
Latency: 10.67 ms
Sample Rate: 48000 Hz
Buffer Size: 256 samples
Quality Score: 95/100
Status: Healthy
```

---

### Test 3.5: Device Information

**In the Browser**:
1. Click "ℹ️ More Info" button
2. Alert appears with device details

**Expected Alert Content**:
```
Device Information:
Name: [Device Name]
Vendor ID: [ID]
Product ID: [ID]
Bus: [Bus]
Device: [Device]
Speed: [Speed]
```

### Result: PHASE 3

- ✅ 5 of 5 controls work → **PASS** - Go to Phase 4
- ⚠️ 3-4 controls work → **WARNING** - Some issues but functional
- ❌ 0-2 controls work → **FAIL** - See STEP_2_TROUBLESHOOTING.md Issue 3

---

## 📱 PHASE 4: Responsive Design Test (5 minutes)

### Test 4.1: Desktop (1400px)

**In Browser**:
1. Open DevTools (F12)
2. Click mobile icon: ☎️📱 (or Ctrl+Shift+M)
3. At top, change "Dimensions" to "1400"
4. Or drag window to ~1400px wide

**Verify**:
```
✓ Device image on LEFT side
✓ Specs grid on RIGHT side
✓ 6-column grid layout
✓ All buttons visible
✓ No horizontal scrollbar
✓ Proper spacing
```

---

### Test 4.2: Tablet (768-1024px)

**In Browser**:
1. Change viewport to "768"
2. Or drag to ~800px wide

**Verify**:
```
✓ Device image on TOP
✓ Specs grid below
✓ 3-column grid layout
✓ All controls visible
✓ Buttons may wrap
✓ No horizontal scrollbar
```

---

### Test 4.3: Mobile (375px)

**In Browser**:
1. Change viewport to "375"
2. Or drag to ~375px wide

**Verify**:
```
✓ Full vertical stacking
✓ Image small but visible
✓ 2-column grid layout
✓ Buttons stack vertically
✓ Touch targets >44px (testable)
✓ Text readable without zoom
```

### Result: PHASE 4

- ✅ All 3 layouts correct → **PASS** - Go to Phase 5
- ⚠️ 2 layouts correct → **WARNING** - Some responsiveness issues
- ❌ 0-1 layouts correct → **FAIL** - See STEP_2_TROUBLESHOOTING.md Issue 5

---

## ✅ PHASE 5: Error Handling (3 minutes)

### Test 5.1: Check Browser Console

**In DevTools**:
1. Click "Console" tab
2. Refresh page (F5)
3. Look for any red errors

**Should See**: No red error messages

**If You See Red Errors**:
- Note the error text
- Reference: STEP_2_TROUBLESHOOTING.md
- Check which issue matches

---

### Test 5.2: Check for Network Failures

**In DevTools**:
1. Click "Network" tab
2. Look at all requests
3. Check status codes

**Should See**: All requests have green checkmark (200 status)

**If You See Red Requests**:
- Click to see details
- Check error message
- May indicate backend issue

---

## 📊 FINAL SCORECARD

Create your test report:

```
═══════════════════════════════════════════
        STEP 2 TEST RESULTS
═══════════════════════════════════════════

Pre-Flight Checks:
  ☐ Backend running          PASS/FAIL
  ☐ HTML file updated        PASS/FAIL
  ☐ Web server responding    PASS/FAIL

Phase 1: Visual Rendering
  ☐ Section visible          PASS/FAIL
  ☐ All elements shown        PASS/FAIL
  
Phase 2: API Integration
  ☐ /api/audio/status        PASS/FAIL
  ☐ /api/usb/devices         PASS/FAIL
  ☐ Auto-refresh works       PASS/FAIL

Phase 3: Controls
  ☐ Sample rate works        PASS/FAIL
  ☐ Buffer size works        PASS/FAIL
  ☐ Restart button works     PASS/FAIL
  ☐ Test button works        PASS/FAIL
  ☐ Info button works        PASS/FAIL

Phase 4: Responsive
  ☐ Desktop (1400px)         PASS/FAIL
  ☐ Tablet (768px)           PASS/FAIL
  ☐ Mobile (375px)           PASS/FAIL

Phase 5: Error Handling
  ☐ No console errors        PASS/FAIL
  ☐ All requests succeed     PASS/FAIL

═══════════════════════════════════════════
Overall Result: PASS / FAIL / WARNING
═══════════════════════════════════════════
```

---

## 🎯 PASS CRITERIA

**STEP 2 PASSES if:**
```
✅ All Pre-Flight checks pass
✅ Phase 1: At least section visible + specs show
✅ Phase 2: Both APIs respond
✅ Phase 3: At least 3 of 5 controls work
✅ Phase 4: Desktop layout correct
✅ Phase 5: No critical console errors
```

---

## ⏭️ NEXT STEPS

### If ALL TESTS PASS ✅
```
Congratulations! Step 2 is complete.

Next: Step 3 - Integration Testing & Optimization
```

### If SOME TESTS FAIL ⚠️
```
1. Note which tests failed
2. Open: STEP_2_TROUBLESHOOTING.md
3. Find matching issue (#1-8)
4. Follow solution steps
5. Retest that phase
6. When fixed, rerun full tests
```

### If CRITICAL FAILURE ❌
```
1. Check STEP_2_TROUBLESHOOTING.md
2. Review backend logs:
   tail -50 /var/log/map2-audio.log
3. Verify backend is actually running:
   curl http://localhost:5000/api/audio/status
4. Check network connectivity
5. See "Getting Help" section in troubleshooting
```

---

## 💡 QUICK REFERENCE

| If This... | Do This |
|-----------|---------|
| Backend not responding | Start it: `python3 app/main.py` |
| HTML section not visible | Clear cache: Ctrl+Shift+Delete |
| Button doesn't work | Check DevTools Console for errors |
| Mobile layout broken | Refresh: Ctrl+Shift+R |
| Tests seem slow | Check Network tab for request times |

---

## 📞 GETTING HELP

### Common Issues

**"Connection refused"**
→ Backend not running. Start it first.

**"Section not visible"**
→ Clear browser cache (Ctrl+Shift+Delete)

**"Specs show dash (-)"**
→ API not responding. Check backend running.

**"Buttons don't work"**
→ Check F12 Console for JavaScript errors

**"Mobile layout wrong"**
→ Refresh page with Ctrl+Shift+R

---

## ✨ TESTING COMPLETE

Once you've completed all phases:

```
Take a screenshot of:
1. Dashboard with Audio Interface visible
2. DevTools Network tab showing API calls
3. Browser at different viewport sizes

Save these as proof of testing.
```

---

**Status**: Ready to execute tests
**Duration**: 30 minutes to complete all phases
**Tools Needed**: Browser + DevTools (F12)
**Success Rate**: 90%+ on first attempt

**Ready to begin testing?** 🚀

Start with Pre-Flight Check above!
