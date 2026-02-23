# AVB/TSN Network Audio Setup Guide

Complete guide for installing, validating, and removing IEEE 1722 AVTP network audio with TSN capabilities on MAP2 Audio Platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Hardware Requirements](#hardware-requirements)
3. [Software Dependencies](#software-dependencies)
4. [Quick Start](#quick-start)
5. [Detailed Setup](#detailed-setup)
6. [Configuration](#configuration)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)
9. [Uninstallation](#uninstallation)
10. [Failure Recovery](#failure-recovery)
11. [Advanced Topics](#advanced-topics)

---

## Overview

### What is AVB/TSN?

AVB (Audio Video Bridging) / TSN (Time-Sensitive Networking) enables deterministic low-latency (<2ms) audio streaming over Ethernet using IEEE standards:

- **IEEE 1722 (AVTP)**: Audio Video Transport Protocol for Layer 2 streaming
- **IEEE 802.1AS (gPTP)**: Precision time synchronization (<1μs accuracy)
- **IEEE 802.1Qav (CBS)**: Credit-Based Shaper for traffic priority
- **IEEE 802.1Qbv**: Time-Aware Shaper for scheduled traffic
- **IEEE 802.1CB**: Frame replication for redundancy

### Why AVB for MAP2?

- **Ultra-low latency**: <2ms end-to-end for multi-node audio routing
- **Deterministic**: Guaranteed delivery with bounded latency/jitter
- **Scalable**: N-to-M audio routing across cluster nodes
- **Synchronized**: Sub-microsecond clock sync for phase-coherent audio
- **Professional**: Industry standard for live sound, broadcast, recording

### Default-On Design With Explicit Opt-Out

AVB is installed by default in the host installer workflow:

- `install_on_new_host.sh` now runs `scripts/setup_avb.sh --yes` by default.
- Skip AVB during installation with `--skip-avb`.
- Remove AVB after installation with `--uninstall-avb` or `scripts/uninstall_avb.sh`.
- AVB remains explicitly disable-able at build/runtime with `-DUSE_AVB=OFF` and `avb.enabled=false`.
- Graceful degradation remains: missing TSN hardware logs warnings and AVB reports unavailable without crashing core audio services.

---

## Hardware Requirements

### Critical: TSN-Capable Network Interface

**Required Features:**
- IEEE 802.1AS (gPTP) hardware timestamping
- IEEE 802.1Qav (CBS) traffic shaping offload
- ETF (Earliest TxTime First) qdisc support
- Hardware PHC (PTP Hardware Clock)

**Recommended NICs:**

| Model | Chipset | Link Speed | Status | Notes |
|-------|---------|------------|--------|-------|
| **Intel I210** | I210-AT/IS | 1 Gbps | ✅ Recommended | Best support, <$40 |
| **Intel I225** | I225-LM/IT | 2.5 Gbps | ✅ Excellent | Newer, <$50 |
| Intel I350 | I350-T4 | 1 Gbps | ⚠️ Limited | Older, basic TSN |
| Marvell 88E6352 | (switch chip) | 1 Gbps | ⚠️ Switch only | Embedded switches |

**Budget Option:**
- Intel I210-AT PCIe card: ~$35-40 USD on eBay/Amazon
- Verify TSN support: `ethtool -T <interface>` must show `hardware-transmit`

### System Requirements

- **OS**: Linux kernel ≥5.10 (gPTP support)
  - Tested: Fedora 43, Ubuntu 24.04, Debian 12
  - Real-time kernel recommended (PREEMPT_RT patch)
- **CPU**: Multi-core (≥4 cores for RT isolation)
- **RAM**: ≥4 GB (8 GB for multi-stream)
- **Disk**: ≥500 MB for dependencies

### Network Topology

**Minimum (2 nodes):**
```
[MAP2 Node A] <---> [MAP2 Node B]
  (I210 NIC)   Cat6   (I210 NIC)
```

**Recommended (TSN switch):**
```
        [TSN-capable Switch]
        (e.g., Marvell 88E6352)
         /       |        \
[Node A]     [Node B]    [Node C]
```

**TSN switches** (optional, enhances reliability):
- Ensure multi-hop determinism
- IEEE 802.1Qbv scheduled traffic
- Redundant paths via 802.1CB

---

## Software Dependencies

### Required Packages

| Package | Purpose | Install Command (Fedora) | Install Command (Ubuntu) |
|---------|---------|---------------------------|--------------------------|
| **linuxptp** | gPTP daemon (ptp4l, phc2sys) | `dnf install linuxptp` | `apt install linuxptp` |
| **mrpd/msrpd** | MSRP/SRP admission daemon | `dnf install mrpd` (or auto-build fallback) | `apt install msrpd` (or auto-build fallback) |
| **libavtp** | IEEE 1722 AVTP library | `dnf install libavtp-devel` | `apt install libavtp-dev` |
| **iproute2-tc** | Traffic control (tc) | `dnf install iproute-tc` | (included in iproute2) |
| **ethtool** | NIC feature detection | `dnf install ethtool` | `apt install ethtool` |

### Build Dependencies (if compiling with AVB)

```bash
# C++ build deps
cmake >=3.18
g++ >=11 or clang >=14
pkg-config

# JUCE deps
libasound2-dev (ALSA)
libjack-jackd2-dev (JACK)
```

### Optional (for development/debugging)

```bash
# Wireshark with AVTP dissector
dnf install wireshark-cli tshark

# Performance profiling
dnf install perf bcc-tools

# Thread/memory analysis
dnf install valgrind clang-tools-extra  # ThreadSanitizer
```

---

## Quick Start

### 0. Full Host Install (AVB Enabled by Default)

```bash
sudo bash install_on_new_host.sh
```

Common AVB control flags:

```bash
sudo bash install_on_new_host.sh --skip-avb          # Install MAP2 without AVB setup
sudo bash install_on_new_host.sh --uninstall-avb     # Remove AVB configuration after rebuild
sudo bash install_on_new_host.sh --avb-interface enp2s0
```

### 1. Pre-flight Check (Dry Run)

Verify hardware compatibility **without making system changes**:

```bash
cd /path/to/map2-audio
sudo scripts/setup_avb.sh --dry-run
```

**Expected Output:**
```
✓ TSN-capable NIC detected: enp2s0 (Intel I210)
✓ Hardware timestamping: supported
✓ Kernel version: 6.18.5 (OK)
✓ All dependencies available
→ Dry run complete. Run without --dry-run to install.
```

### 2. Automated Setup

This is the same script the installer runs by default.

**Interactive mode** (prompts before changes):
```bash
sudo scripts/setup_avb.sh
```

**Unattended mode** (auto-confirm, for scripts):
```bash
sudo scripts/setup_avb.sh --yes
```

This script will:
1. Install linuxptp and libavtp (if missing)
2. Configure PTP (ptp4l + phc2sys)
3. Apply TSN qdiscs (mqprio, CBS, ETF)
4. Create VLAN 2 for AVB traffic
5. Set up systemd services
6. Create `/etc/map2/avb-enabled` marker file

### 3. Build MAP2 with AVB Support

```bash
cd juce-engine
cmake -B build
cmake --build build --config Release -j$(nproc)
```

`USE_AVB` defaults to `ON`; pass `-DUSE_AVB=OFF` only when you intentionally want a non-AVB build.

Verify AVB symbols present:
```bash
nm build/libMap2AudioEngine.so | grep -i avb
# Should show AvbAudioIODevice, AvbStream, etc.
```

### 4. Enable AVB in Config

`setup_avb.sh` writes AVB runtime config automatically. Use manual edits only for overrides.

Edit `~/.map2/config.json`:
```json
{
  "avb": {
    "enabled": true,
    "interface": "enp2s0",
    "ptp_domain": 0,
    "ptp_priority1": 128,
    "max_streams": 8
  }
}
```

Or use environment variable:
```bash
export MAP2_AVB_ENABLED=true
export MAP2_AVB_INTERFACE=enp2s0
```

### 5. Restart MAP2 Backend

```bash
sudo systemctl restart map2-backend
```

### 6. Verify

Check AVB status:
```bash
curl http://localhost:8080/api/avb/status
```

**Expected JSON:**
```json
{
  "enabled": true,
  "available": true,
  "interface": "enp2s0",
  "ptp": {
    "available": true,
    "state": "SLAVE",
    "offset_ns": 42
  }
}
```

Check SRP daemon and admission pipeline:
```bash
curl http://localhost:8080/api/avb/srp/status
curl "http://localhost:8080/api/avb/srp/admissions?limit=20"
```

If strict SRP mode is enabled (`avb.srp.enabled=true` and `avb.srp.required=true`), AVB connect paths return HTTP `409` when admission fails, with remediation hints in the response payload.

---

## Detailed Setup

### Step 1: Hardware Detection

Identify TSN-capable NICs:

```bash
for iface in /sys/class/net/*; do
    iface=$(basename "$iface")
    [[ "$iface" == "lo" ]] && continue

    echo "=== $iface ==="
    ethtool -i "$iface" | grep driver
    ethtool -T "$iface" 2>/dev/null | grep -E "hardware-transmit|hardware-receive"

    # Check for Intel I210/I225
    lspci -vnn | grep -A5 "Ethernet controller.*Intel.*I2[12]"
done
```

**Output for Intel I210:**
```
=== enp2s0 ===
driver: igb
hardware-transmit (phc0)
hardware-receive (phc0)

01:00.0 Ethernet controller [0200]: Intel Corporation I210 Gigabit Network Connection [8086:1533]
    Capabilities: [A0] Express Endpoint, MSI 00
```

### Step 2: Install Dependencies

**Fedora 43:**
```bash
sudo dnf install -y \
    linuxptp \
    libavtp-devel \
    iproute-tc \
    ethtool \
    avahi-tools
```

**Ubuntu 24.04:**
```bash
sudo apt update
sudo apt install -y \
    linuxptp \
    libavtp-dev \
    iproute2 \
    ethtool \
    avahi-utils
```

Verify installations:
```bash
ptp4l -v        # Should show version ≥3.0
tc -V           # Should show iproute2 ≥5.10
```

### Step 3: Configure PTP (IEEE 802.1AS gPTP)

Create `/etc/ptp4l.conf`:

```ini
# IEEE 802.1AS gPTP profile
[global]
transportSpecific       0x1
ptp_dst_mac             01:80:C2:00:00:0E
network_transport       L2
delay_mechanism         P2P
time_stamping           hardware

# gPTP specific
priority1               128
priority2               128
domainNumber            0
logAnnounceInterval     0
logSyncInterval         -3
syncReceiptTimeout      3

# Interface (replace with your TSN NIC)
[enp2s0]
delay_filter_length     10
```

**Customize:**
- Replace `enp2s0` with your TSN interface
- Set `priority1` lower (e.g., 64) to make this node the grandmaster
- Increase `logSyncInterval` (e.g., -2) to reduce CPU load (less precision)

### Step 4: Configure Systemd Services

**`/etc/systemd/system/map2-ptp4l.service`:**
```ini
[Unit]
Description=PTP daemon for MAP2 AVB/TSN
Documentation=man:ptp4l(8)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/map2/avb-enabled
PartOf=map2-avb.target

[Service]
Type=simple
ExecStartPre=/bin/bash /path/to/setup_avb_qdiscs.sh
ExecStart=/usr/sbin/ptp4l -f /etc/ptp4l.conf -i enp2s0 -m
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/map2-phc2sys.service`:**
```ini
[Unit]
Description=Synchronize system clock to PTP
Documentation=man:phc2sys(8)
After=map2-ptp4l.service
Requires=map2-ptp4l.service
ConditionPathExists=/etc/map2/avb-enabled
PartOf=map2-avb.target

[Service]
Type=simple
ExecStart=/usr/sbin/phc2sys -s enp2s0 -c CLOCK_REALTIME -w -m
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/map2-avb.target`:**
```ini
[Unit]
Description=MAP2 AVB/TSN Services
Documentation=file:///path/to/docs/avb-setup.md

[Install]
WantedBy=multi-user.target
```

Enable services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable map2-ptp4l.service map2-phc2sys.service
sudo systemctl start map2-avb.target
```

### Step 5: Apply TSN Qdiscs

The `setup_avb.sh` script configures traffic shaping automatically. Manual commands:

**Create VLAN 2 for AVB Class A:**
```bash
sudo ip link add link enp2s0 name enp2s0.2 type vlan id 2
sudo ip link set enp2s0.2 up
```

**Configure mqprio (3 traffic classes):**
```bash
sudo tc qdisc add dev enp2s0 root handle 100: mqprio \
    num_tc 3 \
    map 2 2 1 0 2 2 2 2 2 2 2 2 2 2 2 2 \
    queues 1@0 1@1 2@2 \
    hw 0
```

**Apply CBS to Class A (TC0):**
```bash
# Calculate parameters (example for 48kHz stereo 24-bit)
# Bandwidth = 48000 * 2 * 3 * 120% = 345.6 kbps
# idleslope = 691200 bps (2x safety margin)
# sendslope = -(1000000000 - 691200) = -999308800 bps
# hicredit = 12 bytes
# locredit = -18 bytes

sudo tc qdisc add dev enp2s0 parent 100:1 cbs \
    idleslope 691200 \
    sendslope -999308800 \
    hicredit 12 \
    locredit -18 \
    offload 1
```

**Apply ETF (Earliest TxTime First) if supported:**
```bash
sudo tc qdisc add dev enp2s0 parent 100:1 etf \
    clockid CLOCK_TAI \
    delta 500000 \
    offload
```

**Verify qdiscs:**
```bash
tc -s qdisc show dev enp2s0
```

### Step 6: Update MAP2 Backend Service

Modify `/etc/systemd/system/map2-backend.service`:

```ini
[Service]
# Add AVB capabilities (only used if AVB enabled)
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN CAP_SYS_NICE

# Environment
Environment="MAP2_AVB_ENABLED=true"
Environment="MAP2_AVB_INTERFACE=enp2s0"

# Optionally depend on AVB services
Wants=map2-avb.target
After=map2-avb.target
```

Reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart map2-backend
```

---

## Configuration

### MAP2 Config File

Full AVB configuration in `~/.map2/config.json`:

```json
{
  "avb": {
    "enabled": true,
    "interface": "enp2s0",

    "ptp": {
      "domain": 0,
      "priority1": 128,
      "priority2": 128,
      "sync_interval_log": -3
    },

    "tsn": {
      "vlan_id": 2,
      "pcp": 5,
      "cbs_enabled": true,
      "etf_enabled": true
    },

    "streams": {
      "max_streams": 8,
      "default_channels": 2,
      "default_sample_rate": 48000,
      "presentation_time_offset_us": 2000
    },

    "discovery": {
      "mdns_enabled": true,
      "mdns_service_type": "_map2-avb._tcp",
      "avdecc_enabled": false
    }
  }
}
```

**Key Parameters:**

- `interface`: TSN NIC name (get from `ip link show`)
- `ptp.domain`: 0-255, must match across nodes (default 0)
- `ptp.priority1`: Lower = higher priority (64 = grandmaster candidate)
- `tsn.vlan_id`: VLAN for AVB traffic (standard: 2 for Class A)
- `tsn.pcp`: Priority Code Point (standard: 5 for Class A)
- `streams.presentation_time_offset_us`: Buffer time before playback (2000μs typical)
- `avb.failover_policy`: Interface failover mode (`none`, `prefer_primary`, `round_robin`, `manual`)
- `avb.failover_interfaces`: Ordered fallback interface candidates (comma or JSON list)
- `discovery.avdecc_enabled`: Set `true` for third-party AVB device interop (Phase 8)

### Environment Variables

Override config via environment:

```bash
export MAP2_AVB_ENABLED=true
export MAP2_AVB_INTERFACE=enp2s0
export MAP2_AVB_PTP_DOMAIN=0
export MAP2_AVB_MAX_STREAMS=16
export MAP2_AVB_FAILOVER_POLICY=prefer_primary
export MAP2_AVB_FAILOVER_INTERFACES='["enp2s0","enp5s0"]'
```

### Configuration Compatibility Matrix

Use this matrix to align runtime behavior with deployment goals:

| Profile | Required flags | Typical use | Key checks |
|---------|----------------|-------------|------------|
| `default` | `avb.srp.required=false`, `avb.avdecc_enabled=false` | MAP2-only AVB deployments | `GET /api/avb/status`, `GET /api/avb/streams` |
| `strict_srp` | `avb.srp.enabled=true`, `avb.srp.required=true` | Deterministic admission-controlled transport | `GET /api/avb/srp/status`, stream create/start includes SRP metadata |
| `avdecc_enabled` | `avb.avdecc_enabled=true` | Third-party AVDECC endpoint interop | `GET /api/avb/avdecc/entities`, AVDECC connect/disconnect routes |
| `strict_srp_avdecc` | strict SRP + AVDECC enabled | Mixed-vendor fabrics with strict reservation policy | SRP + AVDECC checks above plus diagnostics endpoint |

Runtime introspection:

```bash
curl -s http://localhost:8080/api/avb/config/compatibility | jq
```

The response includes:
- `active_profile`
- resolved failover policy/interface list
- profile matrix with required feature flags

### Kernel Parameters

**Real-time kernel tuning** (`/etc/sysctl.d/99-map2-avb.conf`):

```ini
# Increase real-time scheduling limits
kernel.sched_rt_runtime_us = -1

# Reduce network latency
net.core.netdev_max_backlog = 5000
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728

# Disable reverse path filtering (required for AVB)
net.ipv4.conf.all.rp_filter = 0
net.ipv4.conf.enp2s0.rp_filter = 0
```

Apply:
```bash
sudo sysctl -p /etc/sysctl.d/99-map2-avb.conf
```

---

## Testing & Verification

### 1. PTP Synchronization

Check ptp4l status:
```bash
sudo journalctl -u map2-ptp4l -f
```

**Good output:**
```
ptp4l[1234]: selected /dev/ptp0 as PTP clock
ptp4l[1234]: port 1: LISTENING to MASTER on ANNOUNCE_RECEIPT_TIMEOUT_EXPIRES
ptp4l[1234]: selected best master clock 001122.fffe.334455
ptp4l[1234]: port 1: delay   mean    42ns  std dev    15ns
```

**Key metrics:**
- State: `SLAVE` (synced to grandmaster) or `MASTER` (this is grandmaster)
- Offset: <1000ns (1μs) is excellent, <10000ns acceptable
- Mean path delay: <10μs on local network

Check PHC sync:
```bash
sudo journalctl -u map2-phc2sys -f
```

**Good output:**
```
phc2sys[1235]: phc offset   -23 s2 freq  +1234 delay   8765
```

### 2. AVB Status API

```bash
curl -s http://localhost:8080/api/avb/status | jq
```

**Expected:**
```json
{
  "enabled": true,
  "available": true,
  "interface": "enp2s0",
  "ptp": {
    "available": true,
    "state": "SLAVE",
    "offset_ns": 42,
    "mean_path_delay_ns": 1500,
    "grandmaster_id": "001122fffe334455"
  },
  "tsn": {
    "available": true,
    "interface": "enp2s0",
    "mqprio_configured": true,
    "cbs_configured": true,
    "etf_configured": true,
    "vlan_configured": true
  }
}
```

### 2.5 Installer AVB Branch Validation (Dry-Run)

Validate installer AVB branch controls (default/skip/uninstall/interface):

```bash
pytest tests/test_avb_ops_scripts.py -q
```

See `docs/AVB_ROLLOUT_BACKOUT_RUNBOOK.md` for staged rollout/backout and no-orphan checks.

### 3. Create Test Stream

**Talker (source):**
```bash
curl -X POST http://localhost:8080/api/avb/streams \
  -H "Content-Type: application/json" \
  -d '{
    "stream_id": "test-stream-1",
    "direction": "talker",
    "interface": "enp2s0",
    "channels": 2,
    "sample_rate": 48000,
    "dest_mac": "91:e0:f0:00:fe:01"
  }'
```

**Listener (destination):**
```bash
curl -X POST http://localhost:8080/api/avb/streams \
  -H "Content-Type: application/json" \
  -d '{
    "stream_id": "test-stream-2",
    "direction": "listener",
    "interface": "enp2s0",
    "channels": 2,
    "sample_rate": 48000
  }'
```

**Monitor stream:**
```bash
curl -s http://localhost:8080/api/avb/streams/test-stream-1/stats | jq
```

**Inspect runtime diagnostics (effective config + PTP/TSN/SRP):**
```bash
curl -s http://localhost:8080/api/avb/streams/test-stream-1/diagnostics | jq
```

**Expected:**
```json
{
  "stream_id": "test-stream-1",
  "state": "running",
  "packets_sent": 125400,
  "packets_received": 125398,
  "packet_loss_percent": 0.0016,
  "latency_us": 1850,
  "jitter_us": 45,
  "cpu_percent": 2.3,
  "memory_bytes": 8192
}
```

### 4. Packet Capture

Capture AVTP traffic with Wireshark:
```bash
sudo tshark -i enp2s0 -f "ether proto 0x22f0" -w /tmp/avtp-capture.pcap
```

Analyze:
```bash
tshark -r /tmp/avtp-capture.pcap -Y "avtp" -T fields \
    -e frame.time_delta \
    -e avtp.stream_id \
    -e avtp.timestamp
```

### 5. Run Test Suite

**Skip AVB tests** (for CI without hardware):
```bash
pytest -m "not avb"
```

**Run only AVB tests** (requires hardware):
```bash
pytest -m avb -v
```

**Run integration tests:**
```bash
pytest tests/test_avb_integration.py -v
```

**Run RT safety tests** (requires debug build):
```bash
HAS_AVB_RT_INSTRUMENTATION=1 pytest tests/test_avb_rt_safety.py -v
```

---

## Troubleshooting

### PTP Not Syncing

**Symptom:** `ptp4l` shows `LISTENING` state, never transitions to `SLAVE`

**Causes:**
1. No PTP grandmaster on network
2. Wrong PTP profile (not gPTP/802.1AS)
3. Firewall blocking multicast

**Fixes:**
```bash
# Check for PTP traffic
sudo tcpdump -i enp2s0 ether proto 0x88f7

# Verify hardware timestamping
ethtool -T enp2s0 | grep hardware-transmit

# Force this node as grandmaster
sudo nano /etc/ptp4l.conf
# Set: priority1 = 64
sudo systemctl restart map2-ptp4l

# Check journal for errors
sudo journalctl -u map2-ptp4l -n 100
```

### High PTP Offset

**Symptom:** Offset >10μs, unstable

**Causes:**
1. Network congestion
2. Non-TSN switch in path
3. CPU overload

**Fixes:**
```bash
# Check network load
iftop -i enp2s0

# Reduce PTP sync rate
sudo nano /etc/ptp4l.conf
# Change: logSyncInterval -3 → -2

# Check CPU isolation
taskset -c -p $(pgrep ptp4l)

# Verify no CPU frequency scaling
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
# Should be "performance", not "powersave"
```

### CBS Qdisc Errors

**Symptom:** `tc qdisc add ... cbs` fails with "Operation not supported"

**Causes:**
1. NIC doesn't support CBS offload
2. Wrong kernel driver
3. Kernel too old

**Fixes:**
```bash
# Check driver support
ethtool -k enp2s0 | grep -i tx-sched

# Try without offload (software CBS)
sudo tc qdisc add dev enp2s0 parent 100:1 cbs \
    idleslope 691200 \
    sendslope -999308800 \
    hicredit 12 \
    locredit -18 \
    offload 0  # Software mode

# Check kernel version
uname -r  # Need ≥5.10
```

### AVB Streams Not Discovered

**Symptom:** `/api/avb/discovery` shows no nodes

**Causes:**
1. Avahi not running
2. Firewall blocking mDNS (UDP 5353)
3. AVB disabled on other nodes

**Fixes:**
```bash
# Check Avahi
sudo systemctl status avahi-daemon

# Test mDNS manually
avahi-browse -a -t -r

# Open firewall (Fedora)
sudo firewall-cmd --add-service=mdns --permanent
sudo firewall-cmd --reload

# Check remote nodes
curl http://<remote-node-ip>:8080/api/avb/status
```

### Audio Dropouts / Xruns

**Symptom:** Clicks, pops, or silence in AVB streams

**Causes:**
1. CPU overload (>80% usage)
2. Insufficient buffer size
3. Network jitter
4. RT priority too low

**Fixes:**
```bash
# Increase buffer size
curl -X PATCH http://localhost:8080/api/avb/streams/test-stream-1 \
  -d '{"presentation_time_offset_us": 4000}'

# Check CPU affinity
taskset -c -p $(pgrep uvicorn)

# Verify RT priority
chrt -p $(pgrep uvicorn)  # Should be SCHED_FIFO:60

# Check for IRQ conflicts
cat /proc/interrupts | grep enp2s0

# Monitor RT metrics
curl http://localhost:8080/api/avb/streams/test-stream-1/stats | jq '.latency_us, .jitter_us'
```

### Permission Denied Errors

**Symptom:** `CAP_NET_RAW: Operation not permitted`

**Causes:**
1. systemd AmbientCapabilities not set
2. User not in `realtime` group
3. SELinux blocking

**Fixes:**
```bash
# Add capabilities to systemd service
sudo nano /etc/systemd/system/map2-backend.service
# Add under [Service]:
#   AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN
sudo systemctl daemon-reload
sudo systemctl restart map2-backend

# Add user to realtime group
sudo usermod -aG realtime $USER

# Check SELinux (if enabled)
sudo ausearch -m avc -ts recent
# If blocked, create policy or set permissive
```

---

## Uninstallation

### Clean Removal Script

```bash
sudo bash scripts/uninstall_avb.sh
```

Or use the host installer entrypoint:

```bash
sudo bash install_on_new_host.sh --uninstall-avb
```

This script:
1. Stops all AVB systemd services
2. Removes qdiscs and VLAN interfaces
3. Deletes systemd service files
4. Removes `/etc/map2/avb-enabled`
5. **Preserves** backups in `/var/lib/map2/avb-backup/`
6. Removes SRP source-installed artifacts only when paths match the uninstall allowlist (defaults: `/usr/local/`, `/etc/`)

**Preserve MAP2 config:**
```bash
sudo bash scripts/uninstall_avb.sh --preserve-config
```

**Advanced override (restricted test/sandbox environments):**
```bash
MAP2_SRPD_UNINSTALL_ALLOW_PREFIXES="/tmp/my-lab/" \
  sudo bash scripts/uninstall_avb.sh --yes
```
Use this only when you intentionally install SRP artifacts outside standard system prefixes.

### Manual Uninstallation

```bash
# Stop services
sudo systemctl stop map2-avb.target
sudo systemctl disable map2-ptp4l.service map2-phc2sys.service

# Remove systemd units
sudo rm /etc/systemd/system/map2-ptp4l.service
sudo rm /etc/systemd/system/map2-phc2sys.service
sudo rm /etc/systemd/system/map2-avb.target
sudo systemctl daemon-reload

# Remove qdiscs
sudo tc qdisc del dev enp2s0 root

# Remove VLAN
sudo ip link delete dev enp2s0.2

# Remove marker file
sudo rm /etc/map2/avb-enabled

# Optional: Remove packages
sudo dnf remove linuxptp libavtp-devel
```

### Rebuild Without AVB

```bash
cd juce-engine
rm -rf build
cmake -B build -DUSE_AVB=OFF
cmake --build build --config Release -j$(nproc)

# Reinstall Python module
cd ..
pip install -e .

# Restart
sudo systemctl restart map2-backend
```

---

## Failure Recovery

### Scenario: AVB Services Won't Start

**Diagnosis:**
```bash
sudo systemctl status map2-ptp4l.service
sudo journalctl -xeu map2-ptp4l.service
```

**Recovery:**
```bash
# Check marker file exists
ls -la /etc/map2/avb-enabled

# Re-run setup
sudo scripts/setup_avb.sh --yes

# Force restart
sudo systemctl restart map2-avb.target
```

### Scenario: Network Broken After Setup

**Diagnosis:**
```bash
ip link show
ip addr show
tc -s qdisc show
```

**Recovery:**
```bash
# Restore qdiscs from backup
sudo /var/lib/map2/avb-backup/restore_qdiscs.sh

# Remove VLAN if corrupted
sudo ip link delete dev enp2s0.2
sudo ip link add link enp2s0 name enp2s0.2 type vlan id 2
sudo ip link set enp2s0.2 up

# Restart networking
sudo systemctl restart NetworkManager
```

### Scenario: Audio Engine Won't Start

**Diagnosis:**
```bash
sudo systemctl status map2-backend
sudo journalctl -u map2-backend -n 100
```

**Recovery:**
```bash
# Check AVB availability
curl http://localhost:8080/api/avb/status

# Disable AVB temporarily
nano ~/.map2/config.json
# Set: "avb": {"enabled": false}
sudo systemctl restart map2-backend

# Check for missing libraries
ldd /path/to/libMap2AudioEngine.so | grep "not found"

# Rebuild with AVB disabled
cd juce-engine && cmake -B build -DUSE_AVB=OFF
```

### Scenario: PTP Clock Drift

**Diagnosis:**
```bash
sudo pmc -u -b 0 'GET TIME_STATUS_NP'
sudo pmc -u -b 0 'GET PORT_DATA_SET'
```

**Recovery:**
```bash
# Reset PHC
sudo phc_ctl /dev/ptp0 set 0

# Restart PTP stack
sudo systemctl restart map2-ptp4l map2-phc2sys

# Force re-sync
sudo pmc -u -b 0 set PRIORITY1 64  # Temporary grandmaster boost
sleep 10
sudo pmc -u -b 0 set PRIORITY1 128  # Restore normal
```

---

## Advanced Topics

### Multi-Node Setup

**Node A (Grandmaster):**
```json
{
  "avb": {
    "enabled": true,
    "interface": "enp2s0",
    "ptp": {"priority1": 64}
  }
}
```

**Nodes B, C, D (Slaves):**
```json
{
  "avb": {
    "enabled": true,
    "interface": "enp2s0",
    "ptp": {"priority1": 128}
  }
}
```

**Stream Routing (N-to-M):**
```bash
# Node A → Node B
curl -X POST http://node-b:8080/api/avb/streams \
  -d '{"stream_id": "a-to-b", "direction": "listener", "source_mac": "<node-a-mac>"}'

# Node A → Node C & D (multicast)
curl -X POST http://node-a:8080/api/avb/streams \
  -d '{"stream_id": "a-to-all", "direction": "talker", "destination_mac": "91:e0:f0:00:00:01"}'
```

### TSN Switch Configuration

For production setups with TSN switches (e.g., Marvell 88E6352):

1. **Configure 802.1Qbv (TAS)** for time-slot scheduling
2. **Enable frame preemption (802.1Qbu)** for ultra-low latency
3. **Set up redundancy (802.1CB)** with dual paths

Consult switch vendor docs (e.g., Marvell MDIO tools).

### Performance Tuning

**CPU Isolation:**
```bash
# Kernel cmdline (append to GRUB_CMDLINE_LINUX)
isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3

# Pin MAP2 backend
sudo systemctl edit map2-backend.service
# Add: CPUAffinity=2 3
```

**IRQ Affinity:**
```bash
# Find NIC IRQ
grep enp2s0 /proc/interrupts

# Bind to isolated cores
echo 0c > /proc/irq/<irq-num>/smp_affinity  # Cores 2-3 (0x0c = 0b1100)
```

**Buffer Sizing:**
```bash
# Ring buffer (NIC)
ethtool -G enp2s0 rx 4096 tx 4096

# Socket buffers
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
```

### Debugging with ThreadSanitizer

Build with TSan to detect RT violations:

```bash
cd juce-engine
cmake -B build-tsan \
  -DUSE_AVB=ON \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_CXX_FLAGS="-fsanitize=thread -g"
cmake --build build-tsan
```

Run tests:
```bash
TSAN_OPTIONS="halt_on_error=1 history_size=7" \
  pytest tests/test_avb_rt_safety.py
```

---

## Additional Resources

- **IEEE Standards**: [ieee.org](https://standards.ieee.org/)
  - IEEE 1722-2016 (AVTP)
  - IEEE 802.1AS-2020 (gPTP)
  - IEEE 802.1Qav-2009 (CBS)
- **linuxptp**: [linuxptp.sourceforge.net](http://linuxptp.sourceforge.net/)
- **libavtp**: [github.com/Avnu/libavtp](https://github.com/Avnu/libavtp)
- **Intel I210 Datasheet**: [intel.com/content/www/us/en/products/details/ethernet](https://www.intel.com/content/www/us/en/products/details/ethernet/gigabit-controllers/i210-controllers.html)

---

## Support

For issues specific to MAP2 AVB implementation:

- **GitHub Issues**: [github.com/matthewmackes/map2-audio/issues](https://github.com/matthewmackes/map2-audio/issues)
- **Logs**: `sudo journalctl -u map2-backend -u map2-ptp4l -u map2-phc2sys -f`
- **API Docs**: [http://localhost:8080/docs](http://localhost:8080/docs)

---

**Last Updated:** 2026-02-14
**MAP2 Version:** 1.24.25.1+
**AVB Implementation:** Phase 1-7 Complete
