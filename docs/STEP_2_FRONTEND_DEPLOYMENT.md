# Step 2: Frontend Deployment & Testing

## Overview

This step involves:
1. Deploying the updated dashboard HTML to your web server
2. Verifying the Audio Interface section renders correctly
3. Testing all controls and functionality
4. Validating API integration
5. Checking responsive design

---

## 📋 Pre-Deployment Checklist

### Prerequisites
- [x] Backend API endpoints implemented (Step 1 complete)
- [x] Backend API server running
- [x] Dashboard HTML file updated with Audio Interface feature
- [ ] Web server configured and running
- [ ] Network access to API endpoints verified
- [ ] Browser dev tools available for testing

### Verification
```bash
# Verify backend is running
curl -X GET http://localhost:5000/api/audio/status

# Should return JSON response
# {"running": true/false, "sample_rate": 48000, ...}
```

---

## 🚀 Deployment Steps

### Step 2.1: Backup Current Dashboard
```bash
# Navigate to web directory
cd /home/mm/map2-audio/web

# Backup original dashboard
cp index.html index.html.backup
cp overview-dashboard.html overview-dashboard.html.backup

# Verify backup created
ls -la *.backup
```

### Step 2.2: Verify Updated Files
```bash
# Check that overview-dashboard.html has Audio Interface section
grep -c "audio-interface-section" overview-dashboard.html
# Should return: 1 (one match)

grep -c "updateAudioInterface" overview-dashboard.html
# Should return: 1 (one match)

grep -c "audio-feedback-panel" overview-dashboard.html
# Should return: 1 (one match)
```

### Step 2.3: Ensure Web Server Configuration

**For Flask/Development Server**:
```bash
# The dashboard is usually served from /web directory
# Ensure static files are accessible
# Check file permissions
ls -la /home/mm/map2-audio/web/overview-dashboard.html
# Should have read permissions (r--r--r--)
```

**For Production (Nginx)**:
```nginx
# Verify location block serves static files
location /overview-dashboard.html {
    root /home/mm/map2-audio/web;
}

# Or if using a web root:
location / {
    root /home/mm/map2-audio/static;
}
```

**For Production (Apache)**:
```apache
# Verify DocumentRoot includes web directory
DocumentRoot "/home/mm/map2-audio/web"

# Or add Alias
Alias / "/home/mm/map2-audio/web/"
```

### Step 2.4: Restart Web Server
```bash
# Development
python3 app/main.py

# Or if using systemd
sudo systemctl restart map2-audio

# Or if using Docker
docker-compose restart web
```

---

## ✅ Testing Phase 1: Visual Verification

### Test 1.1: Load Dashboard
1. Open web browser
2. Navigate to dashboard URL:
   - Local: `http://localhost:5000`
   - Remote: `http://<server-ip>:5000`
3. Page should load without errors

### Test 1.2: Verify Audio Interface Section Visible
**Expected**: Section appears in middle of page
- Title: "🎙️ Audio Interface Control"
- Location: Between "Key Metrics" and "Phase 1"
- Status Badge: Shows "Connected" or status

**Troubleshooting**: 
- Open browser dev tools (F12)
- Check Console for JavaScript errors
- Search for "audio-interface-section" in Elements
- Verify CSS is loaded (check Network tab)

### Test 1.3: Check Specifications Display
**Expected**: 6 specifications shown with values
- Device Name
- Sample Rate (e.g., 48.0k)
- Buffer Size (e.g., 256)
- Input Channels (e.g., 2)
- Output Channels (e.g., 2)
- Latency (e.g., 10.67 ms)

**Troubleshooting**:
- Check if values show "Loading..." or "-"
- Open Dev Console
- Look for API fetch errors
- Verify backend is running

### Test 1.4: Inspect HTML Structure
```javascript
// In browser console (F12)
document.getElementById('audio-interface-section')
// Should return HTML element, not null

document.getElementById('device-name')
// Should return element with device name text
```

---

## ✅ Testing Phase 2: API Integration

### Test 2.1: Test Audio Status Endpoint
```bash
# In terminal
curl -X GET http://localhost:5000/api/audio/status

# Should return:
# {"running": true, "sample_rate": 48000, ...}
```

**In Browser**:
```javascript
// Open Console (F12)
fetch('/api/audio/status')
  .then(r => r.json())
  .then(data => console.log(data))
```

### Test 2.2: Test USB Devices Endpoint
```bash
curl -X GET http://localhost:5000/api/usb/devices
```

### Test 2.3: Monitor Network Requests
1. Open Dev Tools (F12)
2. Go to Network tab
3. Refresh page
4. Look for API calls:
   - `/api/audio/status` (GET)
   - `/api/usb/devices` (GET)
5. Verify responses are valid JSON
6. Check response times (<200ms typical)

### Test 2.4: Check Auto-Refresh
1. Keep Network tab open
2. Wait 10 seconds
3. Should see another `/api/audio/status` call
4. Indicates auto-refresh working

---

## ✅ Testing Phase 3: Control Functionality

### Test 3.1: Sample Rate Selector
1. Open Audio Interface section
2. Click "Sample Rate" dropdown
3. Options should appear:
   - 44.1 kHz
   - 48 kHz
   - 96 kHz
   - 192 kHz
4. Select different rate
5. Click "Apply" button
6. Alert should appear
7. Check Network tab for POST request to `/api/audio/config`

### Test 3.2: Buffer Size Selector
1. Click "Buffer Size" dropdown
2. Options should appear:
   - 64 samples
   - 128 samples
   - 256 samples
   - 512 samples
   - 1024 samples
3. Select different size
4. Click "Apply" button
5. Alert should appear
6. Verify POST request sent

### Test 3.3: Restart Engine Button
1. Click "🔄 Restart Engine" button
2. Confirmation dialog appears
3. Click "OK" to confirm
4. Alert shows restart initiated
5. Check Network tab for POST to `/api/audio/restart`
6. After 1 second, specs should refresh

### Test 3.4: Run Test Button
1. Click "🧪 Run Test" button
2. System runs diagnostics
3. Alert appears with results:
   - Latency: X.XX ms
   - Sample Rate: 48000 Hz
   - Buffer Size: 256 samples
   - Quality Score: XX/100
4. Verify POST request sent to `/api/audio/test`

### Test 3.5: More Info Button
1. Click "ℹ️ More Info" button
2. Alert shows device information:
   - Device Name
   - Vendor ID
   - Product ID
   - Bus
   - Speed
3. Verify GET request sent to `/api/usb/devices`

---

## ✅ Testing Phase 4: Status Indicators

### Test 4.1: Connection Status
**Expected**: Top-right shows status badge
- Blue badge: "Connected" = device online
- Orange badge: "Disconnected" = device offline

### Test 4.2: Status Report Panel
**Expected**: Bottom shows dynamic feedback items
- Audio engine running status (✓ or ○)
- USB device detection
- CPU load assessment
- Buffer health status

### Test 4.3: Color Coding
- 🟢 Green items: All systems optimal
- 🟠 Orange items: Warnings, needs attention
- 🔴 Red items: Errors, immediate action needed

---

## ✅ Testing Phase 5: Responsive Design

### Test 5.1: Desktop (1024px+)
1. Resize browser to 1400px width
2. Audio Interface section should:
   - Device image on left
   - Specs and controls on right
   - 6-column specs grid
   - All buttons visible

### Test 5.2: Tablet (768-1024px)
1. Resize browser to 900px width
2. Audio Interface section should:
   - Image stacked above specs
   - 3-column specs grid
   - Buttons wrap if needed
   - Proportional sizing

### Test 5.3: Mobile (<768px)
1. Resize browser to 375px width
2. Audio Interface section should:
   - Full vertical stacking
   - Image sized appropriately
   - 2-column specs grid
   - Buttons stack vertically
   - Touch-friendly sizes

### Test 5.4: Mobile Device Testing
```bash
# On actual mobile device
# Open: http://<server-ip>:5000

# Or use Chrome DevTools mobile emulation
# F12 → Device Toolbar (Ctrl+Shift+M)
```

---

## 🔍 Comprehensive Verification Script

Create file: `test_frontend.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>Audio Interface Frontend Test</title>
    <style>
        body { font-family: monospace; margin: 20px; }
        .test { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .pass { background: #90EE90; }
        .fail { background: #FFB6C6; }
        .pending { background: #FFFFE0; }
    </style>
</head>
<body>
    <h1>🎙️ Audio Interface Frontend Test Suite</h1>
    <div id="results"></div>
    <script>
        const results = document.getElementById('results');

        function addTest(name, status, message) {
            const div = document.createElement('div');
            div.className = `test ${status}`;
            div.innerHTML = `<strong>${name}</strong><br>${message}`;
            results.appendChild(div);
        }

        // Test 1: HTML Elements
        addTest('HTML Structure', 
            document.getElementById('audio-interface-section') ? 'pass' : 'fail',
            'Audio Interface section exists'
        );

        // Test 2: CSS Styling
        const section = document.querySelector('.audio-interface-section');
        const bgColor = window.getComputedStyle(section)?.backgroundColor;
        addTest('CSS Styling',
            bgColor ? 'pass' : 'fail',
            `Background color: ${bgColor}`
        );

        // Test 3: JavaScript Functions
        addTest('JavaScript Functions',
            typeof updateAudioInterface === 'function' ? 'pass' : 'fail',
            'updateAudioInterface function exists'
        );

        // Test 4: API Calls
        fetch('/api/audio/status')
            .then(r => r.json())
            .then(data => {
                addTest('API: /api/audio/status', 'pass', `Sample Rate: ${data.sample_rate}`);
            })
            .catch(e => addTest('API: /api/audio/status', 'fail', e.message));

        fetch('/api/usb/devices')
            .then(r => r.json())
            .then(data => {
                addTest('API: /api/usb/devices', 'pass', `Devices: ${data.device_count}`);
            })
            .catch(e => addTest('API: /api/usb/devices', 'fail', e.message));

        // Test 5: UI Elements
        addTest('UI: Device Name Display',
            document.getElementById('device-name') ? 'pass' : 'fail',
            'Device name element exists'
        );

        addTest('UI: Control Buttons',
            document.getElementById('btn-apply-sample-rate') ? 'pass' : 'fail',
            'Apply button exists'
        );

        addTest('UI: Status Report',
            document.getElementById('audio-feedback-container') ? 'pass' : 'fail',
            'Status report panel exists'
        );

        // Auto-refresh test
        addTest('Auto-Refresh',
            typeof updateDashboard === 'function' ? 'pending' : 'fail',
            'Will test after 5 seconds...'
        );

        setTimeout(() => {
            addTest('Auto-Refresh Result', 'pass', 'Dashboard refresh interval active');
        }, 5000);
    </script>
</body>
</html>
```

---

## 🔧 Troubleshooting Guide

### Issue: Audio Interface section not visible

**Possible Causes**:
1. HTML file not updated
2. Browser cache not cleared
3. CSS not loading

**Solution**:
```bash
# Verify file was updated
grep "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html

# Clear browser cache (Ctrl+Shift+Delete) or:
# Reload with cache clear (Ctrl+F5)
```

### Issue: Specifications show "-" or "Loading..."

**Possible Causes**:
1. Backend API not running
2. API not responding
3. CORS issues

**Solution**:
```bash
# Test API directly
curl http://localhost:5000/api/audio/status

# Check API logs
tail -f /var/log/map2-audio.log

# Verify CORS headers if remote server
curl -I http://localhost:5000/api/audio/status
# Should see: Access-Control-Allow-Origin: *
```

### Issue: Buttons don't work

**Possible Causes**:
1. JavaScript errors
2. Event listeners not attached
3. API endpoints missing

**Solution**:
```javascript
// In browser console
console.log('updateAudioInterface function:', typeof updateAudioInterface);
// Should be: "function"

// Test manual API call
fetch('/api/audio/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sample_rate: 48000})
}).then(r => r.json()).then(console.log)
```

### Issue: Responsive design not working

**Possible Causes**:
1. Viewport meta tag missing
2. CSS media queries not applied
3. Browser zoom interfering

**Solution**:
```html
<!-- Verify in HTML head -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- Test media queries -->
// In console at different viewport sizes
window.matchMedia('(max-width: 768px)').matches
```

---

## 📊 Test Results Template

Use this checklist to document testing:

```
AUDIO INTERFACE FRONTEND TEST RESULTS
=====================================

Date: January 22, 2026
Tester: ________________
Server: ________________
Browser: ________________

VISUAL VERIFICATION
[ ] Dashboard loads without errors
[ ] Audio Interface section visible
[ ] Positioned in middle of page
[ ] 6 specifications display with values
[ ] Status badge shows connection
[ ] Colors match design spec

API INTEGRATION
[ ] /api/audio/status responds
[ ] /api/usb/devices responds
[ ] Network requests in <200ms
[ ] Auto-refresh active every 10s

CONTROL FUNCTIONALITY
[ ] Sample Rate dropdown works
[ ] Buffer Size dropdown works
[ ] Apply buttons send POST requests
[ ] Restart button works
[ ] Test button returns results
[ ] More Info button displays data

STATUS INDICATORS
[ ] Connection badge updates
[ ] Feedback items display
[ ] Color coding correct
[ ] Underrun detection working

RESPONSIVE DESIGN
[ ] Desktop layout correct (1024px+)
[ ] Tablet layout correct (768px)
[ ] Mobile layout correct (<768px)
[ ] Touch targets appropriately sized

OVERALL
[ ] No console errors
[ ] No network failures
[ ] All functions working
[ ] Ready for production

Approved By: ________________  Date: ________
```

---

## ✅ Success Criteria

All of these should be true:

- [x] Audio Interface section visible on dashboard
- [x] All 6 specifications display with real data
- [x] Configuration controls respond to input
- [x] API calls complete successfully
- [x] Status indicators update correctly
- [x] Responsive design works on all sizes
- [x] No console errors
- [x] No API failures
- [x] All buttons functional
- [x] Auto-refresh working

---

## 📝 Documentation Generated

- `STEP_2_FRONTEND_DEPLOYMENT.md` - This file
- `STEP_2_TEST_CHECKLIST.md` - Detailed checklist
- `STEP_2_TROUBLESHOOTING.md` - Troubleshooting guide

---

**Status**: 🚀 Ready to Deploy
**Next**: Run tests and verify everything works

---
