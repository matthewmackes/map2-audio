# Room Impulse Response Collection Setup Guide

## Overview
This guide explains how to download and integrate the free Room Impulse Response (RIR) collection from [Graphi07/room-impulse-responses](https://github.com/Graphi07/room-impulse-responses) into your Map2-Audio reverb system.

## Directory Structure
```
~/.local/share/map2/ir/
├── cabinets/        # Cabinet IRs (for Cabinet IR plugin)
├── reverbs/         # Reverb IRs (for Reverb IR plugin)
└── user/            # User-uploaded IRs
```

## Available Datasets
The script will download from these free datasets:

| Dataset | Count | Description |
|---------|-------|-------------|
| **OpenAIR** | 46+ | Ambisonic recordings from various environments |
| **BUT Reverb** | 1300+ | Mono RIRs from 8 rooms |
| **MIT IR Survey** | 271 | Recordings from distinct real-world locations |
| **REVERB Challenge** | 24 | 8-channel RIRs in small/medium/large rooms |
| **Aachen Database** | 344 | Binaural RIRs with dummy head |
| **RWCP Database** | 143 | Multi-channel RIRs from 14 rooms |
| **Multichannel DB** | 234 | 8-channel RIRs, 3 reverberation levels |
| **C4DM Database** | 468 | Mono/ambisonic from 3 large environments |
| **MIRD** | Varies | Multiple environment recordings |
| **MIRACLE** | 856,128 | Dense grid measurements with 64-channel array |
| **GTU-RIR** | 15,000+ | Semi-automated recordings |
| **SoundCam** | 5,000 | 10-channel measurements, 3 rooms |
| **SRIRACHA** | 2.6M | Varying absorption levels |
| **HOMULA-RIR** | Various | Higher-order microphone array RIRs |

## Quick Start

### Option 1: Automated Download (Recommended)
```bash
# Run the install script
bash ~/map2-audio/install-rir-collection.sh
```

This will:
- Download all available free RIR datasets
- Extract WAV files
- Organize them in `~/.local/share/map2/ir/reverbs/`
- Generate a log file at `~/.local/share/map2/ir/reverbs/download-log.txt`

### Option 2: Manual Download
Visit [GitHub Repo](https://github.com/Graphi07/room-impulse-responses) and:
1. Download individual datasets
2. Extract WAV files
3. Copy to `~/.local/share/map2/ir/reverbs/`

### Option 3: Selective Download
```bash
# Download specific dataset only
cd /tmp
wget https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_openair.sh
chmod +x get_openair.sh
./get_openair.sh /tmp/openair

# Copy WAV files to reverbs folder
cp /tmp/openair/**/*.wav ~/.local/share/map2/ir/reverbs/
```

## Usage in Map2-Audio

1. Open **Chain Flow** page: `http://172.20.234.234:3000/chains/flow`
2. Select **Reverb IR** section (purple card)
3. Click "Reverb Space" dropdown - now includes all downloaded IRs
4. Select any IR and adjust parameters:
   - Wet/Dry Mix
   - Pre-Delay
   - Stretch/Trim
   - Attack/Decay
   - EQ controls
   - Modulation settings

5. Click **"+ Add Reverb IR to Chain"** to activate

## Performance Notes

- **Small IRs** (< 1s): Use for tight, small room sounds
- **Large IRs** (> 5s): May increase CPU usage; monitor in system metrics
- **Dense Datasets** (MIRACLE, SRIRACHA): Extensive options, may take time to browse
- **Multichannel**: Mono IRs extracted automatically for compatibility

## Troubleshooting

### IRs not appearing
```bash
# Check if files are in correct location
ls -la ~/.local/share/map2/ir/reverbs/ | head -20

# Verify they are WAV files
file ~/.local/share/map2/ir/reverbs/*.wav | head -10
```

### Slow loading
- Too many IRs loaded? You can organize by folder:
  ```bash
  mkdir ~/.local/share/map2/ir/reverbs/{openair,but,mit,etc}
  # Move IRs to their dataset folders
  ```

### Missing IRs after download
- Check download log:
  ```bash
  cat ~/.local/share/map2/ir/reverbs/download-log.txt
  ```
- Some datasets may require manual download due to access restrictions

## Storage Requirements

- **OpenAIR**: ~100 MB
- **BUT**: ~500 MB
- **MIT**: ~50 MB
- **REVERB Challenge**: ~200 MB
- **All Datasets**: ~5-10 GB (varies)

**Recommendation**: Download to a fast SSD for best performance

## Credits

- IR Collection by: [Graphi07](https://github.com/Graphi07/room-impulse-responses)
- Individual dataset creators and institutions (see repo for attribution)
- Map2-Audio integration

## Advanced: Cabinet IR Collection

To add cabinet IRs, download from sources like:
- [Amplitube Cabinet IRs](https://www.ikmultimedia.com/)
- [Celestion IRs](https://celestion.com/pages/search-products?categories=Microphones%20and%20IRs)
- [Free cabinet IR databases](https://www.axechange.com/)

Place cabinet IRs in: `~/.local/share/map2/ir/cabinets/`

## Next Steps

1. **Test IRs**: Load a few and A/B compare different spaces
2. **Create Presets**: Save favorite combinations with high-quality settings
3. **Performance Tuning**: Monitor CPU usage with different IR sizes
4. **Chain Building**: Combine NAM models with specific reverb IRs for complete tone shaping
