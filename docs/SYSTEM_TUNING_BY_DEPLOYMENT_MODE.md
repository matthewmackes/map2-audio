# ⚙️ System Tuning & Performance Configuration by Deployment Mode

## Overview

Performance tuning is **deployment-mode-aware**:
- **Control Nodes**: Optimized for API throughput, concurrency, request handling
- **Audio Nodes**: Optimized for low-latency real-time audio processing (JUCE design)
- **All-in-One**: Tuned as Audio Node (audio performance is the constraint)

---

## Control Node Tuning

### CPU Frequency Scaling

**Goal:** Maximize CPU performance for API throughput.

```bash
# Set CPU governor to 'performance' (no frequency scaling)
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Disable CPU idle states (keep CPU active)
echo 1 | sudo tee /sys/module/cpuidle/parameters/off
```

**Result:** CPU runs at max frequency, minimal latency for API requests.

### Memory Management

**Goal:** Maximize available cache, reduce swap usage.

```bash
# Increase file system cache
sysctl -w vm.dirty_ratio=20
sysctl -w vm.dirty_background_ratio=5

# Disable swap (or reduce swappiness to 0)
sysctl -w vm.swappiness=0

# Increase memory available for applications
sysctl -w vm.overcommit_memory=1
```

**Result:** More RAM for Python/Node.js services, faster request handling.

### I/O Scheduling

**Goal:** Prioritize API request handling over background tasks.

```bash
# Use 'mq-deadline' or 'none' for NVMe/SSD (lower latency)
echo mq-deadline | sudo tee /sys/block/nvme0n1/queue/scheduler

# Increase I/O queue depth
echo 256 | sudo tee /sys/block/nvme0n1/queue/nr_requests

# Reduce I/O wait time
sysctl -w vm.max_map_count=262144
```

**Result:** Faster disk access for API/database operations.

### Network Tuning (API Traffic)

**Goal:** Handle high concurrent connections.

```bash
# Increase socket buffer sizes
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
sysctl -w net.ipv4.tcp_rmem="4096 87380 134217728"
sysctl -w net.ipv4.tcp_wmem="4096 65536 134217728"

# Increase connection backlog
sysctl -w net.core.somaxconn=4096
sysctl -w net.ipv4.tcp_max_syn_backlog=4096

# Enable TCP fast open
sysctl -w net.ipv4.tcp_fastopen=3

# Tune TCP keepalive
sysctl -w net.ipv4.tcp_keepalive_time=300
sysctl -w net.ipv4.tcp_keepalive_intvl=60
sysctl -w net.ipv4.tcp_keepalive_probes=3
```

**Result:** Can handle 1000+ concurrent connections, lower latency for API calls.

### Process Priority

**Goal:** Ensure API/web services get CPU time.

```bash
# Set API service nice level to -10 (higher priority)
sudo nice -n -10 /usr/bin/python3 /opt/map2/app/main.py

# Or via systemd service unit
[Service]
Nice=-10
CPUSchedulingPolicy=rr
CPUSchedulingPriority=10
```

**Result:** API requests prioritized over background tasks.

### System Services Configuration

**Control Node `/etc/map2/system-tuning.conf`:**

```ini
[deployment]
mode = control_node

[cpu]
governor = performance
idle_disabled = true
frequency_boost = enabled

[memory]
swappiness = 0
dirty_ratio = 20
overcommit_memory = 1

[io]
scheduler = mq-deadline
queue_depth = 256

[network]
tcp_buffer_max = 134217728
socket_backlog = 4096
tcp_fastopen = true

[process]
api_nice_level = -10
api_cpu_affinity = all
```

---

## Audio Node Tuning (Current JUCE Design)

### CPU Frequency Scaling

**Goal:** Consistent, predictable latency for real-time audio.

```bash
# Set CPU governor to 'performance' (no frequency scaling)
# OR use 'schedutil' with conservative tuning
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Disable frequency boosting (turbo boost)
echo 0 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo

# Lock AUDIO thread to specific CPU cores (avoid context switching)
```

**Result:** Consistent CPU frequency → predictable latency.

### Memory Management

**Goal:** Minimize page faults and swapping (critical for real-time).

```bash
# Lock process memory (prevent swapping)
# In systemd service:
[Service]
MemoryLocking=yes

# Or via ulimit
ulimit -l unlimited

# Disable swap entirely
swapoff -a

# Reduce memory pressure
sysctl -w vm.swappiness=0
```

**Result:** Real-time threads never get paged out → no audio dropouts.

### Real-Time Scheduling

**Goal:** Guarantee audio thread gets CPU time.

```bash
# Set JACK/ALSA to real-time priority
# In systemd service:
[Service]
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=80

# Or via rtkit (runtime privilege elevation)
sudo systemctl enable rtkit-daemon.service
```

**Result:** Audio callback thread runs at real-time priority → <10ms latency.

### I/O Scheduling

**Goal:** Prevent I/O interference with audio processing.

```bash
# Use 'deadline' or 'none' scheduler
echo none | sudo tee /sys/block/*/queue/scheduler

# Reduce I/O wait
sysctl -w vm.dirty_ratio=40
sysctl -w vm.dirty_background_ratio=10
```

**Result:** Audio not interrupted by background I/O.

### CPU Affinity

**Goal:** Isolate audio cores, reduce context switching.

```bash
# Pin AUDIO thread to dedicated cores (e.g., cores 0-1)
taskset -c 0-1 /opt/map2/bin/map2-audio

# Isolate kernel threads from audio cores
# (via kernel boot param: isolcpus=0-1)
```

**Result:** Audio thread never competes with other processes.

### System Services Configuration

**Audio Node `/etc/map2/system-tuning.conf`:**

```ini
[deployment]
mode = audio_node

[cpu]
governor = performance
frequency_boost = disabled
cpu_affinity = 0-1  # isolate cores 0-1 for audio

[memory]
swappiness = 0
memory_locking = enabled
overcommit_memory = 2

[io]
scheduler = none
dirty_ratio = 40
dirty_background_ratio = 10

[realtime]
scheduling_policy = fifo
scheduling_priority = 80
rtkit_enabled = true

[audio]
jack_priority = real_time
alsa_priority = real_time
preemption = full
```

---

## All-in-One Mode Tuning

**Rule:** Tune as **Audio Node** (audio is the constraint).

Audio processing is the bottleneck, so prioritize that. API/control plane can tolerate slightly higher latency if it means audio stability.

```ini
[deployment]
mode = all_in_one

# Inherit Audio Node tuning, with minor adjustments for web UI
[cpu]
governor = performance
frequency_boost = disabled

[memory]
swappiness = 0
memory_locking = enabled

[io]
scheduler = none

[realtime]
scheduling_policy = fifo
scheduling_priority = 80
```

---

## Tuning Automation (Setup Wizard)

The setup wizard should **auto-apply** these settings during deployment configuration.

### Phase 1: Detection

```python
# During deployment setup:
if deployment_mode == "CONTROL_NODE":
    apply_control_node_tuning()
elif deployment_mode == "AUDIO_NODE":
    apply_audio_node_tuning()
elif deployment_mode == "ALL_IN_ONE":
    apply_audio_node_tuning()  # Audio is constraint
```

### Phase 2: Application

```python
class SystemTuner:
    """Apply system tuning based on deployment mode"""
    
    async def apply_tuning(self, mode: DeploymentMode):
        """Apply CPU, memory, I/O tuning"""
        
        if mode == DeploymentMode.CONTROL_NODE:
            self.tune_cpu_for_performance()
            self.tune_memory_for_throughput()
            self.tune_io_for_concurrency()
            self.tune_network_for_api()
            
        elif mode == DeploymentMode.AUDIO_NODE:
            self.tune_cpu_for_realtime()
            self.tune_memory_for_realtime()
            self.tune_io_for_audio()
            self.setup_realtime_priority()
            self.isolate_audio_cores()
            
        elif mode == DeploymentMode.ALL_IN_ONE:
            self.apply_audio_node_tuning()  # Audio priority
            
    def tune_cpu_for_performance(self):
        """Control Node: Max performance"""
        os.system("echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor")
        os.system("echo 1 | tee /sys/module/cpuidle/parameters/off")
        
    def tune_cpu_for_realtime(self):
        """Audio Node: Predictable latency"""
        os.system("echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor")
        os.system("echo 1 | tee /sys/devices/system/cpu/intel_pstate/no_turbo")
```

### Phase 3: Verification

Boot splash should show applied tuning:

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM TUNING                                               │
├─────────────────────────────────────────────────────────────┤
│ Mode:             AUDIO-NODE                                │
│ CPU Governor:     performance (real-time optimized)         │
│ Memory Locking:   enabled (no swap)                         │
│ Real-time Sched:  FIFO priority 80                          │
│ CPU Affinity:     cores 0-1 isolated                        │
│ I/O Scheduler:    none (low latency)                        │
│ Latency Target:   <10ms (verified)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Requirements

### Files to Create/Modify

- `app/services/system_tuner.py` - Tuning logic
- `app/config/tuning_profiles.py` - Per-mode tuning configs
- `/etc/map2/system-tuning.conf` - Persistent tuning config
- `scripts/apply-system-tuning.sh` - Shell-based fallback
- `tui/screens/tuning_verification_screen.py` - Verify tuning applied

### Systemd Service Units

**Control Node:**
```
[Service]
Nice=-10
CPUSchedulingPolicy=other
CPUSchedulingPriority=0
MemoryLimit=unlimited
LimitNOFILE=65536
```

**Audio Node:**
```
[Service]
Nice=-20
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=80
CPUAffinity=0-1
MemoryLocking=yes
LimitRTPRIO=unlimited
```

### Success Metrics

| Metric | Control Node | Audio Node |
|--------|--------------|-----------|
| **API Latency** | <10ms p99 | N/A |
| **Audio Latency** | N/A | <5ms p99 |
| **Concurrent Connections** | 1000+ | N/A |
| **CPU Context Switches** | High (ok) | Low (<100/s) |
| **Memory Pages Swapped** | 0 | 0 |
| **Real-time Priority** | No | Yes (FIFO 80) |
| **Frequency Scaling** | Disabled | Disabled |

---

## Integration with Deployment Plan

**Phase 1 Addition:**
- [ ] Create `app/services/system_tuner.py` with per-mode profiles
- [ ] Create systemd service units with mode-specific settings
- [ ] Add tuning configuration to `DeploymentConfig`

**Phase 2 Addition:**
- [ ] Add tuning verification to boot splash
- [ ] Show applied tuning in status screen
- [ ] Allow manual tuning adjustments via UI

**Phase 3 Addition:**
- [ ] Automated tuning during setup wizard
- [ ] Pre-flight check for tuning prerequisites
- [ ] Tuning rollback on failure

---

**Status:** ✅ Specification Complete
