# ✅ Auburn Sounds Graillon 3 FREE - Successfully Installed!

## Installation Summary

**Date:** January 30, 2026  
**Version:** Graillon 3.1.1 FREE  
**Format:** LV2 (Native Linux Support)

## What Was Installed

Auburn Sounds Graillon 3 is now available as an **LV2 plugin** in your MAP2 Audio system!

### Plugin Variants
- **Mono:** `https://www.auburnsounds.com/products/Graillon.html40733133#mono`
- **Stereo:** `https://www.auburnsounds.com/products/Graillon.html40733133#stereo`

### Installation Path
```
/usr/lib64/lv2/Auburn Sounds Graillon 3.lv2/
├── AuburnSoundsGraillon3.so  (5.6 MB)
└── manifest.ttl              (80 KB)
```

## Features (FREE Version)

### Core Features
- ✅ **Live Pitch Correction** - Both hard-tune and natural sounds
- ✅ **Pitch Shifter** - Real-time vocal pitch shifting
- ✅ **Formant Shifting** - Change vocal character
- ✅ **3 Pitch Engines:**
  - **G2:** Retains Graillon 2 sound
  - **G3:** Updated and reviewed sound
  - **I1:** Pitch engine from Inner Pitch
- ✅ **Built-in Effects:**
  - Compressor
  - Gate
  - Chorus
  - Preamp
  - Bitcrusher

### Full Version Features (Upgrade $29)
The full version adds:
- **Pitch-Tracking Modulation (PTM)** - High-testosterone grit
- **Keyboard Tuning** - Step outside equal temperament
- **Vocal Doubler** - Enhanced mix fitting

## How to Use in MAP2

### 1. Via LV2 Plugin Browser
```bash
# Plugin should appear in the browser automatically
# Search for: "Auburn Sounds Graillon 3" or just "Graillon"
```

### 2. Via API
```bash
# Load Graillon (Stereo)
curl -X POST "http://localhost:8000/api/plugins/load" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "https://www.auburnsounds.com/products/Graillon.html40733133#stereo"
  }'
```

### 3. Verify Installation
```bash
# List Graillon plugins
lv2ls | grep -i graillon

# Should output:
# https://www.auburnsounds.com/products/Graillon.html40733133#mono
# https://www.auburnsounds.com/products/Graillon.html40733133#stereo
```

## Quick Start Vocal Chain

Here's a professional vocal processing chain using Graillon:

```
Input → ZamGate → Calf Compressor → Calf EQ → Graillon 3 → Calf Reverb → Output
```

### Graillon Settings for Different Styles

#### Natural Pitch Correction
- Engine: **I1**
- Snap: Min
- Smooth: High
- Amount: 50-70%
- Use for subtle, unobtrusive correction

#### Classic Trap/Auto-Tune Sound
- Engine: **G2** (Graillon 2 sound)
- Snap: Max
- Smooth: Low
- Amount: 100%
- Add Bitcrusher for extra grit

#### Modern Clean Pop
- Engine: **G3** (Updated sound)
- Snap: Medium
- Smooth: Medium
- Amount: 70-90%

## Resources

### Documentation
- **Cheat Sheet:** `/tmp/Graillon-FREE-3.1.1/graillon3-cheat-sheet.jpg`
- **User's Guide:** `/tmp/Graillon-FREE-3.1.1/Graillon 3 User's Guide.pdf`
- **Data Sheet:** `/tmp/Graillon-FREE-3.1.1/Graillon 3 Data Sheet.pdf`

### Links
- **Product Page:** https://www.auburnsounds.com/products/Graillon.html
- **Download:** https://www.auburnsounds.com/downloads/Graillon-FREE-3.1.1.zip
- **Upgrade:** https://auburnsounds.itch.io/graillon ($29)

## Comparison with Alternatives

| Feature | Graillon (LV2) | x42-autotune | Autotalent |
|---------|----------------|--------------|------------|
| **Format** | LV2 ✅ | LV2 ✅ | LV2 ✅ |
| **Cost** | Free (Upgradable) | Free & Open Source | Free & Open Source |
| **GUI** | Modern, polished | Functional | Basic |
| **Pitch Correction** | ✅ Advanced | ✅ Real-time | ✅ Basic |
| **Pitch Shifting** | ✅ | ✅ | ✅ |
| **Formant Shifting** | ✅ | ❌ | ❌ |
| **Built-in Effects** | ✅ (5 effects) | ❌ | ❌ |
| **Multiple Engines** | ✅ (3 engines) | ❌ | ❌ |
| **Linux Native** | ✅ | ✅ | ✅ |

## Why Graillon Stands Out

1. **Professional Quality** - Used in commercial productions
2. **Multiple Engines** - Three different pitch algorithms
3. **Built-in Effects** - No need for separate compressor/gate
4. **No Latency** - All effects add zero latency
5. **Fast Performance** - Optimized for real-time use
6. **Great Free Version** - No time limit, fully functional

## Troubleshooting

### Plugin not showing up?
```bash
# Verify installation
ls -la "/usr/lib64/lv2/Auburn Sounds Graillon 3.lv2/"

# Check LV2 detection
lv2ls | grep -i graillon

# Restart MAP2 backend if needed
# Plugin should auto-discover on next scan
```

### Permission issues?
```bash
# Ensure proper permissions
sudo chmod -R 755 "/usr/lib64/lv2/Auburn Sounds Graillon 3.lv2/"
```

### Want to reinstall?
```bash
# Remove old installation
sudo rm -rf "/usr/lib64/lv2/Auburn Sounds Graillon 3.lv2"

# Reinstall from archive
cd /tmp
sudo cp -r "Graillon-FREE-3.1.1/Linux/Linux-64b-LV2-FREE/Auburn Sounds Graillon 3.lv2" /usr/lib64/lv2/
```

## Other Auburn Sounds Plugins (Also LV2!)

The free Graillon download includes documentation for other Auburn Sounds plugins:

### Also Available with LV2
- **Panagement** - Stereo width enhancement
- **Couture** - Transient shaper
- **Inner Pitch** - Pitch tracking and MIDI output
- **Lens** - Spectrum analyzer

All Auburn Sounds plugins support LV2 format on Linux!

## Upgrade to Full Version

The full version ($29) adds:
- **PTM (Pitch-Tracking Modulation)** - Aggressive, characterful tone
- **Vocal Doubler** - Professional doubling effect
- **Keyboard Tuning** - Alternative tuning systems

Purchase at: https://auburnsounds.itch.io/graillon

---

**Correction Notice:** Initial documentation incorrectly stated Graillon had no LV2 version. Auburn Sounds Graillon 3 fully supports LV2 on Linux! 🎉

**Status:** ✅ Installed and Ready to Use  
**Total LV2 Plugins Available:** 100+ (including Graillon, Calf, x42, Zam, LSP)

Enjoy professional pitch correction! 🎤✨
