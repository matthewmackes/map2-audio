# ✅ TAL-Reverb-2 - Successfully Installed!

## Installation Summary

**Date:** January 30, 2026  
**Developer:** Togu Audio Line (TAL)  
**Type:** Vintage Plate Reverb Emulation  
**Cost:** Free

## What Was Installed

TAL-Reverb-2 is a vintage plate reverb plugin with a simple, elegant interface and beautiful sound.

### Plugin Formats Installed
- ✅ **VST3:** `/usr/lib/vst3/TAL-Reverb-2.vst3/`
- ✅ **VST2:** `/usr/lib/vst/libTAL-Reverb-2.so`

### File Details
```
VST3: 3.3 MB (TAL-Reverb-2.so)
VST2: 2.8 MB (libTAL-Reverb-2.so)
```

## Features

### Core Reverb Features
- ✅ **Vintage Plate Reverb Algorithm** - Emulates classic EMT plate reverb
- ✅ **Dense, Smooth Tail** - Natural-sounding reverb decay
- ✅ **Pre-Delay** - Control early reflections
- ✅ **Low/High Cut Filters** - Shape reverb frequency response
- ✅ **Modulation** - Add movement to reverb tail
- ✅ **Simple Interface** - Easy to use, no menu diving
- ✅ **Low CPU Usage** - Efficient algorithm
- ✅ **Free** - No limitations, fully functional

### Perfect For
- Vocals
- Drums (especially snares)
- Guitars
- Keys/Synths
- Any source needing vintage reverb character

## How to Use in MAP2

### Via VST3 (Recommended)
Since MAP2 has VST3 support through the VST3PluginLoader component:

```bash
# The plugin will appear in VST3 plugin browsers automatically
# Search for: "TAL-Reverb-2"
```

### Via API (VST3)
```bash
# Scan for VST3 plugins (if not already done)
curl -X POST http://localhost:8000/api/vst3/refresh

# List TAL plugins
curl -s http://localhost:8000/api/vst3/plugins | jq '.plugins[] | select(.name | contains("TAL"))'
```

## Quick Start Guide

### Basic Reverb Setup

#### 1. **Vocal Reverb (Small Room)**
- Pre-Delay: 10-20ms
- Decay: 1.5-2.5s
- Low Cut: 200-300Hz
- High Cut: 8-10kHz
- Mix: 15-25%

#### 2. **Vocal Reverb (Large Hall)**
- Pre-Delay: 30-50ms
- Decay: 3-5s
- Low Cut: 150-200Hz
- High Cut: 8-12kHz
- Mix: 20-30%

#### 3. **Snare Reverb (Classic)**
- Pre-Delay: 0-5ms
- Decay: 1-2s
- Low Cut: 250Hz
- High Cut: 6-8kHz
- Mix: 30-50%

#### 4. **Guitar Ambience**
- Pre-Delay: 20-40ms
- Decay: 2-3s
- Low Cut: 100Hz
- High Cut: 10kHz
- Mix: 15-30%

## Recommended Vocal Chain with TAL-Reverb-2

```
Input → ZamGate → Calf Compressor → Calf EQ → Graillon 3 → TAL-Reverb-2 → Output
```

### Why This Works
1. **Gate** - Removes noise before reverb (important!)
2. **Compressor** - Evens out dynamics
3. **EQ** - Shapes tone and removes mud
4. **Graillon** - Pitch correction/enhancement
5. **TAL-Reverb-2** - Adds space and depth

## Tips & Tricks

### General Reverb Tips
1. **Always High-Pass the Reverb** - Cut below 200Hz to avoid muddiness
2. **Use Pre-Delay** - Separates dry signal from reverb for clarity
3. **Less is More** - Start with lower mix values
4. **Automate Mix** - More reverb on sustained notes, less on fast passages

### TAL-Reverb-2 Specific
1. **Beautiful on Vocals** - This is what it's designed for
2. **Try Modulation** - Adds subtle movement and width
3. **Parallel Processing** - Send to reverb bus for better control
4. **Stereo Width** - Natural stereo image, no artificial widening needed

## About TAL (Togu Audio Line)

TAL is known for high-quality, free and affordable plugins:
- **Free Plugins:** TAL-Reverb-2, TAL-Chorus-LX, TAL-Filter, TAL-Vocoder
- **Paid Plugins:** TAL-U-NO-LX, TAL-Sampler, TAL-Mod, TAL-Drum

All TAL plugins are available for Linux!

## Other TAL Plugins Worth Installing

### Free TAL Plugins
1. **TAL-Chorus-LX** - Juno-style chorus
2. **TAL-Filter** - Analog filter emulation
3. **TAL-Vocoder** - 11-band vocoder
4. **TAL-Reverb-4** - Modern reverb (successor to Reverb-2)
5. **TAL-Dub-3** - Vintage tape delay

### Download from:
https://tal-software.com/products

## Installation Verification

```bash
# Check VST3 installation
ls -la /usr/lib/vst3/TAL-Reverb-2.vst3/Contents/x86_64-linux/

# Check VST2 installation
ls -la /usr/lib/vst/libTAL-Reverb-2.so

# Expected output:
# VST3: TAL-Reverb-2.so (3.3 MB)
# VST2: libTAL-Reverb-2.so (2.8 MB)
```

## Troubleshooting

### Plugin not showing up?

**For VST3:**
```bash
# Ensure VST3 path is correct
ls -la /usr/lib/vst3/TAL-Reverb-2.vst3/

# Refresh VST3 cache in MAP2
curl -X POST http://localhost:8000/api/vst3/refresh
```

**For VST2:**
```bash
# Check VST2 path
ls -la /usr/lib/vst/libTAL-Reverb-2.so

# Ensure host is scanning /usr/lib/vst
```

### Permission Issues?
```bash
# Fix permissions if needed
sudo chmod 755 /usr/lib/vst3/TAL-Reverb-2.vst3
sudo chmod 644 /usr/lib/vst/libTAL-Reverb-2.so
```

### Want to reinstall?
```bash
# Download and reinstall
cd /tmp
wget https://tal-software.com/downloads/plugins/Tal-Reverb-2_64_linux.zip
unzip Tal-Reverb-2_64_linux.zip

# Remove old installation
sudo rm -rf /usr/lib/vst3/TAL-Reverb-2.vst3
sudo rm /usr/lib/vst/libTAL-Reverb-2.so

# Reinstall
sudo cp -r TAL-Reverb-2.vst3 /usr/lib/vst3/
sudo cp libTAL-Reverb-2.so /usr/lib/vst/
```

## Comparison with Other Reverbs

| Feature | TAL-Reverb-2 | Calf Reverb | ZamVerb |
|---------|--------------|-------------|---------|
| **Type** | Vintage Plate | Algorithmic | Modern |
| **Format** | VST2/VST3 | LV2 | LV2 |
| **CPU** | Low | Medium | Low |
| **Sound** | Warm, vintage | Clean, versatile | Transparent |
| **Interface** | Simple | Feature-rich | Minimal |
| **Best For** | Vocals, drums | All-purpose | Subtle ambience |

## Summary

**TAL-Reverb-2** is an excellent addition to your MAP2 Audio plugin collection:
- ✅ Professional vintage plate reverb sound
- ✅ Simple, intuitive interface
- ✅ Low CPU usage
- ✅ Perfect for vocals and drums
- ✅ Completely free
- ✅ Available in VST2 and VST3 formats

**Status:** ✅ Installed and Ready to Use  
**Formats:** VST2 + VST3  
**Total Size:** ~6 MB

Add beautiful vintage reverb to your tracks! 🎤✨

---

**Download More TAL Plugins:** https://tal-software.com/products  
**TAL Forum:** https://tal-software.com/forum
