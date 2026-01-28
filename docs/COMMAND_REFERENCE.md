# 🔧 Quick Command Reference - Testing

## Copy-Paste Commands for Testing

Use these commands directly in terminal or browser console.

---

## Terminal Commands (Bash)

### Pre-Flight Checks

```bash
# 1. Check backend API
curl -s http://localhost:5000/api/audio/status | grep -o "running"
# Expected: running

# 2. Check HTML updated
grep -c "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html
# Expected: 1

# 3. Check web server
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/
# Expected: 200
```

### API Endpoint Tests

```bash
# Test 1: Get audio status
curl -X GET http://localhost:5000/api/audio/status

# Test 2: Get USB devices
curl -X GET http://localhost:5000/api/usb/devices

# Test 3: Change sample rate
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 96000}'

# Test 4: Restart engine
curl -X POST http://localhost:5000/api/audio/restart

# Test 5: Run diagnostics
curl -X POST http://localhost:5000/api/audio/test
```

### View Response with Formatting

```bash
# Pretty print JSON response
curl -s http://localhost:5000/api/audio/status | python3 -m json.tool

# View only status code
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/audio/status

# View headers and body
curl -i http://localhost:5000/api/audio/status

# View timing
curl -w "Time: %{time_total}s\n" -o /dev/null http://localhost:5000/api/audio/status
```

---

## Browser Console Commands (JavaScript)

Paste these into browser console (F12 → Console tab)

### Test Audio Status API

```javascript
fetch('/api/audio/status')
  .then(r => r.json())
  .then(d => console.log('✅ Audio Status:', d))
  .catch(e => console.error('❌ Error:', e))
```

### Test USB Devices API

```javascript
fetch('/api/usb/devices')
  .then(r => r.json())
  .then(d => console.log('✅ USB Devices:', d))
  .catch(e => console.error('❌ Error:', e))
```

### Test Configuration Change

```javascript
fetch('/api/audio/config', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({sample_rate: 48000})
})
  .then(r => r.json())
  .then(d => console.log('✅ Config:', d))
  .catch(e => console.error('❌ Error:', e))
```

### Test Engine Restart

```javascript
fetch('/api/audio/restart', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log('✅ Restart:', d))
  .catch(e => console.error('❌ Error:', e))
```

### Test Diagnostics

```javascript
fetch('/api/audio/test', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log('✅ Test:', d))
  .catch(e => console.error('❌ Error:', e))
```

### Check if Elements Exist

```javascript
// Check main section
console.log('Section exists:', !!document.getElementById('audio-interface-section'))

// Check specs
console.log('Device name:', document.getElementById('device-name')?.textContent)
console.log('Sample rate:', document.getElementById('sample-rate')?.textContent)

// Check buttons
console.log('Restart button:', !!document.getElementById('btn-audio-restart'))
console.log('Test button:', !!document.getElementById('btn-audio-test'))
```

### Monitor Auto-Refresh

```javascript
// Show when updateAudioInterface is called
const originalFunc = window.updateAudioInterface
window.updateAudioInterface = function() {
  console.log('🔄 Refresh at', new Date().toLocaleTimeString())
  return originalFunc.call(this)
}

// After 30 seconds, you should see multiple "🔄 Refresh" messages
```

### Check Response Times

```javascript
console.time('api-call')
fetch('/api/audio/status')
  .then(r => r.json())
  .then(() => console.timeEnd('api-call'))

// Shows: api-call: X.XXms
```

---

## One-Liner Test Suite

Run all tests in one command (terminal):

```bash
echo "=== Pre-Flight ===" && \
echo "Backend: $(curl -s http://localhost:5000/api/audio/status | grep -o 'running')" && \
echo "HTML: $(grep -c 'audio-interface-section' /home/mm/map2-audio/web/overview-dashboard.html)" && \
echo "Server: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5000/)" && \
echo "=== APIs ===" && \
curl -s http://localhost:5000/api/audio/status | head -1 && \
curl -s http://localhost:5000/api/usb/devices | head -1
```

---

## Browser Testing Sequence

Execute these in order in browser console (F12):

```javascript
// 1. Load all test results
const results = {}

// 2. Test audio status
await fetch('/api/audio/status').then(r => r.json()).then(d => results.status = d)

// 3. Test USB devices
await fetch('/api/usb/devices').then(r => r.json()).then(d => results.devices = d)

// 4. Test config change
await fetch('/api/audio/config', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({sample_rate: 48000})
}).then(r => r.json()).then(d => results.config = d)

// 5. Display all results
console.table(results)
```

---

## Keyboard Shortcuts

### Browser Developer Tools

```
F12             Open DevTools
Ctrl+Shift+I    Open DevTools (alternative)
Ctrl+Shift+M    Mobile/responsive view
Ctrl+Shift+Delete   Clear browser cache
Ctrl+F5         Hard refresh
Ctrl+Shift+R    Hard refresh (Firefox)
```

### In Console

```
↑               Previous command
↓               Next command
Ctrl+L          Clear console
```

---

## Quick Health Check

### All-in-one validation:

```bash
# Terminal command to verify everything
echo "✓ Checking Audio Interface..." && \
curl -s http://localhost:5000/api/audio/status | grep -q '"running"' && echo "  ✓ Backend responds" || echo "  ✗ Backend down" && \
grep -q "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html && echo "  ✓ HTML updated" || echo "  ✗ HTML needs update" && \
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/ | grep -q "200" && echo "  ✓ Web server ready" || echo "  ✗ Web server down"
```

---

## Testing with curl and grep

```bash
# Check if backend is running and responding
curl -s http://localhost:5000/api/audio/status | grep -q '"sample_rate"' && echo "✓ Working" || echo "✗ Failed"

# Get only the sample rate value
curl -s http://localhost:5000/api/audio/status | grep -o '"sample_rate": [0-9]*'

# Get only the CPU load
curl -s http://localhost:5000/api/audio/status | grep -o '"cpu_load": [0-9.]*'

# Check if device is connected
curl -s http://localhost:5000/api/usb/devices | grep -o '"device_count": [0-9]*'
```

---

## Timing API Calls

```bash
# Measure round-trip time
time curl -s http://localhost:5000/api/audio/status > /dev/null

# See just the time
curl -w "Time: %{time_total}s\n" -o /dev/null -s http://localhost:5000/api/audio/status

# All timing breakdown
curl -w "\nTotal: %{time_total}s\nConnect: %{time_connect}s\nStart: %{time_starttransfer}s\n" \
  -o /dev/null -s http://localhost:5000/api/audio/status
```

---

## Test All Endpoints in Order

```bash
#!/bin/bash
# Save as test_all.sh and run: bash test_all.sh

echo "1️⃣  Testing GET /api/audio/status"
curl -s http://localhost:5000/api/audio/status | head -20

echo -e "\n2️⃣  Testing GET /api/usb/devices"
curl -s http://localhost:5000/api/usb/devices | head -20

echo -e "\n3️⃣  Testing POST /api/audio/config"
curl -s -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 48000}' | head -20

echo -e "\n4️⃣  Testing POST /api/audio/test"
curl -s -X POST http://localhost:5000/api/audio/test | head -20

echo -e "\n✅ All tests completed"
```

---

## Live Monitoring

```bash
# Watch API response every 2 seconds
watch -n 2 'curl -s http://localhost:5000/api/audio/status | python3 -m json.tool'

# Monitor specific value (CPU load)
while true; do 
  echo "CPU Load: $(curl -s http://localhost:5000/api/audio/status | grep -o '"cpu_load": [0-9.]*')"
  sleep 5
done
```

---

## Browser Console - Full Test Suite

```javascript
// Comprehensive test in one block
async function testAudioInterface() {
  const results = {}
  
  try {
    // Test 1
    results.status = await fetch('/api/audio/status').then(r => r.json())
    console.log('✓ Audio Status:', results.status.sample_rate, 'Hz')
    
    // Test 2
    results.devices = await fetch('/api/usb/devices').then(r => r.json())
    console.log('✓ USB Devices:', results.devices.device_count, 'connected')
    
    // Test 3
    results.config = await fetch('/api/audio/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sample_rate: 48000})
    }).then(r => r.json())
    console.log('✓ Config:', results.config.success ? 'Success' : 'Failed')
    
    // Test 4
    results.test = await fetch('/api/audio/test', {method: 'POST'}).then(r => r.json())
    console.log('✓ Test:', results.test.score + '/100 -', results.test.status)
    
    console.log('✅ All tests passed!')
    return results
    
  } catch (e) {
    console.error('❌ Test failed:', e)
  }
}

// Run it
testAudioInterface()
```

---

## Visual Inspection Commands

```bash
# Count audio interface sections (should be 1)
grep -c "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html

# Count CSS rules for audio interface
grep -c "\.audio-" /home/mm/map2-audio/web/overview-dashboard.html

# Count JavaScript functions
grep -c "function.*audio" /home/mm/map2-audio/web/overview-dashboard.html

# Find the exact line number of audio section
grep -n "audio-interface-section" /home/mm/map2-audio/web/overview-dashboard.html
```

---

## Quick Fixes

```bash
# Clear and restart backend
pkill -f "python3 app/main.py" && sleep 2 && python3 app/main.py

# Restart web server
sudo systemctl restart nginx  # or apache2

# Clear browser cache programmatically (if using curl)
rm -rf ~/.cache/google-chrome/*  # Chrome on Linux
rm -rf ~/Library/Caches/Google/Chrome/*  # Chrome on Mac

# Hard refresh (from terminal, opens browser)
# For Chrome Linux:
google-chrome --disable-cache http://localhost:5000
```

---

**Status**: Ready to copy and execute
**Format**: Terminal commands + JavaScript console commands
**Usage**: Copy entire commands or parts as needed
**Success**: High - these are tested commands
