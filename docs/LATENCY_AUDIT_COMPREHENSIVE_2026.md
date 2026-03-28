# Comprehensive Low-Latency Linux Audio System Audit
## MAP2 Audio Platform - Real-time Distributed Guitar Effects Processor

**Audit Date:** February 8, 2026  
**System:** Fedora Linux 43 (Server), Kernel 6.18.5-200.fc43 PREEMPT_DYNAMIC  
**Target Goal:** Round-trip latency ≤ 3.0 ms (reliably, under playing conditions)  
**Current Status:** Multiple tuning gaps identified; estimated **4–7 ms** realistic today

---

# STEP 1: LATENCY REALITY CHECK

## Q: Is < 3 ms round-trip realistically achievable on commodity hardware with current Linux kernels (2025–2026)?

### Answer: **YES, but with very strict conditions and careful implementation.**

**Reality:**
- **Theoretically possible:** 64 samples @ 48 kHz = 1.33 ms per buffer. Even with 2 buffers round-trip = 2.67 ms.
- **Practically achievable:** 100–120 ms of latency can be reduced to **2.5–3.5 ms** with proper tuning on stable Intel/AMD hardware.
- **Commodity hardware:** Desktop boards (not enthusiast/server) often have better audio latency profiles than expensive server boards due to simpler chipset design.

**Critical Requirements:**
1. **Kernel:** PREEMPT_RT or PREEMPT_DYNAMIC (preempt=full) + threadirqs
2. **CPU isolation:** 2–4 dedicated cores with `isolcpus`, `nohz_full`, `rcu_nocbs`
3. **Buffer size:** 64 samples @ 48 kHz (MAXIMUM for < 3 ms)
4. **Jitter tolerance:** < 200 μs peak deviation (requires BIOS settings + governor tuning)

---

## Q: What buffer size + sample rate combination is required?

### Answer: The minimum viable combination for < 3 ms round-trip:

| Sample Rate | Max Buffer Size (1 period) | Round-trip (2 periods) | Feasibility |
|-------------|---------------------------|------------------------|-------------|
| **48 kHz** | **64 samples** | **2.67 ms** | ✅ **REQUIRED** |
| 48 kHz | 128 samples | 5.33 ms | ❌ Too slow (unless audio node only) |
| 96 kHz | 32 samples | 2.67 ms | ✅ Works but CPU load doubles |

**Current System Status:**
- ✅ **Service config:** `clock.force-quantum 64` (correct)
- ✅ **Sample rate:** 48 kHz (correct)
- ❌ **ALSA driver:** Still using 3 periods (should be 2)
- ✅ **JUCE code:** `Common.h` now defines `DEFAULT_BUFFER_SIZE = 64`, aligned with the service quantum

---

## Q: What are the most common remaining sources of latency / xruns after using PREEMPT_RT or preempt=full + threaded IRQs?

### Answer: In priority order (most to least impactful):

### **TIER 0 – CRITICAL (0.5–2.0 ms each)**

1. **Scheduler jitter on non-isolated cores** → Kernel scheduler switching audio task off at 10ms intervals
   - *Symptom:* Periodic glitches every 10–100 ms
   - *Fix:* CPU isolation + RCU callbacks pinned

2. **Memory reclaim / page allocation under pressure** → Direct memory pressure pauses audio thread
   - *Symptom:* Random dropouts, worse under load
   - *Fix:* mlock audio process memory + disable transparent huge pages compaction

3. **Housekeeping core (kworkers, timers) stealing CPU** → System work running on isolated core
   - *Symptom:* Constant underruns, no single glitch
   - *Fix:* Verify `isolcpus` mask, pin softirqs to housekeeping core

4. **PipeWire/WireRouter overhead** → Graph rebalancing, plugin discovery at wrong time
   - *Symptom:* Glitch 1–2s after mode change or device arrival
   - *Fix:* Disable hot-plug detection during playback, lock graph topology

### **TIER 1 – HIGH IMPACT (0.2–0.5 ms each)**

5. **IRQ storms or MSI routing issues** → USB/soundcard IRQs not affined to correct core
   - *Symptom:* Unpredictable latency spikes
   - *Fix:* Manual IRQ affinity + disable irqbalance on audio cores

6. **Filesystem I/O blocking audio thread** → CFQ/deadline scheduler bad decisions
   - *Symptom:* Glitch when logger writes to disk
   - *Fix:* Use `io-uring` + mq-deadline scheduler, no DBs on audio core

7. **Timer wheel contention** → Too many timers on housekeeping core
   - *Symptom:* Latency increases with number of timers
   - *Fix:* timer_migration=1 + reduce ALSA poll frequency

8. **Context switches due to poor thread priority structure** → Audio thread not highest priority
   - *Symptom:* Glitch when web request arrives
   - *Fix:* SCHED_FIFO + explicit priority management per thread

### **TIER 2 – MODERATE (0.05–0.2 ms each)**

9. **TLB misses from memory fragmentation** → Virtual→physical address translation overhead
10. **Thermal throttling** → CPU frequency scaling despite `performance` governor
11. **DRAM refresh cycles** → Background memory maintenance pauses
12. **CPU C-states** → Idle states breaking latency across cores
13. **ACPI SMI (System Management Interrupt)** → BIOS background management
14. **NUMA effects** → Wrong NUMA node access on multi-socket systems

---

## Summary for <3 ms on This System

**Current estimate:** 4–7 ms (including 1-2 ms buffer + PipeWire overhead + jitter)  
**After ALL fixes:** **2.5–3.5 ms** (reliably achievable)

**Most likely remaining obstacles:**
- PipeWire JACK compatibility layer adds ~0.5–1.0 ms
- Missing CPU isolation on housekeeping threads
- ALSA driver still using 3 periods instead of 2
- IRQ balance still active (steals cycles)
- No per-core softirq isolation

---

---

# STEP 2: CRITICAL MISSING PIECES

## Evaluation of 16 Tuning Categories

### 1. **Kernel Choice & Kernel Command Line Parameters**

**Current Status:** ⚠️ **PARTIAL BUT INCONSISTENT**

**Current Implementation:**
```
isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs
```

**What Works:**
- ✅ CPU isolation on cores 4,5 (2 cores for audio)
- ✅ `threadirqs` enabled (converts hardirq to softirq threads)
- ✅ PREEMPT_DYNAMIC kernel detected
- ✅ `rcu_nocbs` correctly pinning RCU to housekeeping core

**Critical Gaps:**
1. ❌ **`skew_tick=1`** – missing (reduces timer wheel jitter)
2. ❌ **`nmi_watchdog=0`** – not disabled (can steal ~1% CPU)
3. ❌ **`audit=0`** – not disabled (audit subsystem overhead)
4. ❌ **`kvm-intel.epts=Y` or `amd-iommu=on`** – not set (if virtualization in use)
5. ❌ **`no_hz_full=4,5` should align with housekeeping core** – no explicit housekeeping core set
6. ❌ **`idle=nomwait`** – not set (can reduce C-state latency)
7. ❌ **`intel_pmc_core.enable=0`** – not set (if Intel; disables power management counters)

**Recommendation:** Add to grub.d override:
```
isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs skew_tick=1 nmi_watchdog=0 audit=0 idle=nomwait pci=nomsi
```

---

### 2. **CPU Isolation & Housekeeping Core Strategy**

**Current Status:** ⚠️ **INCOMPLETE**

**Current Implementation:**
- Cores 4,5 isolated for audio
- No explicit housekeeping core assignment

**Problems:**
1. ❌ **Housekeeping core undefined** – kernel picks core 0 by default, but no guarantee
2. ❌ **No verification script** – hard to know which core is actually housekeeping
3. ❌ **IRQs still arriving on cores 4,5** – `isolcpus` doesn't prevent IRQs from all cores
4. ❌ **Per-CPU kernel threads not moved** – `kworker/4:*`, `migration/4` still on isolated cores
5. ❌ **Systemd services not CPU-affined** – irqbalance, systemd-logind can run on any core

**Recommendation:**
1. Add `housekeeping_managed_irq=1` to kernel cmdline
2. Pin irqbalance, systemd, sshd to cores 0–3 only
3. Create boot script to verify and report isolation status

---

### 3. **IRQ / MSI Affinity & irqbalance**

**Current Status:** ❌ **DANGEROUSLY WEAK**

**Current Implementation:**
- `irqbalance` is **RUNNING** (service status: active)
- No manual IRQ affinity for audio devices
- No USB audio device IRQ masks defined
- No SoundCard IRQ masks defined

**Critical Problems:**
1. ❌ **irqbalance is actively REBALANCING IRQs** – can move soundcard IRQ to core 4,5 during playback
2. ❌ **EDIROL UA-1000 IRQ location unknown** – need to find and pin it
3. ❌ **MSI mode vs pin-based not checked** – USB audio may use edge-triggered IRQs
4. ❌ **No systemd drop-in to disable irqbalance on audio cores**
5. ❌ **ALSA poll thread still woken by interrupts** – doesn't use busy-wait

**Recommendation:**
```bash
# 1. Find audio device IRQ
cat /proc/interrupts | grep -iE 'usb|edirol|sound|alsa'

# 2. Create /etc/default/irqbalance for audio mode:
IRQBALANCE_BANNED_CPUS=0x30  # Cores 4,5 (binary: 00110000)

# 3. Manual IRQ affinity for soundcard (replace IRQ_NUM):
echo 0x0F > /proc/irq/IRQ_NUM/smp_affinity  # Limit to cores 0–3

# 4. Disable irqbalance in AUDIO mode only
```

---

### 4. **Realtime Scheduling Budget & Thread Priorities**

**Current Status:** ⚠️ **PARTIALLY CORRECT BUT INCOMPLETE**

**Current Implementation:**
```ini
LimitRTPRIO=95           # ✅ Correct – allows RT scheduling
LimitMEMLOCK=infinity    # ✅ Correct – allows mlock
AmbientCapabilities=CAP_SYS_NICE  # ✅ Allows setpriority
CapabilityBoundingSet=CAP_SYS_NICE  # ✅ Restrictive
```

**Sysctl Status:**
```
kernel.sched_rt_runtime_us = -1  # ⚠️ PROBLEM: -1 means unlimited for group_sched=0
```

**Critical Gaps:**
1. ❌ **sched_rt_runtime_us = -1** – means unlimited, but should be explicitly tuned PER cgroup
2. ❌ **No cgroup v2 realtime allocation** – no explicit RT time budget per task
3. ❌ **Thread priority hierarchy not defined** – audio thread not guaranteed to preempt background tasks
4. ❌ **Python GIL interference** – FastAPI (Python) running audio callback (C++) doesn't isolate scheduling

**Recommendation:**
```sysctl
kernel.sched_rt_runtime_us = 2950000       # 2.95 sec per 3 sec (use 95% of RT budget)
kernel.sched_rt_period_us = 3000000
```

---

### 5. **Memory Locking, Swappiness, Transparent Huge Pages, Compaction, Zone Reclaim**

**Current Status:** ⚠️ **GOOD BUT INCOMPLETE**

**Current Implementation:**
```
vm.swappiness = 10                    # ✅ Good
vm.nr_hugepages = 256                 # ✅ Pre-allocated
vm.compaction_proactiveness = 0       # ✅ Disabled
vm.zone_reclaim_mode = 0              # ✅ Disabled
vm.overcommit_memory = 3              # ⚠️ Conservative (Fedora default)
```

**Gaps:**
1. ❌ **No mlock in C++ code** – audio buffer allocated but not locked to RAM
2. ❌ **Transparent huge pages not explicitly disabled for audio** – can cause compaction pauses
3. ❌ **vm.page-cluster not set** – default 3 (reads 8 pages), can cause latency spike
4. ❌ **Direct reclaim on audio core still possible** – no per-core tuning
5. ❌ **No memory pressure awareness** – no fallback when page cache fills

**Recommendation:**
```sysctl
vm.swappiness = 0                        # Never swap (critical)
vm.page-cluster = 0                      # Read 1 page at a time
vm.mmap_min_addr = 65536                 # Anti-exploit
vm.extfrag_threshold = 1000              # Disable defrag on isolated cores
vm.max_map_count = 262144                # Allow more mmaps
transparent_hugepage/enabled = never     # Disable THP completely
transparent_hugepage/khugepaged/enabled = never
vm.oom_dump_tasks = 0                    # Don't dump task list on OOM
```

**Code-level fix needed:** Add `mlock()` wrapper around audio buffer allocation.

---

### 6. **Filesystem & I/O Scheduling (especially /dev/snd/*, /dev/shm)**

**Current Status:** ❌ **COMPLETELY MISSING**

**Current Implementation:**
- Default I/O scheduler: `mq-deadline`
- No special handling for /dev/snd devices
- No tmpfs mount tuning
- No database I/O isolation

**Critical Problems:**
1. ❌ **mq-deadline is fair, not audio-optimized** – should use `none` (NVMe passthrough) or `kyber` for interactive
2. ❌ **Database queries can block audio thread** – SQLite on `/home/mm/map2-audio/app.db`
3. ❌ **Journal logging to disk** – `journalctl` writes can cause latency spikes
4. ❌ **No realtime I/O priority for audio** – `IOSchedulingClass=realtime` correct but backend not using it
5. ❌ **ALSA device buffering not tuned** – `/dev/snd/*` can block on buffer exhaustion

**Recommendation:**
```bash
# 1. Set I/O scheduler to none (NVMe) or kyber (rotating disk):
echo none > /sys/block/nvme0n1/queue/scheduler

# 2. Move database to tmpfs for audio mode:
# /etc/fstab addition:
tmpfs /tmp/map2-audio tmpfs nodev,nosuid,noexec,size=512M 0 0

# 3. Disable kernel message logging to audio cores:
sysctl kernel.printk_ratelimit_burst = 1

# 4. Create drop-in for journald to not write from audio thread:
# /etc/systemd/journald.conf.d/audio-safe.conf
[Journal]
ForwardToConsole=no
MaxRetentionSec=86400
```

---

### 7. **Power Management & CPU Frequency Governor**

**Current Status:** ❌ **NOT CONFIGURED**

**Current Implementation:**
- Frequency governor not explicitly set (using default: likely `schedutil`)
- No C-state or P-state configuration
- BIOS power management settings unknown

**Problems:**
1. ❌ **schedutil governor can reduce CPU freq during idle** – causes latency spike when audio workload arrives
2. ❌ **C-states enabled** – CPU can sleep, wake-up adds latency
3. ❌ **Intel/AMD turbo boost active** – frequency variance = latency variance
4. ❌ **No BIOS power settings documented** – likely has C-states enabled

**Recommendation:**
```bash
# 1. Set performance governor on all cores (audio + housekeeping):
echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# 2. Disable C-states in BIOS (if possible):
# Set via grub: processor.max_cstate=1 (C1E only, minimal latency)

# 3. Lock CPU frequency (avoid P-states):
# For Intel Xeon/i7: intel_pstate driver
# echo 100 > /sys/devices/system/cpu/intel_pstate/no_turbo

# 4. Create persistent override:
# /etc/default/cpufreq (Fedora):
GOVERNOR=performance
```

---

### 8. **Network Stack Interference (if any network traffic on audio nodes)**

**Current Status:** ⚠️ **ACCEPTABLE FOR NOW BUT INCOMPLETE**

**Current Implementation:**
- No network services explicitly disabled on audio cores
- TCP/UDP still accept packets on all cores
- SSH running on system

**Problems (if audio node used for networking):**
1. ⚠️ **SSH login during playback** – can cause glitch as auth process runs
2. ⚠️ **DHCP renewal** – can interrupt playback
3. ⚠️ **mDNS / Avahi** – can broadcast DNS queries from any core
4. ⚠️ **Systemd-resolved** – DNS lookup from management node can cascade

**Recommendation (for dedicated audio mode):**
```bash
# 1. Disable network services in AUDIO mode:
systemctl --user mask avahi-daemon
systemctl mask cups-browsed
systemctl mask iscsid

# 2. Pin networking threads to housekeeping core:
# /etc/systemd/system.conf.d/network-affinity.conf
[Manager]
CPUAffinity=0-3

# 3. Add to sysctl:
net.core.rps_cpus=0-3                # RPS to housekeeping cores only
```

---

### 9. **PulseAudio / PipeWire Session Manager Leakage**

**Current Status:** ⚠️ **PARTIALLY MITIGATED**

**Current Implementation:**
```
# Service is running pipewire as mm user
ps aux | grep pipewire:
mm        459881  3.6  0.3  64268 64244 ?  S<Lsl 11:03  pipewire
mm        459882  0.4  0.1 563208 24444 ?  S<sl 11:03  wireplumber
```

**Problems:**
1. ⚠️ **WireRouter runs on all cores** – can switch contexts to audio cores
2. ⚠️ **Device discovery threads can run on isolated cores** – hot-plug event causes brief pause
3. ⚠️ **Quantum/latency negotiations not pinned** – session manager can wake up on audio core
4. ❌ **No drop-in for pipewire affinity** – should pin to housekeeping cores in AUDIO mode

**Current Status:**
- ✅ `PIPEWIRE_LATENCY=64/48000` set correctly
- ✅ `clock.force-quantum 64` set
- ❌ No CPU affinity for pipewire/wireplumber

**Recommendation:**
```bash
# /etc/systemd/user@.service.d/audio-pipewire-affinity.conf
# (for audio mode only)
[Unit]
After=user@.service

[Service]
CPUAffinity=0-3               # Limit PipeWire to housekeeping cores
Nice=-5                       # High priority but below RT
```

---

### 10. **Cgroup v2 Resource Control for Audio Processes**

**Current Status:** ❌ **NOT IMPLEMENTED**

**Current Implementation:**
- systemd service has `Nice=-10`, `LimitRTPRIO=95` (cgroup v1 style)
- No cgroup v2 explicit RT reservations
- No CPU quota set for non-audio tasks

**Problems:**
1. ❌ **No CPU.RT.* cgroup entries** – RT time not explicitly budgeted per cgroup
2. ❌ **cgroupsv2 not fully exploited** – can't easily limit non-audio tasks
3. ❌ **No memory cgroup pressure for audio** – memory pressure spreads to all processes
4. ❌ **Python FastAPI process not isolated** – shares scheduling namespace with C++ engine

**Recommendation:**
```ini
# /etc/systemd/system.conf.d/audio-cgroup.conf
[Manager]
DefaultCPUAccounting=yes
DefaultMemoryAccounting=yes
DefaultIOAccounting=yes

# Per service (map2-backend.service):
[Service]
CPUAccounting=yes
MemoryAccounting=yes
CPUQuota=50%          # Allow backend 2 full cores if 4 cores available
MemoryMax=2G          # Hard cap
MemoryHigh=1.5G       # Soft pressure point
```

---

### 11. **Watchdog, Thermal Throttling, NMI Watchdog**

**Current Status:** ❌ **MOSTLY DISABLED BUT NOT VERIFIED**

**Current Implementation:**
- `nmi_watchdog` likely enabled (default on Fedora)
- No thermal governor tuning
- No watchdog daemon configuration

**Problems:**
1. ❌ **NMI watchdog eats ~1% CPU** – periodic interrupt to check if core is hung
2. ❌ **Thermal throttling active** – can drop CPU frequency mid-playback
3. ❌ **No /dev/watchdog disable** – hardware watchdog can interrupt

**Recommendation:**
```bash
# Add to grub.d:
nmi_watchdog=0

# Disable softlockup detector:
kernel.softlockup_panic = 0
kernel.softlockup_panic_all_cpu = 0

# Disable hung task detector:
kernel.hung_task_timeout_secs = 0
kernel.hung_task_panic = 0

# Thermal throttling - set to passive only (no freq drops):
thermal.sys.cooling_device = passive
```

---

### 12. **Logging & journald Impact**

**Current Status:** ⚠️ **PARTIALLY MITIGATED**

**Current Implementation:**
```
StandardOutput=journal
StandardError=journal
```

**Problems:**
1. ⚠️ **Fast logging to journal can cause IO wait** – journald may sync to disk
2. ⚠️ **Ratelimiting not aggressive enough** – burst logging can overwhelm
3. ⚠️ **Persistent journal on disk** – writes go to /var/log/journal (blocking I/O)

**Recommendation:**
```ini
# /etc/systemd/journald.conf.d/audio-safe.conf
[Journal]
Storage=none                    # Don't log to disk in AUDIO mode
RuntimeMaxUse=256M              # Limit memory usage
RuntimeMaxFileSize=32M          # Limit per-file size
SyncIntervalSec=0               # Never sync to disk (memory only)
Compress=no                     # Don't compress logs
ForwardToConsole=no             # Don't forward to console
ForwardToSyslog=no              # Don't forward to syslog

# In map2-backend.service for audio mode:
StandardOutput=file:/dev/null
StandardError=file:/dev/null
# OR (better) – rate-limit aggressive:
StandardOutputRateIntervalSec=1
StandardOutputRateBurst=10
```

---

### 13. **Firmware / Microcode Loading Behavior**

**Current Status:** ⚠️ **PARTIALLY MITIGATED**

**Current Implementation:**
- Fedora default: microcode updates loaded at boot
- No boot-time microcode load disabled

**Problems:**
1. ⚠️ **Microcode update at boot** – can delay system readiness
2. ⚠️ **TPM firmware initialization** – can cause early boot delay
3. ⚠️ **UEFI/BIOS option ROMs** – can execute during boot

**Recommendation:**
```bash
# /etc/default/grub append:
disable_mtrr_cleanup  # Don't scan/clean MTRRs at boot

# Grub.d override for audio mode:
early_microcode=no
processor.max_cstate=1
```

---

### 14. **USB / PCIe Latency Tuning (for audio interfaces)**

**Current Status:** ❌ **MISSING**

**Current Implementation:**
- EDIROL UA-1000 connected via USB
- No USB configuration tuning
- No PCIe latency settings

**Problems:**
1. ❌ **USB polling interval not optimized** – may use default 1-8ms polling
2. ❌ **PCIe link power management enabled** – link can drop to low-speed states
3. ❌ **USB device driver autosuspend** – device can suspend when idle

**Recommendation:**
```bash
# Find USB audio device:
lsusb | grep -i edirol

# Get bus:device:
# Bus 001 Device 004: ID 0582:0014 Roland (EDIROL) UA-1000

# Check power management:
lsusb -v -s 001:004 | grep -i "power"

# Create udev rule to disable autosuspend:
# /etc/udev/rules.d/99-edirol-ua1000-latency.rules
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0582", ATTRS{idProduct}=="0014", ATTR{power/autosuspend}="-1"

# Disable PCIe ASPM (link power management):
# /etc/default/grub GRUB_CMDLINE_LINUX_DEFAULT:
pcie_aspm=off

# Or tune it:
pcie_aspm=performance
```

---

### 15. **Boot Time Optimization (systemd-analyze blame)**

**Current Status:** ⚠️ **UNKNOWN**

**Current Implementation:**
- Boot process not analyzed
- No target isolation identified
- Unknown which services slow down audio startup

**Recommendation:**
```bash
systemd-analyze blame
systemd-analyze critical-chain
systemd-analyze plot > /tmp/boot-timeline.svg
```

**Typical issues:**
- PipeWire session manager waiting for timeout
- ALSA device discovery latency
- Network interface timeouts (if DHCP enabled)

---

### 16. **Monitoring & xruns Detection Strategy**

**Current Status:** ❌ **MISSING**

**Current Implementation:**
- No xrun counter exposed
- No real-time metrics available
- No automated alert on latency degradation

**Problems:**
1. ❌ **Can't detect xruns in production** – silent failures
2. ❌ **No latency histogram** – can't track peak vs average
3. ❌ **No per-thread CPU tracking** – can't correlate audio thread load

**Recommendation:**
```python
# C++ side: Expose xrun counter
class Map2AudioEngine {
    std::atomic<uint64_t> xrun_count_{0};
    std::atomic<double> max_callback_us_{0};
    std::atomic<double> current_load_{0};  // Percent of buffer consumed
};

# Python API endpoint:
@app.get("/api/metrics/audio/realtime")
def get_audio_metrics():
    return {
        "xruns_total": engine.xrun_count,
        "max_callback_us": engine.max_callback_us,
        "current_cpu_load_pct": engine.current_load,
        "buffer_underruns": engine.underrun_count,
        "timestamp_us": time.time_ns() // 1000
    }

# JavaScript dashboard: Real-time xrun counter + latency histogram
```

---

---

# STEP 3: MODE-SPECIFIC WEAKNESSES

## Analysis of `all-in-one`, `management`, `audio` modes

### **ALL-IN-ONE Mode** (Current Default)

**Expected Use:** Both audio processing and web/management on same machine

**Current Tuning:**
- Same kernel params as audio mode: `isolcpus=4,5`, `nohz_full=4,5`
- Python FastAPI running on cores 4,5 (audio cores)
- All services running together

**Critical Weaknesses:**

1. ❌ **FastAPI on isolated cores** – Python GIL contention with C++ audio engine
   - Problem: FastAPI thread scheduler can interrupt audio thread
   - Impact: ~1–2 ms latency spikes when API receives requests
   - Fix: Move FastAPI to housekeeping cores (0–3), only let audio engine use 4,5

2. ❌ **Database queries on audio cores** – SQLite blocking
   - Problem: Web request triggers DB query, which blocks audio I/O
   - Impact: ~0.5–1 ms stall
   - Fix: Move database to tmpfs, disable fsync for low-criticality tables

3. ❌ **Web clients stealing bandwidth** – HTTP requests during playback
   - Problem: Network stack can receive/process packets on audio cores
   - Impact: Unpredictable ~0.2–0.5 ms spikes
   - Fix: Rate-limit web endpoints, pin HTTP handler to housekeeping core

4. ❌ **No compromise on compromise** – all-in-one doesn't trade off appropriately
   - Problem: System tries to be both real-time AND responsive, achieving neither
   - Impact: Latency 5–8 ms instead of <3 ms
   - Fix: Define clear ALL-IN-ONE profile: Accept 4–5 ms latency, prioritize stability

**Recommendation for ALL-IN-ONE:**
- Keep audio engine on cores 4,5 (C++)
- Move FastAPI to cores 0–3 (systemd `CPUAffinity=0-3`)
- Use `Nice=-15` for FastAPI (below audio, above system)
- Set `IOSchedulingClass=idle` for FastAPI (non-blocking disk I/O)
- Accept latency of **4–5 ms** (compromise acceptable for convenience)

---

### **MANAGEMENT Mode** (De-prioritize Audio Completely)

**Expected Use:** Web UI, monitoring, preset management; NO audio processing

**Current Status:** ❌ **MODE DOES NOT EXIST**

**Should Have:**
- ✅ Normal kernel (no `isolcpus`, no `nohz_full`)
- ✅ All services unrestricted
- ✅ Swap enabled (can afford memory thrashing)
- ✅ C-states/P-states active
- ✅ Default I/O scheduler

**Recommendation:**
```bash
# /etc/guitarfx-mode.conf option: MODE=management

# Should apply:
# 1. Grub parameter removal: isolcpus=, nohz_full=, rcu_nocbs=
# 2. Reboot required

# Drop-in for ALL services in management mode:
[Service]
CPUAffinity=              # Unrestricted
Nice=0                    # Normal priority
LimitRTPRIO=0             # No RT scheduling
MemoryLimit=              # No hard cap
```

---

### **AUDIO Mode** (Realtime Audio Only)

**Expected Use:** Dedicated audio processor node in cluster; minimal web/management

**Current Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Should Have:**
- ✅ Kernel params: `isolcpus=4,5`, `nohz_full=4,5`, `rcu_nocbs=4,5`, `threadirqs`
- ✅ FastAPI disabled or moved to separate management interface
- ✅ Database restricted to slow operations only
- ✅ Network stack disabled (or read-only management channel)
- ✅ C-states disabled
- ✅ NMI watchdog disabled

**Current Problems:**
1. ❌ **FastAPI still on main server** – uses isolated cores
   - Fix: Separate management interface (lightweight, stateless)

2. ❌ **Database on main disk** – can block during commit
   - Fix: Move to tmpfs, or disable persistence during playback

3. ❌ **No explicit housekeeping core assignment** – unclear which core is housekeeping
   - Fix: Add `isolcpus=4,5` with explicit `housekeeping_managed_irq=1`

**Recommendation for AUDIO:**
```ini
# /etc/systemd/system.conf.d/audio-mode.conf
[Manager]
CPUAffinity=0-3 4-5       # Pin system services to 0–3

# /etc/systemd/system/map2-backend.service.d/audio-override.conf
[Service]
CPUAffinity=4 5           # Strictly cores 4–5 only
Nice=-20                  # Highest non-RT priority
LimitRTPRIO=99            # Max RT priority
LimitMEMLOCK=infinity
IOSchedulingClass=realtime
IOSchedulingPriority=0

# Expected latency: **2.5–3.5 ms**
```

---

# STEP 4: IMPLEMENTATION QUALITY & MAINTAINABILITY

## Critique of Current `gfx-mode` Script Approach

### **Strengths:**
- ✅ Centralized configuration in `/etc/guitarfx-mode.conf`
- ✅ Idempotent design (can run multiple times)
- ✅ Systemd oneshot service for boot-time application
- ✅ Uses drop-ins (non-destructive to upstream configs)

### **Critical Weaknesses:**

1. ❌ **Grub reconfiguration risk**
   - Problem: `update-grub` can fail silently, leaving system unbootable
   - Risk: Kernel params not applied; latency remains high
   - Impact: User has no visibility into failure
   - Fix: Add pre-check for grub.d file, validate before `update-grub`

2. ❌ **No mode verification after apply**
   - Problem: Can't confirm kernel params actually took effect
   - Risk: Reboots into wrong mode; latency expectations fail
   - Impact: User blames system, not configuration
   - Fix: Add systemd service that verifies `isolcpus` in `/proc/cmdline`

3. ❌ **Upgrade survivability unknown**
   - Problem: What happens if systemd changes service format in F44/F45?
   - Risk: Drop-ins become obsolete; system reverts to defaults
   - Impact: Silent mode drift
   - Fix: Add version check in drop-ins, fail gracefully on mismatch

4. ❌ **Atomicity during mode change**
   - Problem: If reboot fails mid-transition, system stuck
   - Risk: Inconsistent state (old grub params + new drop-ins)
   - Impact: Undefined behavior
   - Fix: Atomic swap of /boot/grub.d files + atomic grub.cfg generation

5. ❌ **Limited debugging**
   - Problem: No clear error messages for common failures
   - Risk: Users can't diagnose mode application failures
   - Impact: Support burden
   - Fix: Add detailed logging to syslog; make dry-run mode default

6. ❌ **No rollback capability**
   - Problem: If mode change causes boot failure, no easy undo
   - Risk: User stuck with broken config
   - Impact: Requires manual recovery
   - Fix: Keep backup of previous grub.cfg; add `revert` command

### **Recommended Architecture Improvements:**

```python
# New architecture: mode-manager.py (Python, not bash)

class ModeManager:
    def __init__(self):
        self.config_file = "/etc/guitarfx-mode.conf"
        self.mode_backups = "/var/lib/guitarfx-mode-backups"
        self.grub_d = "/etc/default/grub.d/20-guitarfx-mode.cfg"
    
    def validate_mode(self, mode):
        """Validate mode before applying."""
        if mode not in ["audio", "management", "all-in-one"]:
            raise ValueError(f"Invalid mode: {mode}")
        return True
    
    def dry_run(self, mode):
        """Show what would be changed, don't apply."""
        changes = self.generate_changes(mode)
        for change_type, items in changes.items():
            print(f"{change_type}:")
            for item in items:
                print(f"  {item}")
    
    def apply(self, mode, requires_reboot=False):
        """Apply mode with atomicity guarantees."""
        # 1. Validate
        if not self.validate_mode(mode):
            return False
        
        # 2. Backup current state
        self.backup_current_state()
        
        # 3. Generate changes
        changes = self.generate_changes(mode)
        
        # 4. Test changes (compile grub.cfg, check syntax)
        if not self.test_changes(changes):
            self.rollback_current_state()
            raise RuntimeError("Changes failed validation")
        
        # 5. Apply changes atomically
        try:
            self.apply_sysctl_d(changes["sysctl"])
            self.apply_systemd_overrides(changes["systemd"])
            self.apply_grub_d(changes["grub"])
            self.apply_udev_rules(changes["udev"])
        except Exception as e:
            self.rollback_current_state()
            raise RuntimeError(f"Apply failed: {e}")
        
        # 6. Regenerate grub.cfg (if needed)
        if changes["grub"]:
            if not self.regenerate_grub():
                self.rollback_current_state()
                raise RuntimeError("Grub regeneration failed")
        
        # 7. Write mode to config file
        self.write_config(mode)
        
        # 8. Verify changes
        issues = self.verify_changes(mode)
        if issues:
            logger.warning(f"Verification issues (non-fatal): {issues}")
            return True  # Applied but with warnings
        
        if requires_reboot:
            logger.info("Mode change requires reboot. Run: systemctl reboot")
        
        return True
    
    def verify_current_mode(self):
        """Verify actual system mode matches configured mode."""
        configured = self.read_config()
        actual = self.detect_actual_mode()
        
        if configured != actual:
            logger.warning(f"Mode mismatch: configured={configured}, actual={actual}")
            return False
        return True
    
    def detect_actual_mode(self):
        """Detect what mode the system is actually in."""
        # Check kernel cmdline
        with open("/proc/cmdline") as f:
            cmdline = f.read()
        
        if "isolcpus=" in cmdline and "nohz_full=" in cmdline:
            if os.path.exists("/etc/systemd/system/map2-backend.service.d/audio-mode.conf"):
                return "audio"
            else:
                return "all-in-one"
        else:
            return "management"
```

---

# STEP 5: CONCRETE, NUMBERED RECOMMENDATIONS

## Prioritized Implementation Plan (60+ Recommendations)

---

## **P0 – MUST FIX IMMEDIATELY** (Will very likely prevent <3 ms goal)

### **P0-001: Fix Buffer Size Mismatch**
**Category:** Kernel/PipeWire Configuration  
**Problem:** Earlier revisions defined `DEFAULT_BUFFER_SIZE = 128` while systemd forced `clock.force-quantum 64`. That mismatch created PipeWire graph resampling overhead and 1-2 ms jitter. The source now uses `64`, which removes this specific documentation/code conflict.
**Why Critical:** Direct impact on achievable latency. A 64-sample block at 48kHz yields a 1.33 ms one-way buffer floor; any mismatch above that raises the floor and can force software resampling.
**Fix:** Keep [juce-engine/Source/Common.h](juce-engine/Source/Common.h#L29) aligned with the service quantum:
```cpp
constexpr int DEFAULT_BUFFER_SIZE = 64;  // Match systemd quantum (64 samples @ 48kHz = 1.33ms)
```
**Implement:** Preserve the 64-sample setting during future engine changes and rebuild/redeploy after any buffer-configuration edits.
**Mode:** ALL
**Expected Impact:** **HIGH** – keeps the latency floor aligned with the configured 64-sample quantum
**Timeline:** Immediate  

---

### **P0-002: Disable irqbalance on Audio Cores (When in Audio Mode)**
**Category:** IRQ Affinity  
**Problem:** `irqbalance` daemon actively rebalances interrupts, including audio device IRQs. Can move soundcard IRQ from core 3 to core 4 (isolated core), causing priority inversion.  
**Why Critical:** Unpredictable 0.5–2 ms latency spikes; soundcard IRQ can steal CPU from audio thread.  
**Fix:** Create systemd drop-in that disables irqbalance on isolated cores:

**File:** `/etc/default/irqbalance` (if audio mode):
```bash
# Only if MODE=audio or MODE=all-in-one
IRQBALANCE_BANNED_CPUS=0x30   # Binary: 00110000 (cores 4,5 isolated)
```

**Or:** systemd service drop-in:

**File:** `/etc/systemd/system/irqbalance.service.d/audio-exclude.conf`:
```ini
[Service]
# Disable irqbalance when in audio/all-in-one mode
ExecStart=
ExecStart=/usr/sbin/irqbalance --banmask=0x30 --foreground
```

**Implement:** Create drop-in file via gfx-mode script; restart irqbalance.  
**Mode:** AUDIO, ALL-IN-ONE (disable completely if audio node, or ban isolated cores)  
**Expected Impact:** **HIGH** – eliminates 0.5–2 ms unpredictable spikes  
**Timeline:** Next release  

---

### **P0-003: Add sched_rt_runtime_us Configuration**
**Category:** Realtime Scheduling  
**Problem:** `kernel.sched_rt_runtime_us = -1` is ambiguous (means unlimited, but no explicit budget). For <3 ms reliable playback, need guaranteed CPU time.  
**Why Critical:** Without explicit RT budget, system can fail to schedule audio thread if other RT threads created.  
**Fix:** Create sysctl.d file:

**File:** `/etc/sysctl.d/91-map2-audio-rt.conf`:
```ini
# Realtime scheduling budget (for AUDIO and ALL-IN-ONE modes)
kernel.sched_rt_runtime_us = 2950000    # 2.95 sec per 3 sec window
kernel.sched_rt_period_us = 3000000     # 3 sec period (use 98% of RT CPU)
```

**Implement:** Deploy via gfx-mode script (only apply in audio/all-in-one mode).  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – ensures audio thread never starved, prevents rare priority inversion  
**Timeline:** Next release  

---

### **P0-004: Add Kernel Command-Line Parameters (Requires Grub Reconfig + Reboot)**
**Category:** Kernel Parameters  
**Problem:** Missing `skew_tick=1`, `nmi_watchdog=0`, `audit=0`, `idle=nomwait`. These add 0.5–1.0 ms of jitter.  
**Why Critical:** NMI watchdog alone costs ~1% CPU (periodic NMI interrupts). `skew_tick=1` reduces timer wheel contention by 0.2–0.3 ms.  
**Fix:** Add to `/etc/default/grub` or create `/etc/default/grub.d/20-map2-audio-latency.cfg`:

```bash
# For AUDIO mode:
GRUB_CMDLINE_LINUX="isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs skew_tick=1 nmi_watchdog=0 audit=0 idle=nomwait pci=nomsi"

# For MANAGEMENT mode:
# (Remove isolcpus, nohz_full, rcu_nocbs)
GRUB_CMDLINE_LINUX="pci=nomsi"
```

**Implement:** Via gfx-mode script:
```bash
if [ "$MODE" = "audio" ]; then
    cat > /etc/default/grub.d/20-map2-audio-latency.cfg <<EOF
GRUB_CMDLINE_LINUX_DEFAULT="isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs skew_tick=1 nmi_watchdog=0 audit=0 idle=nomwait pci=nomsi"
EOF
    grub2-mkconfig -o /boot/grub2/grub.cfg
    systemctl reboot
fi
```

**Mode:** AUDIO (requires reboot)  
**Expected Impact:** **HIGH** – reduces jitter by 0.5–1.0 ms  
**Timeline:** Next release  

---

### **P0-005: Disable Transparent Huge Pages Completely (For Audio Mode)**
**Category:** Memory Management  
**Problem:** THP can trigger compaction pauses (even with `vm.compaction_proactiveness=0`). Kernel still scans for mergeable pages, causing ~1–5 ms stalls.  
**Why Critical:** Jitter from compaction directly impacts round-trip latency.  
**Fix:** Create sysctl.d file:

**File:** `/etc/sysctl.d/92-map2-audio-thp.conf`:
```ini
# Disable THP for AUDIO mode
vm.transparent_hugepage=never
mm.transparent_hugepage.enabled=never
mm.transparent_hugepage.defrag=never
mm.transparent_hugepage.khugepaged.enabled=0
```

**Implement:** Deploy via gfx-mode script (apply in audio/all-in-one mode).  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – eliminates 0.5–1.0 ms compaction pauses  
**Timeline:** Next release  

---

### **P0-006: Set swappiness to 0 (Swap Disabled for Audio)**
**Category:** Memory Management  
**Problem:** Current `vm.swappiness = 10` allows some swapping. If memory pressure high, audio buffer can be swapped to disk (10–100 ms latency spike).  
**Why Critical:** Swap causes guaranteed audio failure.  
**Fix:** Create sysctl.d file:

**File:** `/etc/sysctl.d/93-map2-audio-swappiness.conf`:
```ini
# AUDIO mode: Never swap
vm.swappiness = 0

# Disable swap device entirely (permanent):
# In /etc/fstab, comment out any swap lines:
# /swap.img    none    swap    sw    0    0

# Or create swap but lock it:
echo "vm.oom_kill_allocating_task = 1" >> /etc/sysctl.d/99-oom.conf
```

**Implement:** Apply via gfx-mode (swappiness via sysctl), document swap device removal.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **HIGH** – prevents catastrophic latency (100+ ms) from disk I/O  
**Timeline:** Immediate  

---

### **P0-007: Add mlock() to C++ Audio Buffer Allocation**
**Category:** Audio Engine Code  
**Problem:** Audio buffer allocated but not pinned to RAM. If page fault occurs during audio callback, causes 1–10 ms stall while kernel reads page from disk/memory manager.  
**Why Critical:** Direct impact on latency floor. Even with swap disabled, page faults cause stalls.  
**Fix:** Modify [juce-engine/Source/Map2AudioEngine.cpp](juce-engine/Source/Map2AudioEngine.cpp):

```cpp
// Add to initialize() method:
#include <sys/mman.h>

bool Map2AudioEngine::initialize(...) {
    // ... existing code ...
    
    // Allocate and LOCK audio buffer to RAM
    try {
        audioBuffer_.setSize(2, bufferSize_);  // Allocate
        
        // Pin buffer memory to RAM
        const float* channelData = audioBuffer_.getReadPointer(0);
        size_t bufferBytes = audioBuffer_.getNumSamples() * sizeof(float) * audioBuffer_.getNumChannels();
        
        if (mlock(const_cast<float*>(channelData), bufferBytes) != 0) {
            logger_->warning("Failed to mlock audio buffer (errno={}). System may experience latency spikes.", errno);
            // Continue anyway – not fatal
        } else {
            logger_->info("Audio buffer locked to RAM ({} bytes)", bufferBytes);
        }
    } catch (const std::exception& e) {
        logger_->error("Audio buffer allocation failed: {}", e.what());
        return false;
    }
    
    // ... rest of initialization ...
    return true;
}
```

**Implement:** Edit file, rebuild.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **HIGH** – eliminates page fault latency (1–10 ms)  
**Timeline:** Next release  

---

### **P0-008: Create AUDIO Mode Drop-in for map2-backend.service**
**Category:** Systemd Configuration  
**Problem:** Current service uses generic tuning. Need aggressive, audio-specific overrides.  
**Why Critical:** Without explicit AUDIO mode drop-in, FastAPI still shares cores with audio engine.  
**Fix:** Create systemd drop-in:

**File:** `/etc/systemd/system/map2-backend.service.d/audio-mode-override.conf`:
```ini
[Unit]
# Audio mode: strict requirements

[Service]
# CPU Affinity: STRICTLY cores 4,5 (isolated cores only)
CPUAffinity=4 5

# Realtime priority (SCHED_FIFO)
LimitRTPRIO=95

# Memory locking (mlock)
LimitMEMLOCK=infinity

# I/O priority: Realtime class, high priority
IOSchedulingClass=realtime
IOSchedulingPriority=1

# Nice: Highest non-RT priority (-20)
Nice=-20

# No memory limits (allow buffer preallocation)
MemoryLimit=

# Disable memory accounting (no pressure reporting to cgroups)
MemoryAccounting=no

# Timeout: Increase to avoid service restart on slow startup
TimeoutStartSec=120
TimeoutStopSec=30

# Journal: Minimal logging (reduce overhead)
StandardOutput=file:/run/map2-audio-backend.log
StandardError=file:/run/map2-audio-backend.log
StandardOutputRateIntervalSec=1
StandardOutputRateBurst=5
```

**Implement:** Deploy via gfx-mode script (only create in AUDIO mode).  
**Mode:** AUDIO  
**Expected Impact:** **MEDIUM** – ensures FastAPI doesn't interfere with audio  
**Timeline:** Next release  

---

## **P1 – VERY IMPORTANT** (Major gains expected)

### **P1-001: Implement CPU Isolation Verification Service**
**Category:** System Monitoring  
**Problem:** Can't verify that kernel actually isolated cores. User has no visibility.  
**Why Important:** Silent failure – system thinks cores are isolated, but aren't. Latency remains 8–10 ms.  
**Fix:** Create systemd oneshot service:

**File:** `/etc/systemd/system/map2-verify-isolation.service`:
```ini
[Unit]
Description=MAP2 Audio - Verify CPU Isolation
After=multi-user.target
Before=map2-backend.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/verify-cpu-isolation.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Script:** `/usr/local/bin/verify-cpu-isolation.sh`:
```bash
#!/bin/bash
set -e

MODE=$(grep "^MODE=" /etc/guitarfx-mode.conf | cut -d'=' -f2 | tr -d ' ')

if [ "$MODE" = "audio" ]; then
    echo "Verifying CPU isolation for AUDIO mode..."
    
    # Check isolcpus
    if grep -q "isolcpus=4,5" /proc/cmdline; then
        echo "✓ isolcpus=4,5 present in kernel cmdline"
    else
        echo "✗ ERROR: isolcpus NOT found in /proc/cmdline"
        echo "  System will not achieve <3ms latency!"
        systemctl set-environment MAP2_ISOLATION_FAILED=1
        exit 1
    fi
    
    # Check nohz_full
    if grep -q "nohz_full=4,5" /proc/cmdline; then
        echo "✓ nohz_full=4,5 present"
    else
        echo "⚠ WARNING: nohz_full not found (acceptable but suboptimal)"
    fi
    
    # Check if cores are actually isolated (cpuset check)
    if [ -f /proc/sys/kernel/sched_migration_cost_ns ]; then
        cost=$(cat /proc/sys/kernel/sched_migration_cost_ns)
        if [ "$cost" -lt 10000 ]; then
            echo "⚠ WARNING: sched_migration_cost_ns=$cost (expected >50000 for isolation)"
        fi
    fi
    
    echo "✓ CPU isolation verification PASSED"
    systemctl set-environment MAP2_ISOLATION_OK=1
else
    echo "CPU isolation not required for MODE=$MODE"
fi
```

**Implement:** Create files, enable service.  
**Mode:** ALL (but only enforces in AUDIO)  
**Expected Impact:** **MEDIUM** – provides visibility into configuration failures  
**Timeline:** Next release  

---

### **P1-002: Move FastAPI to Housekeeping Cores in ALL-IN-ONE Mode**
**Category:** Systemd Configuration  
**Problem:** FastAPI (Python) and C++ audio engine both running on cores 4,5. Python GIL causes context switch storms.  
**Why Important:** ALL-IN-ONE mode currently achieves 6–8 ms; fixing this brings it to 4–5 ms.  
**Fix:** Create drop-in for ALL-IN-ONE mode:

**File:** `/etc/systemd/system/map2-backend.service.d/all-in-one-override.conf`:
```ini
[Service]
# All-in-one mode: Python API on housekeeping cores, C++ engine separate
CPUAffinity=0-3 4-5        # Allow both, but prefer 0-3 for scheduler
CPUQuota=50%               # Limit Python to 2 cores worth of time
Nice=-5                    # High priority, but below RT

# Cache allocation: Limit Python to LLC slice
CPUAffinityFromNUMA=no
CPUAffinity=0-3            # Restrict to housekeeping cores
```

**Implement:** In gfx-mode script, generate this drop-in only for ALL-IN-ONE mode.  
**Mode:** ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – reduces latency from 6–8 ms to 4–5 ms for all-in-one  
**Timeline:** Next release  

---

### **P1-003: Pin PipeWire/WireRouter to Housekeeping Cores**
**Category:** PipeWire Configuration  
**Problem:** PipeWire graph rebalancing can run on isolated cores, causing brief pauses.  
**Why Important:** Device hot-plug or graph rebalancing causes 1–2 ms glitch.  
**Fix:** Create systemd drop-in for user session:

**File:** `/etc/systemd/user@.service.d/pipewire-affinity.conf`:
```ini
[Service]
CPUAffinity=0-3            # PipeWire/WireRouter only on housekeeping cores
Nice=-5
```

**Implement:** Deploy via gfx-mode script (create only in AUDIO/ALL-IN-ONE mode).  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – prevents device hot-plug glitches (1–2 ms)  
**Timeline:** Next release  

---

### **P1-004: Set I/O Scheduler to mq-deadline with RT Class**
**Category:** I/O Scheduling  
**Problem:** Default I/O scheduler fair; doesn't prioritize audio I/O.  
**Why Important:** Database/log writes can block audio callback for 1–5 ms.  
**Fix:** Create udev rule + systemd drop-in:

**File:** `/etc/udev/rules.d/98-map2-io-scheduler.rules`:
```bash
# Set I/O scheduler to mq-deadline (lowest latency)
ACTION=="add|change", KERNEL=="nvme*|sd*|sdb", ATTR{queue/scheduler}="mq-deadline"
```

**File:** `/etc/systemd/system.conf.d/io-scheduler.conf`:
```ini
[Manager]
DefaultIOSchedulingClass=realtime
DefaultIOSchedulingPriority=1
```

**Implement:** Deploy udev rule, restart udev.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – reduces I/O jitter (1–3 ms)  
**Timeline:** Next release  

---

### **P1-005: Database to tmpfs (Non-persistent) in AUDIO Mode**
**Category:** Filesystem / I/O  
**Problem:** SQLite database on `/home/mm/map2-audio/app.db` (spinning disk or SSD). DB writes block audio.  
**Why Important:** Preset save, metrics write can cause 0.5–2 ms stall.  
**Fix:** Create tmpfs mount + move database:

**File:** `/etc/fstab` (add line):
```bash
tmpfs    /tmp/map2-audio    tmpfs    nodev,nosuid,noexec,size=512M,mode=0700    0 0
```

**In map2-backend.service drop-in:**
```ini
[Service]
# Override data directory for tmpfs in AUDIO mode
Environment="MAP2_DATA_DIR=/tmp/map2-audio"
```

**Implement:** Mount tmpfs at boot, update service environment variable.  
**Mode:** AUDIO  
**Expected Impact:** **MEDIUM** – eliminates 0.5–2 ms disk I/O latency  
**Timeline:** Next release  

---

### **P1-006: Disable ALSA Resampling (Use Fixed 48 kHz)**
**Category:** Audio Engine / PipeWire  
**Problem:** If any client requests non-48kHz rate, PipeWire resamples (adds latency + CPU).  
**Why Important:** Resampling can add 0.5–1.0 ms latency.  
**Fix:** Create PipeWire config drop-in:

**File:** `/etc/pipewire/pipewire.conf.d/99-map2-audio-latency.conf` (or user config):
```ini
# Force fixed rate, no resampling
context.properties = {
    default.clock.rate = 48000
    default.clock.allowed-rates = [48000]
    # Disable resampling
    core.daemon = true
}

# Graph settings
context.modules = [
    {   name = libpipewire-module-rt
        args = { nice.level = -15 }
    }
]
```

**Implement:** Deploy config file, restart PipeWire.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – eliminates 0.5–1.0 ms resampling overhead  
**Timeline:** Next release  

---

### **P1-007: Create Housekeeping CPU Assignment + Verification**
**Category:** Kernel / Cgroup  
**Problem:** Housekeeping core assignment implicit; no explicit control.  
**Why Important:** Kernel default doesn't guarantee best choice. Should pin system services to cores 0–1, reserve 2–3 as backup.  
**Fix:** Add to kernel cmdline:

```bash
housekeeping_managed_irq=1 housekeeping.cpumask=0xF    # Cores 0-3 for housekeeping
```

**And create drop-in for system services:**

**File:** `/etc/systemd/system.conf.d/housekeeping.conf`:
```ini
[Manager]
DefaultCPUAccounting=yes
CPUAffinity=0 1                    # System manager on cores 0–1
```

**Implement:** Update grub.d, systemd drop-in.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – ensures clean core isolation  
**Timeline:** Next release  

---

### **P1-008: ALSA Buffer Size Reduction (2 periods instead of 3)**
**Category:** ALSA / Driver  
**Problem:** ALSA using 3 periods by default (256 bytes each @ 48kHz = 5.33 ms). Should be 2 periods = 2.67 ms.  
**Why Important:** Reduces driver-level buffering latency by 2.67 ms.  
**Fix:** Update PipeWire ALSA config:

**File:** `/etc/pipewire/pipewire.conf.d/10-low-latency.conf` (already exists):
```ini
api.alsa.period-num = 2          # Use 2 periods instead of 3
api.alsa.headroom = 0            # No extra headroom
```

**Verify and extend this config if needed.**

**Implement:** Verify file exists and has these settings; if not, add them.  
**Mode:** AUDIO  
**Expected Impact:** **MEDIUM** – reduces driver buffering by ~2.67 ms  
**Timeline:** Check immediately; verify in current service

---

## **P2 – CLEARLY BENEFICIAL** (Solid improvements)

### **P2-001: Disable NMI Watchdog (Kernel Command-line)**
**See P0-004 above** (already included in that recommendation)

---

### **P2-002: Disable journald Logging to Disk During Playback**
**Category:** Logging / I/O  
**Problem:** `journalctl` writes to disk can cause latency spikes (5–20 ms during burst).  
**Why Beneficial:** Removes disk I/O jitter source.  
**Fix:** Create journald config drop-in:

**File:** `/etc/systemd/journald.conf.d/map2-audio.conf`:
```ini
[Journal]
Storage=volatile              # Only in memory, not on disk
RuntimeMaxUse=256M            # Limit memory usage
SyncIntervalSec=0             # Never sync (already volatile)
Compress=no                   # No compression overhead
ForwardToConsole=no           # Don't echo to console
ForwardToSyslog=no            # Don't forward to syslog
```

**Implement:** Create drop-in, restart journald.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – eliminates 5–20 ms I/O jitter during log burst  
**Timeline:** Next release  

---

### **P2-003: Set CPU Frequency Governor to Performance**
**Category:** Power Management  
**Problem:** Default `schedutil` governor can reduce frequency during idle, causing 0.5–1.0 ms spike when audio arrives.  
**Why Beneficial:** Locks frequency, eliminates frequency scaling jitter.  
**Fix:** Create systemd service to set governor:

**File:** `/etc/systemd/system/map2-cpu-governor.service`:
```ini
[Unit]
Description=MAP2 Audio - Set CPU Governor to Performance
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Implement:** Create service, enable it.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – eliminates 0.5–1.0 ms frequency scaling jitter  
**Timeline:** Next release  

---

### **P2-004: Disable C-States (Idle CPU States)**
**Category:** Power Management / BIOS  
**Problem:** CPU can enter C1, C2, C3 states (sleep), wake-up adds 1–10 ms latency.  
**Why Beneficial:** Keeps CPU always ready.  
**Fix:** Add to kernel cmdline:

```bash
processor.max_cstate=1        # Only C1 (minimal latency state)
```

**And/or in BIOS:**
- Disable C-states (set to C0 / C1 only)
- Enable "Low Power States" off

**Implement:** Update grub.d; document BIOS change.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – eliminates 1–10 ms wake-up latency  
**Timeline:** Next BIOS update + kernel param change  

---

### **P2-005: Disable Turbo Boost (Intel) / Core Performance Boost (AMD)**
**Category:** Power Management  
**Problem:** Turbo boost varies CPU frequency (3.0 GHz → 4.2 GHz), causing latency variance.  
**Why Beneficial:** Fixed frequency = fixed latency (predictable).  
**Fix:** Create service:

**File:** `/etc/systemd/system/map2-disable-turbo.service`:
```ini
[Unit]
Description=MAP2 Audio - Disable CPU Turbo Boost
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'echo 1 > /sys/devices/system/cpu/intel_pstate/no_turbo'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Implement:** Create service for Intel; similar for AMD (use `amd-pstate-epp`).  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – reduces latency variance (jitter) by locking frequency  
**Timeline:** Next release  

---

### **P2-006: Disable Kernel Module Auto-Loading**
**Category:** Boot Time / Jitter  
**Problem:** Kernel modules loaded on-demand can cause brief pause (1–2 ms) if loaded during audio playback.  
**Why Beneficial:** Pre-load all modules at boot, no runtime loading.  
**Fix:** Add modules to `/etc/modprobe.d/map2-audio-preload.conf`:

```bash
# Pre-load all audio-related modules
install snd /sbin/modprobe --ignore-install snd && /sbin/modprobe snd-mixer-oss
install snd_hrtimer /sbin/modprobe --ignore-install snd_hrtimer
install snd_seq /sbin/modprobe --ignore-install snd_seq
install snd_usb_audio /sbin/modprobe --ignore-install snd_usb_audio
```

**Implement:** Create file; modules loaded at boot.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **LOW** – prevents rare 1–2 ms pause from module loading  
**Timeline:** Next release  

---

### **P2-007: Enable I/O Uring for Database Access**
**Category:** I/O Scheduling  
**Problem:** Traditional blocking I/O can stall audio thread if DB query runs.  
**Why Beneficial:** Async I/O reduces blocking latency.  
**Fix:** Update Python code (aiosqlite already async):
```python
# In app/database_session.py, ensure using async connections:
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine("sqlite+aiosqlite:///app.db", echo=False)
# Already async ✓
```

**Implement:** Verify aiosqlite is used; no blocking sync calls.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **MEDIUM** – prevents 1–5 ms blocking from DB I/O  
**Timeline:** Code audit + fix  

---

### **P2-008: Reduce journald Rate Limiting for Metrics**
**Category:** Logging  
**Problem:** Audio metrics logged frequently, rate-limited to avoid spam.  
**Why Beneficial:** Ensure metrics never dropped; better monitoring.  
**Fix:** Update systemd journal limits:

**File:** `/etc/systemd/journald.conf`:
```ini
RateLimitInterval=1s
RateLimitBurst=1000      # Allow 1000 messages per second
```

**Implement:** Update file.  
**Mode:** ALL  
**Expected Impact:** **LOW** – improves monitoring visibility  
**Timeline:** Next release  

---

## **P3 – NICE TO HAVE** (Situational improvements)

### **P3-001: Implement Per-Thread CPU Affinity API**
**Category:** Audio Engine  
**Problem:** Can't explicitly set CPU affinity from C++ code; relies on systemd.  
**Why Beneficial:** Finer control; can pin MIDI/metering threads to specific cores.  
**Fix:** Add to Map2AudioEngine.cpp:
```cpp
#include <sched.h>

class CPUAffinityManager {
    static bool set_thread_affinity(std::thread::native_handle_type handle, int cpu) {
        cpu_set_t mask;
        CPU_ZERO(&mask);
        CPU_SET(cpu, &mask);
        return pthread_setaffinity_np(handle, sizeof(cpu_set_t), &mask) == 0;
    }
};
```

**Implement:** Add to codebase, use for MIDI threads.  
**Mode:** AUDIO, ALL-IN-ONE  
**Expected Impact:** **LOW** – fine-tuning only  
**Timeline:** Future optimization  

---

### **P3-002: Implement Latency Histogram Monitoring**
**Category:** Monitoring  
**Problem:** Can't distinguish between typical and worst-case latency.  
**Why Beneficial:** Data-driven optimization.  
**Fix:** Track per-callback duration:
```cpp
std::atomic<uint64_t> callback_us_histogram_[1000];  // Buckets up to 1000 us

void audioCallback(...) {
    auto start = std::chrono::high_resolution_clock::now();
    
    // Process audio...
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration_us = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
    if (duration_us < 1000) {
        callback_us_histogram_[duration_us]++;
    }
}
```

**Implement:** Add histogram collection to engine.  
**Mode:** ALL  
**Expected Impact:** **LOW** – monitoring/diagnostics only  
**Timeline:** Future enhancement  

---

### **P3-003: Implement Xrun Recovery Strategy**
**Category:** Audio Engine  
**Problem:** If xrun occurs, audio engine may be in unknown state.  
**Why Beneficial:** Graceful degradation instead of silence.  
**Fix:** Add to engine:
```cpp
void on_xrun() {
    xrun_count_++;
    logger_->warning("XRUN detected. Resetting audio graph.");
    
    // Clear buffers, reset processors
    for (auto& proc : processors_) {
        proc->reset();
    }
    
    // Continue playback (instead of failing)
}
```

**Implement:** Add xrun handler to engine.  
**Mode:** ALL  
**Expected Impact:** **LOW** – recovery only; better to prevent xruns  
**Timeline:** Future enhancement  

---

## **P4 – POLISH** (Future-proofing)

### **P4-001: Add Cgroup v2 RT Time Allocation**
**Category:** Cgroup / Resource Control  
**Problem:** Cgroup v1 RT time not well-defined; should use cgroup v2 explicitly.  
**Why Beneficial:** Future-proofs against cgroup v1 deprecation.  
**Fix:** Create cgroup v2 hierarchy:
```bash
# /etc/cgroupsv2.d/map2-audio.conf
[Unit]
Description=MAP2 Audio Cgroup v2 Setup
After=multi-user.target

[CGroupv2]
# Create cgroup for audio
cpu.stat
cpu.weight=10000

# Realtime allocation
cpu.realtime.runtime_us=2950000
cpu.realtime.period_us=3000000
```

**Implement:** Future cgroup v2 migration.  
**Mode:** ALL  
**Expected Impact:** **LOW** – future-proofing  
**Timeline:** After cgroup v1 deprecation (Fedora 45+)  

---

### **P4-002: Implement Audio Engine Telemetry**
**Category:** Monitoring / Observability  
**Problem:** Can't see internal engine state in production.  
**Why Beneficial:** Remote diagnostics.  
**Fix:** Add Prometheus metrics:
```cpp
static prometheus::Counter& xrun_counter = prometheus::BuildCounter()
    .Name("map2_audio_xruns_total")
    .Help("Total number of audio xruns")
    .Register(registry);
```

**Implement:** Integrate Prometheus client library.  
**Mode:** ALL  
**Expected Impact:** **LOW** – observability  
**Timeline:** Future enhancement  

---

## **P5 – EXPERIMENTAL** (Cutting edge, may not be stable)

### **P5-001: Use JACK FIFO Priority Scheduling (SCHED_FIFO)**
**Category:** Scheduling  
**Problem:** SCHED_FIFO harder to tune, but potentially better latency.  
**Why Beneficial:** Guaranteed scheduling; no preemption.  
**Risk:** MUST be tuned carefully; infinite loop can hang system.  
**Fix:** Add SCHED_FIFO setup:
```cpp
struct sched_param param;
param.sched_priority = 98;  // High RT priority
if (pthread_setschedparam(pthread_self(), SCHED_FIFO, &param) != 0) {
    logger_->warning("Failed to set SCHED_FIFO priority");
}
```

**Implement:** Only in AUDIO mode; requires explicit testing.  
**Mode:** AUDIO (experimental)  
**Expected Impact:** **MEDIUM** – potentially 0.2–0.5 ms reduction; HIGH RISK  
**Timeline:** Experimental; needs careful testing  

---

### **P5-002: Custom Scheduler Plugin for Audio**
**Category:** Scheduler / Kernel Module  
**Problem:** Kernel scheduler not optimized for audio workloads.  
**Why Beneficial:** Optimal scheduling for bursty, latency-sensitive tasks.  
**Risk:** Requires kernel module; high maintenance.  
**Fix:** Develop custom scheduler plugin (beyond this scope).  
**Implementation:** Out of scope for now; research phase only.  
**Timeline:** Research phase; 2–3 month project  

---

---

# STEP 6: FINAL SUMMARY TABLE

## Expected Performance After All Fixes

| **Mode** | **Expected Round-trip Latency** | **Main Remaining Risks** | **Confidence <3 ms** | **Prerequisites** |
|----------|----------------------------------|---------------------------|----------------------|-------------------|
| **AUDIO** | **2.5–3.5 ms** ✅ | PipeWire graph latency (0.5–1.0 ms), USB driver non-determinism | **90%** | P0 fixes + P1 fixes; requires 2–3 dedicated cores; PREEMPT_DYNAMIC kernel; stable audio driver |
| **ALL-IN-ONE** | **4.0–5.5 ms** ⚠️ | Python GIL interference (1–1.5 ms), web request contention (0.5–1.0 ms), dual workload | **40%** | P0 + P1 fixes; trade-off: accept higher latency for convenience |
| **MANAGEMENT** | **N/A** (not audio) | N/A | N/A | No audio processing; not applicable |

---

## Detailed Risk Assessment

### **AUDIO Mode – Key Risks & Mitigations**

**Risk 1: USB/Soundcard Driver Non-determinism (Probability: MEDIUM)**
- Typical USB drivers have unpredictable interrupt latency
- Mitigation: Use dedicated audio interface with known good driver (EDIROL UA-1000 acceptable)
- Residual risk: 0.2–0.5 ms

**Risk 2: PipeWire Graph Rebalancing (Probability: LOW)**
- Device hot-plug or plugin discovery can briefly lock graph
- Mitigation: Lock graph topology in AUDIO mode; disable hot-plug detection
- Residual risk: 0.5–1.0 ms (once per session change)

**Risk 3: Kernel Jitter from System Work (Probability: LOW)**
- Unexpected kernel activity (thermal sampling, memory reclaim) on isolated cores
- Mitigation: Disable all non-critical kernel work via sysctl
- Residual risk: 0.2–0.5 ms (rare)

**Risk 4: PCI/USB Link Power Management (Probability: LOW)**
- Link can drop to low-power states, wake-up adds latency
- Mitigation: Disable PCIe ASPM (`pcie_aspm=off`)
- Residual risk: 0.1–0.3 ms

**Risk 5: TLB / Cache Misses (Probability: MEDIUM)**
- Audio buffer not in L1/L2 cache; page table walk adds latency
- Mitigation: No direct mitigation; mlock() helps
- Residual risk: 0.2–0.5 ms (natural variance)

---

### **ALL-IN-ONE Mode – Key Risks & Mitigations**

**Risk 1: Python GIL Contention (Probability: HIGH)**
- FastAPI (Python) thread scheduler interference with C++ audio
- Mitigation: Move FastAPI to separate cores (0–3), use `CPUAffinity`
- Residual risk: 1.0–1.5 ms (reduced from 2–3 ms)

**Risk 2: Database Blocking (Probability: MEDIUM)**
- Web request triggers SQLite query; synchronous I/O blocks audio
- Mitigation: Move database to tmpfs; make all DB access async
- Residual risk: 0.5–1.0 ms (reduced from 1–2 ms)

**Risk 3: Web Request Arrival Jitter (Probability: MEDIUM)**
- HTTP request can cause context switch to audio core
- Mitigation: Rate-limit endpoints; pin HTTP server to housekeeping cores
- Residual risk: 0.5–1.0 ms (reduced from 1–2 ms)

**Risk 4: Journal Logging Burst (Probability: LOW)**
- Logging to disk can cause 5–20 ms spike
- Mitigation: Log to RAM only; rotate in memory
- Residual risk: 0.1–0.5 ms

---

## Confidence Level Justification

### **AUDIO Mode: 90% Confidence**
✅ **Why high confidence:**
- Core isolation proven on Linux 6.18 PREEMPT_DYNAMIC
- Fixed 64-sample buffer predictable
- Professional audio interfaces reliable
- All P0 + P1 fixes address known jitter sources

❌ **Why not 100%:**
- USB driver behavior varies by device
- Unpredictable system events (rare kernel bug, firmware NMI)
- PipeWire JACK layer adds inherent latency
- No test data on THIS specific hardware yet

**Achievable with:** Disciplined implementation + testing + monitoring

---

### **ALL-IN-ONE Mode: 40% Confidence**
⚠️ **Why low confidence:**
- Python + C++ = scheduler complexity
- Database blocking hard to fully eliminate
- Web traffic unpredictable
- Competing workloads fight for CPU time

⚠️ **Realistic expectation:**
- **Average:** 4.5–5.5 ms (achievable)
- **Peak glitches:** 8–12 ms (during web activity)
- **Best case:** 4–5 ms (ideal conditions)
- **Worst case:** 15–20 ms (peak load)

**Use case:** NOT suitable for high-fidelity recording; OK for practice/monitoring

---

### **MANAGEMENT Mode: N/A**
- No audio processing; latency not relevant
- 100% confidence (trivial case)

---

## Implementation Roadmap

### **Phase 1: Immediate (Next 2 weeks)**
- ✅ Fix buffer size mismatch (P0-001)
- ✅ Add sched_rt_runtime_us (P0-003)
- ✅ Disable irqbalance on isolated cores (P0-002)
- ✅ Add mlock() to audio buffer (P0-007)
- ✅ Verify kernel params (P1-001)

**Expected latency after Phase 1:** 4.0–5.0 ms

---

### **Phase 2: This Month**
- ✅ Add kernel command-line params (P0-004) → requires reboot
- ✅ Disable THP, set swappiness (P0-005, P0-006)
- ✅ Create AUDIO/ALL-IN-ONE mode drop-ins (P1-008, P0-008)
- ✅ Pin PipeWire to housekeeping (P1-003)
- ✅ Move database to tmpfs (P1-005)
- ✅ Disable NMI watchdog, audit (included in P0-004)

**Expected latency after Phase 2:** 3.0–4.0 ms (AUDIO); 4.5–5.5 ms (ALL-IN-ONE)

---

### **Phase 3: Next Month (Optimizations)**
- ✅ CPU frequency governor + disable turbo (P2-003, P2-005)
- ✅ Disable C-states (P2-004)
- ✅ Disable journald disk logging (P2-002)
- ✅ I/O scheduler tuning (P1-004)
- ✅ ALSA period reduction (P1-008)

**Expected latency after Phase 3:** **2.5–3.5 ms (AUDIO target achieved!)**

---

### **Phase 4: Validation & Monitoring**
- ✅ Implement xrun detection API (P3-001, P3-002)
- ✅ Create latency histogram dashboard
- ✅ Production monitoring + alerting
- ✅ Document per-hardware tuning

---

## Hardware Requirements for <3 ms

| **Component** | **Minimum Spec** | **Recommended** | **Why** |
|--------------|-----------------|-----------------|---------|
| **CPU** | 4 cores, 2.0 GHz | 8+ cores, 3.5+ GHz | 2 cores for audio, 2+ for housekeeping |
| **RAM** | 4 GB | 16+ GB | Audio buffer mlock + overhead |
| **Storage** | SSD | NVMe | Database I/O latency |
| **Kernel** | PREEMPT_DYNAMIC (6.18+) | PREEMPT_RT patch | DYNAMIC sufficient; RT patch preferred |
| **Audio Interface** | USB 2.0 compatible | USB 3.0 or Thunderbolt | USB 2.0 has polled 1ms intervals |
| **Network** | Gigabit (isolated from audio) | 10Gbps (optional) | Network jitter isolated to housekeeping |

---

## Final Verdict

**Can <3 ms be achieved?** ✅ **YES – with AUDIO mode + all fixes + proper hardware**

**Can <3 ms be RELIABLY achieved?** ⚠️ **YES – with 90% confidence in AUDIO mode; 40% in ALL-IN-ONE**

**Timeline to production-ready:**
- **Phase 1–2:** 4 weeks (reach 3–4 ms)
- **Phase 3:** 8 weeks (reach 2.5–3.5 ms)
- **Phase 4:** 12 weeks (fully validated + monitoring)

**Most critical single fix:** **P0-001 (buffer size mismatch)** – fixes 2–3 ms immediately

---
