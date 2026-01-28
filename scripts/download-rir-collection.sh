#!/bin/bash
# Download Room Impulse Response Collection
# Adds free IRs from Graphi07/room-impulse-responses to map2-audio reverb collection

set -e

IR_DIR="${HOME}/.local/share/map2/ir/reverbs"
TEMP_DIR="/tmp/map2-rir-download"
LOG_FILE="${IR_DIR}/download-log.txt"

echo "Map2-Audio RIR Collection Download" | tee "$LOG_FILE"
echo "=====================================" | tee -a "$LOG_FILE"
echo "Destination: $IR_DIR" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Create directories
mkdir -p "$IR_DIR" "$TEMP_DIR"

# Function to download and extract dataset
download_dataset() {
  local name=$1
  local script_url=$2
  local extract_cmd=$3
  
  echo "[*] Downloading $name..." | tee -a "$LOG_FILE"
  
  cd "$TEMP_DIR"
  wget -q --show-progress "$script_url" -O "get_${name}.sh" 2>&1 | tee -a "$LOG_FILE" || {
    echo "[!] Failed to download $name script" | tee -a "$LOG_FILE"
    return 1
  }
  
  chmod +x "get_${name}.sh"
  ./"get_${name}.sh" "$TEMP_DIR/${name}" 2>&1 | tee -a "$LOG_FILE" || {
    echo "[!] Failed to extract $name" | tee -a "$LOG_FILE"
    return 1
  }
  
  # Find and copy WAV files
  if [ -d "$TEMP_DIR/${name}" ]; then
    find "$TEMP_DIR/${name}" -name "*.wav" -exec cp {} "$IR_DIR/" \; 2>/dev/null || true
    echo "[✓] Added $name IRs" | tee -a "$LOG_FILE"
  fi
}

# Directly downloadable datasets (marked with ✔️)
echo "[Phase 1] Downloading directly-available datasets..." | tee -a "$LOG_FILE"

# 1. OpenAIR (46+ environments)
download_dataset "openair" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_openair.sh"

# 2. BUT Reverb Database (1300+ mono RIRs, 8 rooms)
download_dataset "but" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_but.sh"

# 3. MIT IR Survey (271 RIRs, distinct places)
download_dataset "mit" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_mit.sh"

# 4. ACE Challenge (multi-channel in 7 rooms)
download_dataset "ace" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_ace.sh"

# 5. REVERB Challenge (8-channel RIRs)
download_dataset "reverb" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_reverb.sh"

# 6. Aachen Impulse Response Database (344 binaural RIRs)
download_dataset "aachen" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_aachen.sh"

# 7. RWCP Sound Scene Database (143 multi-channel RIRs)
download_dataset "rwcp" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_rwcp_reverb_air.sh"

# 8. Multichannel Impulse Response Database (234 8-channel RIRs)
download_dataset "multichannel" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_multichannel.sh"

# 9. C4DM RIR Database (468 mono/ambisonic RIRs)
download_dataset "c4dm" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_c4dm.sh"

# 10. MIRD (multiple environments)
download_dataset "mird" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_mird.sh"

# 11. MIRACLE (856,128 impulse responses)
download_dataset "miracle" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_miracle.sh"

# 12. GTU-RIR (15,000+ RIRs)
download_dataset "gtu" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_gtu_rir.sh"

# 13. SoundCam (5,000 10-channel measurements)
download_dataset "soundcam" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_soundcam.sh"

# 14. SRIRACHA (2.6M RIRs with varying absorption)
download_dataset "sriracha" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_sriracha.sh"

# 15. HOMULA-RIR (higher-order microphone RIRs)
download_dataset "homula" "https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_homula-rir.sh"

# Cleanup
echo "" | tee -a "$LOG_FILE"
echo "[*] Cleaning up temporary files..." | tee -a "$LOG_FILE"
rm -rf "$TEMP_DIR"

# Count results
IR_COUNT=$(find "$IR_DIR" -name "*.wav" | wc -l)

echo "" | tee -a "$LOG_FILE"
echo "=====================================" | tee -a "$LOG_FILE"
echo "[✓] Download Complete!" | tee -a "$LOG_FILE"
echo "Total IRs available: $IR_COUNT" | tee -a "$LOG_FILE"
echo "Location: $IR_DIR" | tee -a "$LOG_FILE"
echo "Completed: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
