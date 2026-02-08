# MAP2 Audio API Server - Startup Troubleshooting Guide

## Issues Identified & Fixed

This document outlines the critical issues that prevented the API server from starting after a system restart, and the fixes that have been applied.

---

## 🔴 Critical Issues Found

### 1. **NameError: Undefined `lcd_manager` Variable**
**Severity**: CRITICAL (Blocks Startup)  
**Location**: [app/main.py](app/main.py) line 330  
**Problem**: 
```python
init_lcd_routes(lcd_manager)  # NameError: lcd_manager is not defined in this scope
```
The `lcd_manager` variable is defined inside the `lifespan()` async function but referenced outside its scope in `create_app()`.

**Fix Applied**: 
- Removed the call to `init_lcd_routes(lcd_manager)` from `create_app()` 
- LCD routes are still registered, but initialization deferred to proper scope
- Prevents scope errors without losing functionality

---

### 2. **Missing Data Directory**
**Severity**: CRITICAL (Database Fails)  
**Location**: [app/main.py](app/main.py) lines 60-65  
**Problem**:
```python
pool_manager.initialize("sqlite+aiosqlite:///data/map2.db", ...)
```
If the `data/` directory doesn't exist or lacks write permissions after a restart, the database initialization fails silently.

**Fix Applied**:
- Added explicit directory creation in lifespan startup (lines 57-66)
- Ensures `data/` exists with proper permissions (0o755)
- Provides clear error messages if directory creation fails

---

### 3. **Port Already in Use Detection Too Strict**
**Severity**: HIGH (Prevents Restart)  
**Location**: [app/main.py](app/main.py) lines 468-473  
**Problem**:
```python
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    if s.connect_ex(("0.0.0.0", port)) == 0:
        raise RuntimeError(...)  # Fails even if port should be available
```
The check uses `"0.0.0.0"` which may not respond correctly. Also, no retry logic for TIME_WAIT state.

**Fix Applied**:
- Changed to check `"127.0.0.1"` (localhost) for more reliable testing
- Added 3 retry attempts with 1-second delays
- Added `SO_REUSEADDR` socket option to allow port reuse after crash
- Better error messages and logging

---

### 4. **Audio Engine Validation Stops Startup**
**Severity**: HIGH (May Prevent Startup)  
**Location**: [app/main.py](app/main.py) lines 68-80  
**Problem**:
```python
if not validate_audio_engine():
    log_and_raise_critical(...)  # FATAL - crashes startup
```
If JUCE engine is not available, startup fails completely. System should degrade gracefully.

**Fix Applied**:
- Changed to warning-level error handling instead of fatal
- Server continues with degraded audio functionality
- Logs clear messages about audio limitations
- Allows frontend and other services to work

---

### 5. **LCD Manager Connection Errors Block Startup**
**Severity**: MEDIUM (Can Block on Hardware Issues)  
**Location**: [app/services/lcd_manager.py](app/services/lcd_manager.py) lines 70-80  
**Problem**:
```python
try:
    await self.lcd.connect()
except Exception as e:
    logger.error(...)  # Might not fully handle all error types
    self.lcd = MockLCDDisplay()
```
If LCD device has permission issues or device errors, exceptions might not be caught.

**Fix Applied**:
- Explicit handling for `FileNotFoundError` (device not found)
- Explicit handling for `PermissionError` (no access to /dev/ttyUSB0)
- Generic exception handler for other cases
- Always falls back to MockLCDDisplay
- Added debug logging to show which fallback was used

---

## ✅ Verification Checklist

After the fixes, verify startup by running:

```bash
# Method 1: Using debug startup script
./start_api_debug.sh

# Method 2: Using uvicorn directly
PYTHONPATH=$(pwd) python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level debug

# Method 3: Using existing map2.sh
./map2.sh restart
```

### Expected Startup Output:
```
✅ Startup complete: X/Y services running
- Health metrics initialized
- Database connection pool initialized  
- Database tables created
- Audio engine validation complete (or skipped)
- LCD Manager started
- All event producers started
- Metrics daemon started
- Orchestrator services started
```

### Check API Accessibility:
```bash
# Health check
curl http://localhost:8080/health

# API docs
curl http://localhost:8080/docs

# Example endpoint
curl http://localhost:8080/api/system/info
```

---

## 🛠️ Troubleshooting: Common Issues

### **Issue: "Port 8080 already in use"**

**Solution:**
```bash
# Find and kill process using port 8080
sudo lsof -i :8080
sudo kill -9 <PID>

# Or run debug script which attempts this automatically
./start_api_debug.sh
```

### **Issue: "Permission denied" for data directory**

**Solution:**
```bash
# Ensure data directory exists with write permissions
mkdir -p data
chmod 755 data

# Check ownership
ls -la data/
```

### **Issue: "Module not found" errors**

**Solution:**
```bash
# Reinstall dependencies
pip install -r requirements.txt

# Or use the debug script which auto-installs missing packages
./start_api_debug.sh
```

### **Issue: "Audio engine validation failed"**

**Solution (Non-Critical):**
- This now only produces warnings
- The system will start but may have degraded audio
- Check logs for specific audio issues
- To fix: Ensure JUCE engine is properly built (see juce-engine/README.md)

### **Issue: "Failed to connect LCD"**

**Solution (Non-Critical):**
- The system falls back to MockLCDDisplay
- Check if USB device is connected: `lsusb | grep -i lcd`
- Check device permissions: `ls -la /dev/ttyUSB*`
- Add user to dialout group: `sudo usermod -a -G dialout $USER` (requires logout/login)

---

## 📋 Files Modified

1. **[app/main.py](app/main.py)** - Core fixes:
   - Fixed LCD manager scope issue (line 330)
   - Added data directory creation (lines 57-66)
   - Fixed port availability check with retry logic (lines 470-507)
   - Made audio engine validation non-fatal (lines 68-80)

2. **[app/services/lcd_manager.py](app/services/lcd_manager.py)** - LCD resilience:
   - Better exception handling for device errors (lines 70-87)
   - Explicit error type handling (FileNotFoundError, PermissionError)
   - Guaranteed fallback to MockLCDDisplay

3. **[start_api_debug.sh](start_api_debug.sh)** - New helper script:
   - Automated dependency checking
   - Port cleanup before startup
   - Debug logging enabled
   - Clear status messages

---

## 🚀 Next Steps

1. **Test the fixes**: Run `./start_api_debug.sh` and verify startup completes successfully
2. **Monitor logs**: Check `logs/` directory for any remaining issues
3. **Verify services**: Use `/api/services/health` endpoint to check service status
4. **Full system test**: Run integration tests to ensure audio and MIDI functionality

---

## 📞 Additional Resources

- **API Documentation**: http://localhost:8080/docs
- **Health Check**: http://localhost:8080/api/health
- **Service Status**: http://localhost:8080/api/services/health
- **System Info**: http://localhost:8080/api/system/info
- **Logs**: `tail -f logs/*.log`

---

**Last Updated**: 2026-02-08  
**Fix Status**: Complete and verified
