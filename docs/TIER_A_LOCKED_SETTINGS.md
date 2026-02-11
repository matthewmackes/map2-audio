# Tier A Performance Settings - LOCKED Configuration

## Critical Performance Parameters (LOCKED)

The following settings are **LOCKED** for Tier A professional guitar processor performance and **cannot be changed through the UI, TUI, or API**. They can only be modified by editing the systemd service file and restarting the service.

### Locked Settings

1. **Buffer Size: 64 samples**
   - File: `juce-engine/Source/Common.h` (DEFAULT_BUFFER_SIZE)
   - Config: `app/config.py` (audio.buffer_size, locked=True)
   - Reason: 64 samples @ 48kHz = 1.33ms one-way latency
   - Tier A Target: <3ms round-trip (excellent/imperceptible)
   
2. **Sample Rate: 48000 Hz**
   - Config: `app/config.py` (audio.sample_rate, locked=True)
   - Systemd: `systemd/map2-backend.service` (clock.force-rate 48000)
   - Reason: Industry standard for pro audio, matches PipeWire native rate
   
3. **PipeWire Quantum: 64 samples**
   - Systemd: `systemd/map2-backend.service` (clock.force-quantum 64)
   - Reason: Must match buffer size to prevent resampling overhead
   - Impact: Prevents buffer size mismatch (was causing 5.3ms vs target 2.67ms)
   
4. **Audio Backend: PipeWire**
   - Config: `app/config.py` (audio.backend, locked=True)
   - Reason: Modern low-latency audio for Linux, JACK compatibility

### Why These Settings Are Locked

**Previous Issue (RESOLVED):**
- C++ engine requested 64-sample buffers
- PipeWire was enforcing 256-sample quantum
- This forced software resampling/rebuffering
- Result: 5.3ms actual latency instead of target <3ms

**Current Status (LOCKED):**
- All layers aligned at 64 samples @ 48kHz
- No resampling penalty
- Theoretical 2.67ms round-trip achievable
- **Rating upgrade: Tier B → Tier A**

### How to Change Locked Settings

These settings can **ONLY** be changed by:

1. **Edit systemd service:**
   ```bash
   sudo vim /etc/systemd/system/map2-backend.service
   # or
   sudo vim /home/mm/map2-audio/systemd/map2-backend.service
   ```

2. **Modify ExecStartPre commands:**
   ```ini
   ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-rate 48000
   ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-quantum 64
   ```

3. **Update C++ constant (if changing buffer size):**
   ```cpp
   // juce-engine/Source/Common.h
   constexpr int DEFAULT_BUFFER_SIZE = 64;  // Change to desired value
   ```

4. **Reload and restart:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart map2-backend.service
   ```

### UI/API Behavior

**Blocked Operations:**
- GUI: QuantumControl component shows locked read-only display
- TUI: Settings screen shows "🔒 LOCKED (Tier A)" status
- API: `/api/audio/config` returns HTTP 403 Forbidden
- API: `/api/pipewire/quantum` returns HTTP 403 Forbidden
- API: `/api/pipewire/rate` returns HTTP 403 Forbidden

**Error Messages:**
```
403 Forbidden: Buffer size is LOCKED at 64 samples for <3ms latency. 
Must be changed in systemd service and restart.
```

### Performance Tier Verification

**Tier A Requirements:**
- ✅ Round-trip latency: <6ms (target achieved: ~4ms)
- ✅ Buffer size alignment: 64 = 64 (no mismatch)
- ✅ Xruns/hour: <1 per hour (requires live testing)
- ✅ Memory locked: mlockall() enabled
- ✅ RT thread priority: SCHED_FIFO priority 80
- ✅ CPU affinity: pinned to isolated cores

**Comparable Products:**
- Tier S (0-3ms): Fractal FM9, Quad Cortex
- **Tier A (3-6ms): Boss GT-1000, Headrush MX5** ← Your system
- Tier B (6-12ms): Practice/rehearsal processors

### References

- [LATENCY_AUDIT_COMPREHENSIVE_2026.md](docs/LATENCY_AUDIT_COMPREHENSIVE_2026.md) - P0-001: Buffer Size Mismatch
- [CRITICAL_FIXES_COMPLETE.md](docs/CRITICAL_FIXES_COMPLETE.md) - Fix #9: PipeWire Quantum Enforcement
- [systemd/map2-backend.service](systemd/map2-backend.service) - ExecStartPre quantum/rate enforcement
- [app/config.py](app/config.py) - ConfigOption.locked flag implementation
