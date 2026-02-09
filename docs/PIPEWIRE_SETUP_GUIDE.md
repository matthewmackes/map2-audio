# PipeWire and JACK Integration Setup Guide

**Platform:** MAP2 Audio Engine v2.0 with PipeWire  
**Date:** February 8, 2026

---

## Architecture Overview

The MAP2 audio platform now uses **PipeWire** as the primary audio server, with **JACK compatibility layer** for application routing:

```
┌─────────────────────────────────────────────────────────────┐
│                    Audio Applications                        │
│                                                              │
│  MAP2 Engine  │  DAW  │  Media Player  │  Video Editor     │
└────────────────┬──────────┬────────────┬────────────────────┘
                 │          │            │
                 └──────────┴────────────┘
                          │
        ┌─────────────────▼─────────────────┐
        │    PipeWire Graph Engine          │
        │  - Session Management             │
        │  - Automatic Routing              │
        │  - Plugin Discovery               │
        │  - JACK Compatibility Layer       │
        └──────────────┬──────────────────┘
                       │
        ┌──────────────▼──────────────────┐
        │   Audio Hardware Drivers         │
        │  - ALSA (kernel)                 │
        │  - JACK (optional)               │
        │  - USB Audio Interfaces          │
        └─────────────────────────────────┘
```

---

## Key Improvements

### 1. Automatic Device Discovery
- PipeWire automatically detects USB audio interfaces
- No hardcoded device names needed
- Works with any ALSA-compatible interface

### 2. Hot-Plugging
- USB audio devices can be connected/disconnected without restart
- PipeWire automatically routes to new device
- No application restart required

### 3. Latency Management
- Configurable quantum (buffer size) at PipeWire level
- Automatic latency compensation between applications
- Lower latency than pure ALSA

### 4. JACK Compatibility
- JACK applications work transparently via PipeWire
- No separate JACK server needed
- Can mix JACK and native PipeWire applications

---

## Configuration

### Environment Variables

```bash
# Enable PipeWire backend (default)
export MAP2_AUDIO_BACKEND=pipewire

# Use PipeWire's JACK compatibility (recommended)
export MAP2_PIPEWIRE_USE_JACK=1

# Let PipeWire choose device (recommended)
export MAP2_AUDIO_DEVICE=

# Or specify explicit device
export MAP2_AUDIO_DEVICE="hw:Scarlett2i2"

# Audio parameters
export MAP2_SAMPLE_RATE=48000
export MAP2_BUFFER_SIZE=256
```

### Configuration File

Edit `/etc/map2/audio_config.json`:

```json
{
  "audio": {
    "engine": "juce",
    "backend": "pipewire",
    "pipewire_use_jack": true,
    "device": null,
    "sample_rate": 48000,
    "buffer_size": 256,
    "channels": 2,
    "latency_compensation": 0.0
  }
}
```

---

## PipeWire System Configuration

### 1. Install PipeWire

**Fedora/RHEL:**
```bash
sudo dnf install pipewire pipewire-alsa pipewire-jack pipewire-jack-audio-connection-kit
sudo dnf install wireplumber  # Audio policy manager
```

**Ubuntu/Debian:**
```bash
sudo apt install pipewire pipewire-alsa pipewire-jack-mono pipewire-audio-client-libraries
sudo apt install wireplumber  # Audio policy manager
```

### 2. Enable PipeWire User Session

```bash
# Start PipeWire for current user
systemctl --user start pipewire
systemctl --user enable pipewire

# Start WireContext (session manager)
systemctl --user start wireplumber
systemctl --user enable wireplumber
```

### 3. Verify Installation

```bash
# Check PipeWire is running
pgrep -a pipewire

# Check available devices
pw-dump | grep "alsa.card"

# Check JACK compatibility
pw-jack jack_lsp
```

---

## ALSA Bridge Configuration

PipeWire provides transparent ALSA compatibility. For better control, configure `~/.config/pipewire/pipewire.conf.d/99-alsa.conf`:

```conf
# ALSA configuration for MAP2

context.modules = [
  {
    name = libpipewire-module-alsa-card
    args = {
      device.profile = stereo  # or "iec958-stereo" for S/PDIF
      alsa.format = S24_3LE
      alsa.rate = 48000
    }
  }
]
```

---

## USB Audio Interface Setup

### Supported Interfaces

The platform has been tested with:
- **Hotone Jogg** (2in/2out, USB)
- **Edirol UA-1000** (10in/10out, USB 2.0)
- **Scarlett 2i2** (2in/2out, USB)
- **Presonus Quantum** (8in/8out, Thunderbolt)

### USB Rules (udev)

Create `/etc/udev/rules.d/99-map2-audio.rules`:

```bash
# Hotone Jogg
SUBSYSTEMS=="usb", ATTRS{idVendor}=="84ef", ATTRS{idProduct}=="0014", MODE="0666"

# Edirol UA-1000
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0582", ATTRS{idProduct}=="0044", MODE="0666"

# Scarlett 2i2
SUBSYSTEMS=="usb", ATTRS{idVendor}=="154e", ATTRS{idProduct}=="1203", MODE="0666"
```

Then reload:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Prevent Autosuspend

Create `/etc/udev/rules.d/99-usb-autosuspend.rules`:

```bash
# Disable autosuspend for audio interfaces
SUBSYSTEMS=="usb", ATTRS{idVendor}=="84ef", ATTRS{idProduct}=="0014", \
  RUN+="/bin/sh -c 'echo -1 > /sys/bus/usb/devices/$DEVPATH/power/autosuspend_delay_ms'"

SUBSYSTEMS=="usb", ATTRS{idVendor}=="0582", ATTRS{idProduct}=="0044", \
  RUN+="/bin/sh -c 'echo -1 > /sys/bus/usb/devices/$DEVPATH/power/autosuspend_delay_ms'"
```

---

## Real-Time Optimization

### CPU Affinity

Configure systemd service for real-time priority (`/etc/systemd/system/map2-backend.service`):

```ini
[Service]
Type=notify
Nice=-10
CPUAffinity=1-4
ProtectSystem=strict

# Real-time priority (if running as root)
RLimit=RT_PRI
RLimit_RTPRIO=95
```

### PipeWire Quantum

Configure quantum (buffer size) in `~/.config/pipewire/pipewire.conf`:

```conf
# Latency settings
default.clock.rate = 48000
default.clock.quantum = 256  # Must be power of 2
default.clock.min-quantum = 64
default.clock.max-quantum = 8192
```

Smaller quantum = lower latency but higher CPU usage.

---

## JACK Integration

### Running as JACK Server Alternative

If you need true JACK compatibility (bridging non-PipeWire JACK apps):

```bash
# Start PipeWire JACK server
pw-jack jackd -d dummy
```

### Connect JACK Applications to PipeWire

```bash
# List available ports
pw-jack jack_lsp

# Connect MAP2 output to system playback
pw-jack jack_connect map2:out_l system:playback_1
pw-jack jack_connect map2:out_r system:playback_2
```

---

## Troubleshooting

### 1. No Audio Output

**Check PipeWire status:**
```bash
systemctl --user status pipewire
```

**Check devices visible:**
```bash
pw-dump -N | grep "audio.device"
```

**Restart PipeWire:**
```bash
systemctl --user restart pipewire wireplumber
```

### 2. Audio Crackling/Dropouts

**Increase quantum (buffer size):**
```bash
# In ~/.config/pipewire/pipewire.conf
default.clock.quantum = 512  # Instead of 256
```

**Check CPU usage:**
```bash
# Monitor in real-time
top -p $(pgrep -f "map2-backend")
```

### 3. USB Device Not Detected

**Check USB connection:**
```bash
lsusb | grep -i audio
arecord -l  # ALSA devices
```

**Manually add to PipeWire:**
```bash
# In ~/.config/pipewire/pipewire.conf.d/alsa.conf
context.modules = [
  {
    name = libpipewire-module-alsa-card
    args = {
      device = "hw:CARD=Jogg,DEV=0"
    }
  }
]
```

### 4. JACK Apps Not Working

**Enable JACK support:**
```bash
pw-jack -s jack_connect APP_NAME:out system:playback
```

**Or configure jack bridge:**
```bash
pw-jack jackd -d alsa -d hw:0
```

---

## Performance Monitoring

### Monitor PipeWire Graph

```bash
# Real-time graph visualization
qpwgraph

# Command-line graph dump
pw-dump | grep -E "node|port|link"

# Monitor CPU usage per plugin
pw-dump | grep cpu-load
```

### Monitor MAP2 Engine

```bash
# Check engine metrics via API
curl http://localhost:8080/api/engine/metrics

# Response:
{
  "cpu_usage_percent": 12.5,
  "total_latency_ms": 11.2,
  "active_plugins": 8,
  "sample_rate": 48000,
  "buffer_size": 256
}
```

### System Audio Analysis

```bash
# Record 10 seconds of audio
arecord -f S24_3LE -r 48000 -c 2 -d 10 test.wav

# Analyze for dropouts/issues
audacity test.wav
```

---

## Advanced Configuration

### Custom ALSA Configuration

Create `~/.asoundrc`:

```conf
pcm.!default {
  type hw
  card 0
  device 0
  format S24_3LE
  rate 48000
}

ctl.!default {
  type hw
  card 0
}
```

### PipeWire Node Properties

Configure in `/etc/pipewire/pipewire.conf`:

```conf
# For MAP2 specifically
contexts.0.objects = [
  {
    factory = adapter
    args = {
      factory.name = support.null-audio-sink
      node.name = "MAP2 Engine"
      node.description = "MAP2 Audio Processing"
      audio.channels = 2
      audio.rate = 48000
      audio.format = "S24_3LE"
    }
  }
]
```

---

## Verification Checklist

- [ ] PipeWire running: `systemctl --user status pipewire`
- [ ] WireContext running: `systemctl --user status wireplumber`
- [ ] USB device detected: `pw-dump | grep usb`
- [ ] MAP2 backend started: `systemctl status map2-backend`
- [ ] Audio flowing: `pw-dump | grep "state: \"RUNNING\""`
- [ ] No XRUN errors: `dmesg | grep xrun`
- [ ] CPU usage reasonable: `top -p $(pgrep map2)`
- [ ] Latency acceptable: `curl .../metrics | jq .total_latency_ms`

---

## References

- **PipeWire Documentation:** https://pipewire.org/
- **JACK Compatibility:** https://pipewire.org/module-jack
- **WireContext (WirePlumber):** https://gitlab.freedesktop.org/pipewire/wireplumber
- **ALSA Configuration:** https://www.alsa-project.org/

---

## Support

For audio issues:
1. Check logs: `journalctl --user -u pipewire -f`
2. Check metrics: `curl http://localhost:8080/api/engine/metrics`
3. Verify device: `pw-dump | grep audio`
4. Run diagnostics: `systemctl --user restart pipewire wireplumber`
