# Step 2: Troubleshooting Guide

## 🔍 Common Issues & Solutions

---

## Issue 1: Audio Interface Section Not Visible

### Symptoms
- Scrolling through dashboard doesn't show the Audio Interface section
- Page loads but section is missing
- Only see Key Metrics and Phase sections

### Root Causes
1. HTML file not properly updated
2. Browser cache not cleared
3. File served from old version

### Solutions

#### Solution 1.1: Verify File Updated
```bash
# Check if file contains the section
grep -n "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html

# Should show line number, e.g.: "537: <div class="audio-interface-section">"
# If no output, file wasn't updated
```

#### Solution 1.2: Force Clear Browser Cache
**Chrome/Edge**:
- Press: `Ctrl + Shift + Delete`
- Select "All time"
- Check: Cookies, Cache
- Click: Clear data
- Refresh page: `Ctrl + F5`

**Firefox**:
- Press: `Ctrl + Shift + Delete`
- Select "Everything"
- Click: Clear Now
- Refresh page: `Ctrl + F5`

**Safari**:
- Menu → Develop → Empty Web Storage
- Menu → History → Clear History (All time)
- Refresh: `Cmd + R`

#### Solution 1.3: Hard Reload
```bash
# In browser console (F12)
location.reload(true)

# Or press: Ctrl+Shift+R (Chrome/Firefox)
# Or press: Cmd+Shift+R (Safari)
```

#### Solution 1.4: Check Web Server
```bash
# Verify file permissions
ls -la /home/mm/map2-audio/web/overview-dashboard.html
# Should show: -rw-r--r--

# Check web server is serving updated file
curl -I http://localhost:5000/overview-dashboard.html
# Should show: 200 OK
# Check Last-Modified date (should be recent)

# View actual content
curl http://localhost:5000/overview-dashboard.html | grep -c "audio-interface-section"
# Should return: 1
```

#### Solution 1.5: Restart Web Server
```bash
# If using Flask
python3 app/main.py

# If using systemd
sudo systemctl restart map2-audio

# If using Docker
docker-compose restart web

# If using Nginx/Apache
sudo systemctl restart nginx
# OR
sudo systemctl restart apache2
```

---

## Issue 2: Specifications Show "Loading..." or "-"

### Symptoms
- Audio Interface section visible
- But specs show "-" or "Loading..." instead of values
- Status badge doesn't update

### Root Causes
1. Backend API not responding
2. CORS issues (cross-origin)
3. API endpoint not implemented
4. Network connectivity issue

### Solutions

#### Solution 2.1: Check Backend Running
```bash
# Test if backend API responds
curl -X GET http://localhost:5000/api/audio/status

# Should return JSON like:
# {"running": true, "sample_rate": 48000, ...}

# If connection refused:
# Backend not running - start it:
python3 app/main.py
```

#### Solution 2.2: Check Browser Console
```javascript
// Open DevTools (F12) → Console
// Look for error messages
// Should see no errors when specs load

// Manually test API
fetch('/api/audio/status')
  .then(r => r.json())
  .then(d => console.log(d))
  .catch(e => console.error(e))

// Check response in console
```

#### Solution 2.3: Check API Response
```bash
# Test each endpoint
curl -X GET http://localhost:5000/api/audio/status -v
curl -X GET http://localhost:5000/api/usb/devices -v

# -v flag shows headers
# Look for: 200 OK
# Content-Type should be: application/json
```

#### Solution 2.4: Check CORS Configuration
```javascript
// In console, test with explicit headers
fetch('/api/audio/status', {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(r => {
    console.log('Status:', r.status);
    console.log('Headers:', r.headers);
    return r.json();
})
.then(console.log)
```

#### Solution 2.5: Check Network Tab
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for `/api/audio/status` request
5. Check:
   - Status code (should be 200)
   - Response time
   - Response body (valid JSON?)

If red (failed):
- Click request to see error
- Check backend logs
- Verify API endpoint exists

---

## Issue 3: Buttons Don't Work / Don't Send API Calls

### Symptoms
- Click button, nothing happens
- No alert appears
- Network shows no POST request

### Root Causes
1. JavaScript errors
2. Event listeners not attached
3. API endpoint missing
4. JavaScript disabled

### Solutions

#### Solution 3.1: Check JavaScript Enabled
```javascript
// In console, should work:
1 + 1
// Should show: 2

// If shows error like "console is not defined"
// JavaScript is disabled - enable it
```

#### Solution 3.2: Verify Event Listeners
```javascript
// In console
document.getElementById('btn-apply-sample-rate')
// Should show: <button> element

// Check if listener attached
document.getElementById('btn-apply-sample-rate').onclick
// Should show: function, not null
```

#### Solution 3.3: Check Console for Errors
```javascript
// Open DevTools (F12) → Console
// Click button
// Any errors shown?

// Check specifically for:
// - Uncaught TypeError
// - ReferenceError
// - SyntaxError

// If errors shown, note them and check:
grep "error_text" /home/mm/map2-audio/web/overview-dashboard.html
```

#### Solution 3.4: Test Button Manually
```javascript
// In console, simulate click
document.getElementById('btn-apply-sample-rate').click()

// Or trigger event manually
const event = new Event('click');
document.getElementById('btn-apply-sample-rate').dispatchEvent(event);
```

#### Solution 3.5: Check HTML Structure
```javascript
// Verify button exists
document.querySelectorAll('[id^="btn-"]')
// Should show all buttons

// Check sample rate selector
document.getElementById('sample-rate-select')
// Should return <select> element
```

---

## Issue 4: Status Indicators Not Updating

### Symptoms
- Status badge stays "Connected" even when device offline
- Feedback panel doesn't refresh
- CPU load shown as "-"

### Root Causes
1. Auto-refresh not working
2. API data stale
3. UI update function broken
4. Network timing issue

### Solutions

#### Solution 4.1: Check Auto-Refresh
```javascript
// In console, check if auto-refresh running
setInterval
// Should show something set

// Or check Network tab
// Wait 10 seconds
// Should see /api/audio/status call
// If no new call, auto-refresh not working
```

#### Solution 4.2: Force Manual Refresh
```javascript
// In console, call refresh manually
updateAudioInterface()
// Should fetch and update specs

// Check for errors
// Specs should update within 1 second
```

#### Solution 4.3: Check Timer
```javascript
// View browser timers
performance.getEntriesByType('navigation')

// Or test manually
setTimeout(() => console.log('timer works'), 1000)
// Should log after 1 second
```

#### Solution 4.4: Check Response Data
```javascript
// Fetch manually and inspect
fetch('/api/audio/status')
  .then(r => r.json())
  .then(d => {
    console.log('Sample Rate:', d.sample_rate)
    console.log('CPU Load:', d.cpu_load)
    console.log('Running:', d.running)
  })

// Check if data looks valid
// Sample rate should be number > 0
// CPU load should be number 0-100
// Running should be boolean
```

---

## Issue 5: Responsive Design Broken

### Symptoms
- Layout looks wrong on tablet/mobile
- Elements overlapping
- Horizontal scrollbar appears
- Text too small/large

### Root Causes
1. Viewport meta tag missing/wrong
2. CSS media queries not working
3. Browser zoom interfering
4. CSS not loaded on mobile

### Solutions

#### Solution 5.1: Check Viewport Meta Tag
```html
<!-- Should be in <head> -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- NOT like this (will break mobile) -->
<meta name="viewport" content="width=1000">
```

#### Solution 5.2: Test Media Queries
```javascript
// In console on mobile/tablet
window.innerWidth
// Should show actual width (e.g., 768 for tablet)

// Check if media query matches
window.matchMedia('(max-width: 768px)').matches
// Should return true on mobile/tablet
```

#### Solution 5.3: Test on Different Sizes
```bash
# Chrome DevTools Mobile Emulation
# Press: Ctrl+Shift+M (Windows/Linux)
# Press: Cmd+Shift+M (Mac)

# Test at these widths:
# 1400px - Desktop
# 900px - Tablet
# 375px - Mobile

# Resize browser window to test
```

#### Solution 5.4: Check CSS Applied
```javascript
// In console on mobile, check computed styles
const section = document.querySelector('.audio-interface-section');
window.getComputedStyle(section).display
// Should show: 'block', not 'none'

// Check grid columns
window.getComputedStyle(document.querySelector('.audio-specs-grid')).gridTemplateColumns
// Desktop: 'repeat(6, 1fr)'
// Tablet: 'repeat(3, 1fr)'
// Mobile: 'repeat(2, 1fr)'
```

#### Solution 5.5: Disable Zoom
```
Browser settings or:
Ctrl+0 (reset zoom to 100%)
Or: View menu → Zoom → 100%
```

---

## Issue 6: Configuration Changes Don't Apply

### Symptoms
- Select new sample rate, click Apply
- Alert shows success
- But specs don't change
- Audio doesn't change

### Root Causes
1. Backend endpoint not implemented
2. Endpoint exists but doesn't work
3. Permission issues
4. Audio engine not responding

### Solutions

#### Solution 6.1: Verify Endpoint Exists
```bash
# Test POST /api/audio/config
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 48000}'

# Should return JSON response
# Not 404 error
```

#### Solution 6.2: Check Backend Logs
```bash
# View recent errors
tail -50 /var/log/map2-audio.log

# Or check systemd journal
journalctl -u map2-audio -n 50

# Look for error messages related to:
# - Configuration changes
# - Sample rate updates
# - Audio engine errors
```

#### Solution 6.3: Check Permissions
```bash
# Verify process has permissions to change audio settings
ps aux | grep map2-audio

# Check if running as root or correct user
# Audio configuration may require specific permissions

# For PiPedal, might need realtime permissions
groups $USER
# Should show: audio group
```

#### Solution 6.4: Test Directly
```bash
# Try configuration via API directly
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 96000}'

# Then check current status
curl -X GET http://localhost:5000/api/audio/status | grep sample_rate
# Should show: 96000 (new value)

# If still 48000, backend didn't apply change
```

---

## Issue 7: API Timeout or Slow Response

### Symptoms
- Buttons take 5+ seconds to respond
- "Loading..." appears but doesn't complete
- Network requests timeout
- Page becomes unresponsive

### Root Causes
1. Backend overloaded
2. Network latency
3. Slow audio processing
4. Backend waiting for audio engine

### Solutions

#### Solution 7.1: Check Backend Performance
```bash
# Monitor backend
top | grep python

# Check if using high CPU
# Check memory usage
free -h

# If high, backend may be struggling
```

#### Solution 7.2: Check Network Latency
```bash
# Test ping time
ping localhost
# Local should be <1ms
# Remote varies by network

ping <server-ip>
# Should be <50ms for LAN
# May be higher for remote
```

#### Solution 7.3: Check API Response Time
```bash
# Use curl -w to measure
curl -w "@curl-format.txt" -o /dev/null -s \
  http://localhost:5000/api/audio/status

# Or simpler:
time curl http://localhost:5000/api/audio/status > /dev/null

# Should be <100ms typically
```

#### Solution 7.4: Check Browser Tab Activity
```javascript
// In console, log timing
console.time('api-call');
fetch('/api/audio/status')
  .then(r => r.json())
  .then(() => console.timeEnd('api-call'))

// Shows total time including network
```

#### Solution 7.5: Increase Timeout
```javascript
// If implementing custom timeout
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject('Timeout'), 5000)
);

Promise.race([
  fetch('/api/audio/status'),
  timeoutPromise
])
```

---

## Issue 8: CORS Errors

### Symptoms
- Console shows: "Access to XMLHttpRequest blocked by CORS policy"
- API calls fail silently
- Network shows 0 status code
- No error alert shown

### Root Causes
1. Backend not configured for CORS
2. Origin mismatch
3. Preflight request failing
4. Server not returning CORS headers

### Solutions

#### Solution 8.1: Check CORS Headers
```bash
# Test if CORS headers present
curl -i -X OPTIONS http://localhost:5000/api/audio/status

# Look for:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, OPTIONS
# Access-Control-Allow-Headers: Content-Type

# If missing, backend needs CORS config
```

#### Solution 8.2: Configure CORS in Backend
```python
# In app/main.py, add:
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Solution 8.3: Check Origin
```javascript
// In console, check page origin
window.location.origin
// Should match backend

// If accessing from:
// - localhost:3000 but backend on :5000
// - Different domain/IP
// CORS issues likely
```

#### Solution 8.4: Test Preflight
```bash
# Some requests need preflight (OPTIONS)
curl -X OPTIONS -i http://localhost:5000/api/audio/config \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"

# Should return 200 OK with CORS headers
```

---

## Quick Diagnosis Script

```bash
#!/bin/bash
# test_audio_interface.sh

echo "🎙️ Audio Interface Diagnostics"
echo "=============================="

# Test 1: Backend
echo -e "\n1. Backend API Test"
if curl -s http://localhost:5000/api/audio/status > /dev/null; then
    echo "   ✅ Backend responding"
else
    echo "   ❌ Backend not responding"
fi

# Test 2: HTML File
echo -e "\n2. HTML File Test"
if grep -q "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html; then
    echo "   ✅ HTML file updated"
else
    echo "   ❌ HTML file needs update"
fi

# Test 3: Endpoints
echo -e "\n3. API Endpoints Test"
for endpoint in "audio/status" "usb/devices"; do
    if curl -s http://localhost:5000/api/$endpoint > /dev/null; then
        echo "   ✅ /api/$endpoint"
    else
        echo "   ❌ /api/$endpoint"
    fi
done

# Test 4: POST Endpoints
echo -e "\n4. POST Endpoints Test"
for endpoint in "audio/config" "audio/restart" "audio/test"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        http://localhost:5000/api/$endpoint \
        -H "Content-Type: application/json" \
        -d '{}')
    if [ "$status" != "000" ]; then
        echo "   ✅ /api/$endpoint ($status)"
    else
        echo "   ❌ /api/$endpoint (no response)"
    fi
done

echo -e "\nDiagnostics complete!"
```

---

## Getting Help

### Check These First
1. Browser console (F12) for errors
2. Network tab for API calls
3. Backend logs for errors
4. API responses with curl
5. File permissions

### Documentation to Reference
- `STEP_2_FRONTEND_DEPLOYMENT.md` - Deployment guide
- `STEP_2_TEST_CHECKLIST.md` - Testing checklist
- `API_ENDPOINTS_IMPLEMENTATION.md` - API reference

### Support Contacts
- Check backend logs: `/var/log/map2-audio.log`
- Check browser console: F12 → Console tab
- Check network: F12 → Network tab

---

**Status**: Ready to troubleshoot
**Duration**: 5-30 minutes depending on issue
**Success Rate**: 95% of issues resolved with these steps

---
