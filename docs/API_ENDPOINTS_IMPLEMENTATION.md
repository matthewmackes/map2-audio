# OpenAPI/Swagger Reference

For a full, always up-to-date list of all API endpoints, see the generated OpenAPI summary in [API_OPENAPI_GENERATED.md](API_OPENAPI_GENERATED.md) or visit the live docs at http://localhost:8080/docs when the server is running.

## Main Engine Endpoints (from /app/routes/engine.py)

- **GET /api/engine/status**: Get audio engine status
- **GET /api/engine/version**: Get audio engine version
- **POST /api/engine/initialize**: Initialize audio engine
- **POST /api/engine/shutdown**: Shutdown audio engine
- **POST /api/engine/audio/start**: Start audio processing
- **POST /api/engine/audio/stop**: Stop audio processing
- **GET /api/engine/audio/status**: Get audio processing status
- **GET /api/engine/plugins**: List all plugins
- **GET /api/engine/plugins/{uri}**: Get plugin info
- **POST /api/engine/plugins/load**: Load plugin
- **POST /api/engine/plugins/unload/{instance_id}**: Unload plugin
- **GET /api/engine/chain**: Get plugin chain
- **POST /api/engine/chain/reorder**: Reorder chain
- **POST /api/engine/parameter**: Set plugin parameter
- **GET /api/engine/parameter/{instance_id}/{param_name}**: Get plugin parameter value
- **POST /api/engine/bypass**: Set plugin bypass state
- **GET /api/engine/snapshots**: List snapshots
- **POST /api/engine/snapshots/load**: Load snapshot
- **GET /api/engine/snapshot/current**: Get current snapshot
- **GET /api/engine/midi/devices**: List MIDI devices
- **POST /api/engine/midi/enable**: Enable/disable MIDI
- **GET /api/engine/vu**: Get master VU levels
- **GET /api/engine/vu/plugins**: Get per-plugin VU levels

# Audio Interface API Endpoints - Testing Guide

## API Endpoints Implemented

All 5 required endpoints for the Audio Interface feature are now implemented:

### ✅ **ENDPOINT 1: GET /api/audio/status**
**Purpose**: Retrieve current audio engine configuration
**When to use**: Page load, periodic refresh, after configuration changes

**Request**:
```bash
curl -X GET http://localhost:5000/api/audio/status
```

**Response (Success)**:
```json
{
  "running": true,
  "sample_rate": 48000,
  "buffer_size": 256,
  "cpu_load": 25.5,
  "engine": "pipedal",
  "version": "1.9.21",
  "plugin_count": 5,
  "active_pedalboard": "My Effects Chain",
  "available": true
}
```

**Response (Unavailable)**:
```json
{
  "running": false,
  "error": "PiPedal engine not available",
  "sample_rate": 0,
  "buffer_size": 0,
  "cpu_load": 0.0,
  "engine": "pipedal",
  "available": false
}
```

---

### ✅ **ENDPOINT 2: GET /api/usb/devices**
**Purpose**: Retrieve USB audio device information
**When to use**: Device detection, status verification

**Request**:
```bash
curl -X GET http://localhost:5000/api/usb/devices
```

**Response (Device Connected)**:
```json
{
  "hotone_detected": true,
  "device_count": 1,
  "primary_device": {
    "name": "Jogg USB Audio",
    "vendor_id": "1234",
    "product_id": "5678",
    "bus": "001",
    "device": "002",
    "speed": "USB 2.0",
    "is_connected": true,
    "alsa_card": "hw:1",
    "alsa_device": "hw:1,0",
    "sample_rate": 48000
  },
  "all_devices": [
    {
      "name": "Jogg USB Audio",
      "vendor_id": "1234",
      "product_id": "5678"
    }
  ],
  "recommendations": []
}
```

**Response (No Device)**:
```json
{
  "hotone_detected": false,
  "device_count": 0,
  "primary_device": null,
  "all_devices": [],
  "recommendations": [
    "No USB audio device detected",
    "Connect a Hotone or compatible USB audio interface"
  ]
}
```

---

### ✅ **ENDPOINT 3: POST /api/audio/config**
**Purpose**: Configure audio engine settings (sample rate, buffer size)
**When to use**: User changes configuration via dropdown

**Request - Change Sample Rate**:
```bash
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 96000}'
```

**Request - Change Buffer Size**:
```bash
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"buffer_size": 512}'
```

**Request - Change Both**:
```bash
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 48000, "buffer_size": 256}'
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Audio configuration updated",
  "updated_settings": {
    "sample_rate": 96000,
    "buffer_size": 512
  },
  "current_config": {
    "sample_rate": 96000,
    "buffer_size": 512,
    "cpu_load": 28.3
  }
}
```

**Response (Invalid Sample Rate)**:
```json
{
  "detail": "Unsupported sample rate. Must be one of: [44100, 48000, 96000, 192000]"
}
```

**Response (Invalid Buffer Size)**:
```json
{
  "detail": "Unsupported buffer size. Must be one of: [64, 128, 256, 512, 1024]"
}
```

**Supported Values**:
- Sample Rates: 44100, 48000, 96000, 192000 Hz
- Buffer Sizes: 64, 128, 256, 512, 1024 samples

---

### ✅ **ENDPOINT 4: POST /api/audio/restart**
**Purpose**: Restart the audio engine
**When to use**: User clicks "Restart Engine" button

**Request**:
```bash
curl -X POST http://localhost:5000/api/audio/restart
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Audio engine restarted",
  "running": true,
  "status": {
    "sample_rate": 48000,
    "buffer_size": 256,
    "cpu_load": 22.1
  }
}
```

**Response (Engine Unavailable)**:
```json
{
  "detail": "PiPedal engine not available"
}
```

**Response (Failed to Restart)**:
```json
{
  "detail": "Failed to restart audio engine"
}
```

---

### ✅ **ENDPOINT 5: POST /api/audio/test**
**Purpose**: Run audio interface diagnostics
**When to use**: User clicks "Run Test" button

**Request**:
```bash
curl -X POST http://localhost:5000/api/audio/test
```

**Response (Success)**:
```json
{
  "success": true,
  "latency_ms": 10.67,
  "sample_rate": 48000,
  "buffer_size": 256,
  "cpu_load": 25.5,
  "underruns": 0,
  "score": 95,
  "status": "healthy"
}
```

**Score Interpretation**:
- **80-100**: Healthy (Green) - Audio quality excellent
- **50-79**: Warning (Orange) - Audio quality acceptable but needs attention
- **0-49**: Critical (Red) - Audio quality poor, immediate action needed

**Quality Score Calculation**:
- Latency <5ms: +30 points
- Latency <10ms: +20 points
- Latency <20ms: +10 points
- Latency <40ms: +5 points
- CPU load <50%: +30 points
- CPU load <70%: +15 points
- CPU load <80%: +5 points
- No underruns: +30 points
- Some underruns: +10 points
- Engine running: +5 points

---

## Testing All Endpoints

### Complete Test Sequence

**Step 1: Check Status**
```bash
curl -X GET http://localhost:5000/api/audio/status
```

**Step 2: Check Devices**
```bash
curl -X GET http://localhost:5000/api/usb/devices
```

**Step 3: Change Sample Rate**
```bash
curl -X POST http://localhost:5000/api/audio/config \
  -H "Content-Type: application/json" \
  -d '{"sample_rate": 96000}'
```

**Step 4: Run Test**
```bash
curl -X POST http://localhost:5000/api/audio/test
```

**Step 5: Restart Engine**
```bash
curl -X POST http://localhost:5000/api/audio/restart
```

**Step 6: Verify New Status**
```bash
curl -X GET http://localhost:5000/api/audio/status
```

---

## Using Postman or Insomnia

### Create Requests

**1. GET /api/audio/status**
- Method: GET
- URL: `http://localhost:5000/api/audio/status`
- Headers: None
- Body: None

**2. GET /api/usb/devices**
- Method: GET
- URL: `http://localhost:5000/api/usb/devices`
- Headers: None
- Body: None

**3. POST /api/audio/config**
- Method: POST
- URL: `http://localhost:5000/api/audio/config`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "sample_rate": 48000,
  "buffer_size": 256
}
```

**4. POST /api/audio/restart**
- Method: POST
- URL: `http://localhost:5000/api/audio/restart`
- Headers: None
- Body: None

**5. POST /api/audio/test**
- Method: POST
- URL: `http://localhost:5000/api/audio/test`
- Headers: None
- Body: None

---

## Testing with Python

```python
import requests
import json

BASE_URL = "http://localhost:5000/api"

# 1. Get audio status
response = requests.get(f"{BASE_URL}/audio/status")
print("Audio Status:", response.json())

# 2. Get USB devices
response = requests.get(f"{BASE_URL}/usb/devices")
print("USB Devices:", response.json())

# 3. Configure audio
config = {"sample_rate": 48000, "buffer_size": 256}
response = requests.post(f"{BASE_URL}/audio/config", json=config)
print("Config Result:", response.json())

# 4. Run test
response = requests.post(f"{BASE_URL}/audio/test")
print("Test Result:", response.json())

# 5. Restart engine
response = requests.post(f"{BASE_URL}/audio/restart")
print("Restart Result:", response.json())
```

---

## Error Handling

### Common Errors

**503 Service Unavailable**
```json
{
  "detail": "PiPedal engine not available"
}
```
**Solution**: Verify PiPedal service is running

**400 Bad Request**
```json
{
  "detail": "Unsupported sample rate. Must be one of: [44100, 48000, 96000, 192000]"
}
```
**Solution**: Use only supported values

**500 Internal Server Error**
```json
{
  "detail": "Failed to apply configuration changes"
}
```
**Solution**: Check backend logs, verify permissions

---

## Integration with Frontend

The Audio Interface dashboard expects these exact endpoints and response formats.

### Frontend Fetch Calls

```javascript
// Get audio status
fetch('/api/audio/status')
  .then(r => r.json())
  .then(data => updateDisplay(data))

// Get USB devices
fetch('/api/usb/devices')
  .then(r => r.json())
  .then(data => updateDeviceInfo(data))

// Configure
fetch('/api/audio/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sample_rate: 48000 })
})
  .then(r => r.json())
  .then(data => confirmChange(data))

// Test
fetch('/api/audio/test', { method: 'POST' })
  .then(r => r.json())
  .then(data => displayTestResults(data))

// Restart
fetch('/api/audio/restart', { method: 'POST' })
  .then(r => r.json())
  .then(data => notifyRestart(data))
```

---

## Verification Checklist

- [ ] Endpoint 1: `/api/audio/status` returns audio configuration
- [ ] Endpoint 2: `/api/usb/devices` returns device information
- [ ] Endpoint 3: `/api/audio/config` accepts and applies configuration
- [ ] Endpoint 4: `/api/audio/restart` restarts the audio engine
- [ ] Endpoint 5: `/api/audio/test` runs diagnostics and returns score
- [ ] All endpoints return correct JSON format
- [ ] Error handling works properly
- [ ] Frontend dashboard loads without errors
- [ ] Buttons and controls respond to API data
- [ ] Status indicators update correctly

---

## Success Criteria

✅ All 5 endpoints implemented in `/app/routes/audio.py`
✅ Endpoints return correct JSON responses
✅ Configuration changes are applied
✅ Error handling is comprehensive
✅ Dashboard can fetch and display data
✅ All controls are functional

---

**Status**: ✅ **STEP 1 COMPLETE - API Endpoints Implemented**

**Next Step**: Verify endpoints are working with test calls
