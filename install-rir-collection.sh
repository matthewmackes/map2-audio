#!/bin/bash
# One-line Room Impulse Response collection installer for Map2-Audio
# Usage: bash install-rir-collection.sh

set -e

IR_DIR="${HOME}/.local/share/map2/ir/reverbs"
TEMP_DIR="/tmp/map2-rir-$$"

mkdir -p "$IR_DIR" "$TEMP_DIR"
cd "$TEMP_DIR"

echo "🎵 Map2-Audio RIR Collection Installer"
echo "========================================"
echo ""

# Array of datasets to download (directly downloadable, marked with ✔️)
datasets=(
  "openair:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_openair.sh"
  "but:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_but.sh"
  "mit:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_mit.sh"
  "reverb:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_reverb.sh"
  "aachen:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_aachen.sh"
  "rwcp:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_rwcp_reverb_air.sh"
  "multichannel:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_multichannel.sh"
  "c4dm:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_c4dm.sh"
  "mird:https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_mird.sh"
)

total=${#datasets[@]}
completed=0

for dataset in "${datasets[@]}"; do
  IFS=':' read -r name url <<< "$dataset"
  ((completed++))
  
  echo "[$completed/$total] Downloading $name..."
  
  wget -q --show-progress "$url" -O "get_${name}.sh" 2>/dev/null || {
    echo "  ⚠️  Could not download $name"
    continue
  }
  
  chmod +x "get_${name}.sh"
  
  echo "  Extracting..."
  ./"get_${name}.sh" "$TEMP_DIR/${name}" 2>/dev/null || {
    echo "  ⚠️  Could not extract $name"
    continue
  }
  
  if [ -d "$TEMP_DIR/${name}" ]; then
    count=$(find "$TEMP_DIR/${name}" -name "*.wav" -exec cp {} "$IR_DIR/" \; 2>/dev/null | wc -l)
    echo "  ✅ Added $name IRs"
  fi
done

# Cleanup
rm -rf "$TEMP_DIR"

# Count final results
IR_COUNT=$(find "$IR_DIR" -name "*.wav" 2>/dev/null | wc -l)

echo ""
echo "========================================"
echo "✅ Installation Complete!"
echo "📊 Total IRs: $IR_COUNT"
echo "📁 Location: $IR_DIR"
echo ""
echo "Next: Visit http://172.20.234.234:3000/chains/flow"
echo "      and scroll to the Reverb IR section!"
