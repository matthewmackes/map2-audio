# Latency Audit – Quick Reference & Action Items

**Audit Document:** [LATENCY_AUDIT_COMPREHENSIVE_2026.md](LATENCY_AUDIT_COMPREHENSIVE_2026.md)

---

## THE VERDICT

✅ **YES, <3 ms is achievable** on this system with AUDIO mode + all P0/P1 fixes.

- **AUDIO Mode:** 2.5–3.5 ms expected (90% confidence)
- **ALL-IN-ONE Mode:** 4.0–5.5 ms expected (40% confidence)
- **Current State:** ~4–7 ms (multiple gaps identified)

---

## TOP 10 CRITICAL FIXES (Do These First)

| # | Fix | Priority | Impact | Effort | File |
|---|-----|----------|--------|--------|------|
| 1 | Fix buffer size: 128 → 64 samples | **P0** | -2–3 ms | 5 min | `juce-engine/Source/Common.h:30` |
| 2 | Ban irqbalance from cores 4,5 | **P0** | -0.5–2 ms | 10 min | `/etc/default/irqbalance` |
| 3 | Set `sched_rt_runtime_us = 2950000` | **P0** | Reliability | 5 min | `/etc/sysctl.d/91-map2-audio-rt.conf` |
| 4 | Add kernel params: `skew_tick=1 nmi_watchdog=0 audit=0 idle=nomwait` | **P0** | -0.5–1 ms | Reboot | `/etc/default/grub.d/20-map2-audio-latency.cfg` |
| 5 | Disable THP completely | **P0** | -0.5–1 ms | 5 min | `/etc/sysctl.d/92-map2-audio-thp.conf` |
| 6 | Set swappiness=0, disable swap | **P0** | Critical | 10 min | `/etc/sysctl.d/93-map2-audio-swappiness.conf` |
| 7 | Add mlock() to audio buffer | **P0** | -1–10 ms | 30 min | `juce-engine/Source/Map2AudioEngine.cpp` |
| 8 | Create AUDIO mode systemd drop-in | **P0** | -1–2 ms | 20 min | `/etc/systemd/system/map2-backend.service.d/audio-mode-override.conf` |
| 9 | Verify CPU isolation with script | **P1** | Visibility | 15 min | `/usr/local/bin/verify-cpu-isolation.sh` |
| 10 | Pin PipeWire to housekeeping cores | **P1** | -1–2 ms | 10 min | `/etc/systemd/user@.service.d/pipewire-affinity.conf` |

---

## Recommended Implementation Order

### **Week 1: Core Fixes (Reboot Required)**
1. Update kernel cmdline with GRUB drop-in (fix #4)
2. Fix buffer size in Common.h (fix #1)
3. Add sysctl.d files (fixes #3, #5, #6)
4. Rebuild juce-engine
5. **Reboot system**

**Expected latency after Week 1:** 4.0–5.0 ms

---

### **Week 2: Systemd & Audio Engine**
6. Add mlock() to C++ code (fix #7)
7. Create mode-specific systemd drop-ins (fix #8)
8. Create CPU isolation verification script (fix #9)
9. Pin PipeWire to housekeeping (fix #10)
10. Rebuild + redeploy

**Expected latency after Week 2:** 3.0–4.0 ms

---

### **Week 3: Optimization**
- Disable journald disk logging
- Set CPU frequency governor to performance
- Disable C-states
- Move database to tmpfs
- Tune ALSA period to 2

**Expected latency after Week 3:** **2.5–3.5 ms ✅**

---

## Current Implementation Status

### ✅ What's Already Good
- Kernel: PREEMPT_DYNAMIC (correct)
- CPU isolation: cores 4,5 (correct)
- threadirqs enabled (correct)
- rcu_nocbs configured (correct)
- PipeWire quantum forced to 128 samples (close, should be 64)
- LimitRTPRIO=95 (correct)
- LimitMEMLOCK=infinity (correct)
- systemd drop-ins in place (good pattern)
- Swappiness lowered to 10 (good)
- HugePages pre-allocated (good)

### ❌ What's Broken/Missing
1. **Buffer size mismatch:** Common.h says 128, systemd forces 64 → PipeWire resampling overhead
2. **irqbalance still active:** Can steal audio device IRQ to isolated core
3. **sched_rt_runtime_us not tuned:** = -1 (unlimited but undefined)
4. **Missing kernel params:** `skew_tick=1`, `nmi_watchdog=0`, `audit=0`, `idle=nomwait`
5. **THP not fully disabled:** Can cause compaction pauses
6. **No mlock() in C++:** Page faults possible during audio callback
7. **No mode-specific overrides:** FastAPI can run on audio cores
8. **No verification script:** Silent failures possible
9. **PipeWire not pinned:** Session manager can run on isolated cores
10. **journald writes to disk:** Can cause 5–20 ms spikes

---

## Audit Files Location

| Document | Purpose | Lines |
|----------|---------|-------|
| [LATENCY_AUDIT_COMPREHENSIVE_2026.md](LATENCY_AUDIT_COMPREHENSIVE_2026.md) | **Full technical audit** (all 6 steps) | ~1000 |
| [LATENCY_OPTIMIZATIONS_APPLIED.md](LATENCY_OPTIMIZATIONS_APPLIED.md) | Previous quantum/buffer work (reference) | ~250 |
| This file | Quick reference & action items | ~150 |

---

## Testing After Changes

### Manual Latency Measurement
```bash
# Start audio processing
systemctl restart map2-backend

# Monitor xruns
pw-stat | grep "clock.rate"
pw-stat | grep "quantum"

# Check CPU isolation
grep isolcpus /proc/cmdline

# Monitor latency histogram (requires API endpoint)
curl http://localhost:8080/api/metrics/audio/realtime

# Watch system load
top -p $(pgrep -f "uvicorn")
```

### Expected Baseline
After all Phase 2 fixes:
- **Latency:** 3.0–4.0 ms typical
- **Xruns:** 0 (if hardware supports it)
- **CPU Load:** <50% on core 4,5 during playback
- **Memory:** <500 MB (buffer + engine)

---

## Risk Mitigation

**If system becomes unstable after changes:**

1. Revert grub changes (keep fallback in GRUB menu)
2. Comment out aggressive sysctl settings
3. Remove mlock() if causing issues
4. Increase buffer to 128 samples temporarily

**Rollback command:**
```bash
grub2-mkconfig -o /boot/grub2/grub.cfg
systemctl reboot
```

---

## Next Phase: Monitoring & Validation

After all fixes applied, implement:

1. **Real-time xrun counter** (API endpoint)
2. **Latency histogram** (track distribution)
3. **Per-core CPU tracking** (verify isolation)
4. **Temperature monitoring** (prevent throttling)
5. **Automated regression testing** (detect regressions)

---

## Questions & Gotchas

**Q: Why can't we just use JACK directly?**  
A: JACK adds compatibility overhead. PipeWire is faster now, but needs careful tuning (same 2–3 ms achievable).

**Q: Why not disable PipeWire altogether?**  
A: PipeWire handles device hot-plug, routing, multiple clients. Removing it gains <0.5 ms; not worth loss of features.

**Q: What if buffer size 64 samples causes xruns?**  
A: Fall back to 128. Current system likely stable at 64 (CPU sufficient).

**Q: Why FastAPI on isolated cores?**  
A: Python + C++ = scheduler contention. Moving FastAPI to cores 0–3 solves it.

**Q: Can we achieve <3 ms on ALL-IN-ONE?**  
A: Rarely. Accept 4–5 ms as compromise. If need <3 ms, must use AUDIO-only mode.

---

## Success Criteria

| Criterion | Target | How to Measure |
|-----------|--------|------------------|
| **Round-trip latency (AUDIO)** | **<3.5 ms 99%ile** | Use latency histogram endpoint |
| **Xruns per hour** | **0** | Monitor xrun counter |
| **CPU load (core 4,5)** | **<60%** | `top` or `/proc/stat` |
| **Jitter (max deviation)** | **<200 μs** | Histogram stddev |
| **Dropout recovery** | **<100 ms** | Manual playback test |
| **Thermal stability** | **<80°C sustained** | `/sys/class/thermal/*` |

---

## Contact & Support

For implementation questions:
- Review [LATENCY_AUDIT_COMPREHENSIVE_2026.md](LATENCY_AUDIT_COMPREHENSIVE_2026.md) for detailed explanations
- Check [juce-engine/](juce-engine/) for code changes needed
- See [systemd/map2-backend.service](systemd/map2-backend.service) for current configuration

---

**Generated:** February 8, 2026  
**System:** Fedora 43, Kernel 6.18.5-200.fc43 PREEMPT_DYNAMIC  
**Audit Confidence:** 90% (AUDIO mode), 40% (ALL-IN-ONE mode)
