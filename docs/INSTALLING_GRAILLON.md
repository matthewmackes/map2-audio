# Installing Auburn Sounds Graillon

## Plugin Information

**Graillon** by Auburn Sounds is a vocal processing plugin featuring:
- Live pitch correction
- Pitch shifting
- Pitch tracking modulation
- Bitcrusher effect

**Available Formats:** VST2, VST3, AU, AAX, **LV2** ✅

## Installation Instructions

### Option 1: LV2 Installation (Recommended for MAP2)

1. **Download Graillon Free**
   ```bash
   cd /tmp
   wget https://www.auburnsounds.com/downloads/Graillon-FREE-3.1.1.zip
   ```

2. **Extract and Install LV2**
   ```bash
   unzip Graillon-FREE-3.1.1.zip
   
   # Install system-wide (recommended)
   sudo cp -r "Graillon-FREE-3.1.1/Linux/Linux-64b-LV2-FREE/Auburn Sounds Graillon 3.lv2" /usr/lib64/lv2/
   
   # OR install per-user
   mkdir -p ~/.lv2
   cp -r "Graillon-FREE-3.1.1/Linux/Linux-64b-LV2-FREE/Auburn Sounds Graillon 3.lv2" ~/.lv2/
   ```

3. **Verify Installation**
   ```bash
   # Check if LV2 is detected
   lv2ls | grep -i graillon
   
   # Should show:
   # https://www.auburnsounds.com/products/Graillon.html40733133#mono
   # https://www.auburnsounds.com/products/Graillon.html40733133#stereo
   ```

4. **Load in MAP2**
   ```bash
   # The plugin is now available in the LV2 plugin browser
   # It will appear as "Auburn Sounds Graillon 3"
   ```

### Option 2: VST3 Installation

1. **Download Graillon Free**
   ```bash
   # Visit the download page
   xdg-open https://www.auburnsounds.com/products/Graillon.html
   
   # Or download directly
   wget https://www.auburnsounds.com/downloads/Graillon-2.5.0-Linux.tar.gz
   ```

2. **Extract and Install**
   ```bash
   # Extract the archive
   tar -xzf Graillon-*-Linux.tar.gz
   cd Graillon-*-Linux
   
   # Install VST3 (system-wide)
   sudo cp -r Graillon.vst3 /usr/lib/vst3/
   
   # OR install per-user
   mkdir -p ~/.vst3
   cp -r Graillon.vst3 ~/.vst3/
   ```

3. **Verify Installation**
   ```bash
   # Check if VST3 is installed
   ls -la ~/.vst3/Graillon.vst3
   # or
   ls -la /usr/lib/vst3/Graillon.vst3
   ```

4. **Refresh VST3 Cache in MAP2**
   ```bash
   curl -X POST http://localhost:8000/api/vst3/refresh
   ```

5. **Load in MAP2**
   ```bash
   # List available VST3 plugins
   curl -s http://localhost:8000/api/vst3/plugins | jq '.plugins[] | select(.name | contains("Graillon"))'
   
   # Load Graillon
   curl -X POST "http://localhost:8000/api/vst3/load?uri=vst3://auburnsounds.graillon"
   ```

### Option 2: Use the VST3PluginLoader UI

Open the MAP2 web interface and:
1. Click **"Add VST3 Plugin"** button
2. Select **Graillon** from the list
3. Click **"Add to Effects Chain"**
4. Parameters will appear automatically

## Auburn Sounds Other Plugins

Auburn Sounds offers other excellent plugins (also VST3):

### Panagement
Stereo width enhancement
```bash
wget https://www.auburnsounds.com/downloads/Panagement-*-Linux.tar.gz
```

### Couture
Transient shaper
```bash
wget https://www.auburnsounds.com/downloads/Couture-*-Linux.tar.gz
```

### Inner Pitch
Pitch tracking and MIDI output
```bash
wget https://www.auburnsounds.com/downloads/InnerPitch-*-Linux.tar.gz
```

## Alternative: Open-Source LV2 Vocal Plugins

If you specifically need LV2 plugins for vocal processing:

### 1. LSP Plugins (Already Available)
```bash
# These are already in your system
# Check: ls /usr/lib64/lv2/lsp-plugins.lv2/
```

Vocal-relevant LSP plugins:
- **lsp-compressor-stereo** - Compression
- **lsp-equalizer-stereo** - EQ
- **lsp-limiter-stereo** - Limiting

### 2. Calf Studio Gear
```bash
# Install Calf LV2 plugins
sudo dnf install calf-lv2

# Verify
ls /usr/lib64/lv2/calf.lv2/
```

Calf vocal plugins:
- **Calf Compressor**
- **Calf Gate**
- **Calf Equalizer**
- **Calf Vintage Delay**

### 3. x42 Plugins
```bash
# Install x42 plugins collection
sudo dnf install x42-plugins

# Verify
ls /usr/lib64/lv2/ | grep x42
```

x42 vocal plugins:
- **x42-compressor**
- **x42-eq**
- **x42-autotune** (pitch correction!)

### 4. Zam Plugins
```bash
# Install Zam Audio plugins
sudo dnf install zam-plugins

# Verify
ls /usr/lib64/lv2/Zam*.lv2/
```

Zam vocal plugins:
- **ZamGate**
- **ZamComp**
- **ZamEQ2**

## Pitch Correction Alternatives (LV2)

Since Graillon's main feature is pitch correction:

### Autotalent (Open Source)
```bash
# Install autotalent LV2
sudo dnf install autotalent-lv2

# Or build from source
git clone https://github.com/jhernberg/autotalent.git
cd autotalent
make
sudo make install
```

### Aubio Pitch Tracker
```bash
sudo dnf install aubio-tools
```

## Complete Installation Script

```bash
#!/bin/bash
# Install comprehensive LV2 plugin suite for vocal processing

echo "Installing LV2 plugin packages..."

# Calf Studio Gear
sudo dnf install -y calf-lv2

# x42 Plugins (includes x42-autotune)
sudo dnf install -y x42-plugins

# Zam Audio Plugins
sudo dnf install -y zam-plugins

# Autotalent pitch correction
sudo dnf install -y autotalent-lv2

# Refresh MAP2 plugin cache
echo ""
echo "Refreshing MAP2 plugin cache..."
curl -X POST http://localhost:8000/api/plugins/lv2/refresh

# List newly installed plugins
echo ""
echo "Newly installed vocal processing plugins:"
curl -s http://localhost:8000/api/plugins/lv2 | jq -r '.plugins[] | select(.name | test("Comp|Gate|EQ|Auto|Tune|Pitch")) | "\(.name) - \(.uri)"'

echo ""
echo "✅ Installation complete!"
```

Save and run:
```bash
chmod +x install_vocal_plugins.sh
./install_vocal_plugins.sh
```

## Comparison Table

| Plugin | Format | Pitch Correction | Free | Open Source |
|--------|--------|------------------|------|-------------|
| **Graillon** | VST3 | ✅ | ✅ Free version | ❌ |
| **x42-autotune** | LV2 | ✅ | ✅ | ✅ |
| **Autotalent** | LV2 | ✅ | ✅ | ✅ |
| **Calf Plugins** | LV2 | ❌ | ✅ | ✅ |
| **Zam Plugins** | LV2 | ❌ | ✅ | ✅ |

## Recommendation

**For best results:**
1. Install **Graillon as VST3** (superior GUI and features)
2. Install **x42-autotune as LV2** (open-source alternative)
3. Install **Calf/Zam/LSP for supporting effects** (compression, EQ, etc.)

This gives you both commercial quality (Graillon) and open-source flexibility (LV2 suite).

---

**Questions?** Check the [VST3_PLUGIN_LOADER_COMPONENT.md](VST3_PLUGIN_LOADER_COMPONENT.md) for using VST3 plugins in MAP2.
