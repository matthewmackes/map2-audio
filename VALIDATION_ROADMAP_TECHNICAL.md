# Tier A Validation Roadmap – Actionable Technical Details
## MAP2 Audio Platform: Path from Tier B+ to Professional Grade

---

## PART A: IMMEDIATE FIXES (Do This Week)

### Fix #1: ConvolutionProcessor Build Error

**File:** `juce-engine/Source/ConvolutionProcessor.cpp`  
**Lines:** 33, 242  
**Problem:** `juce::dsp::Convolution` does not support assignment (operator= is deleted)

**Current Code (BROKEN):**
```cpp
// Line 33 in prepare():
convolution_ = juce::dsp::Convolution(getModeLatency());
// ^ ERROR: use of deleted function 'operator='
```

**Fixed Code:**
```cpp
// In ConvolutionProcessor.h, change member variable:
// FROM:
// juce::dsp::Convolution convolution_;
// TO:
std::unique_ptr<juce::dsp::Convolution> convolution_;

// In ConvolutionProcessor.cpp, in prepare():
{
    auto newConvolution = std::make_unique<juce::dsp::Convolution>(getModeLatency());
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = static_cast<juce::uint32>(numChannels);
    newConvolution->prepare(spec);
    convolution_ = std::move(newConvolution);  // Move, not assign
}

// Same fix for setMode() at line ~242:
{
    auto newConvolution = std::make_unique<juce::dsp::Convolution>(getModeLatency());
    newConvolution->prepare(spec);
    // Reload IR if needed...
    convolution_ = std::move(newConvolution);
}
```

**Validation:**
```bash
cd /home/mm/map2-audio/build
ninja 2>&1 | grep -E "error:|✓ built"
# Expected: "✓ built in X seconds" with NO errors
```

---

### Fix #2: Implement Xrun Detection in Audio Callback

**File:** `juce-engine/Source/JuceAudioIO.cpp`  
**Method:** `audioDeviceIOCallback()`

**Add to class declaration (JuceAudioIO.h):**
```cpp
private:
    std::atomic<int> xrunCount_{0};
    std::atomic<bool> lastCallbackSucceeded_{true};
    std::chrono::steady_clock::time_point lastCallbackTime_;
```

**Add to audioDeviceIOCallback():**
```cpp
void JuceAudioIO::audioDeviceIOCallback(const float* const* inputChannelData,
                                        int numInputChannels,
                                        float* const* outputChannelData,
                                        int numOutputChannels,
                                        int numSamples) {
    auto now = std::chrono::steady_clock::now();
    
    // Detect if callback took too long (xrun detection)
    if (lastCallbackSucceeded_.load()) {
        auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(
            now - lastCallbackTime_).count();
        
        // Expected: ~1333 µs @ 48 kHz, 64 samples
        // Alarm if > 2× expected
        if (elapsed > 3000) {  // 3 ms is 2.25× expected
            ++xrunCount_;
            logger.warn("Xrun detected: callback took {} µs", elapsed);
            // Signal UI (via atomic flag or thread-safe queue)
            notifyXrunToUI();
        }
    }
    
    lastCallbackTime_ = now;
    lastCallbackSucceeded_.store(true);
    
    // Process audio normally
    if (processCallback_) {
        try {
            processCallback_(inputChannelData, numInputChannels,
                            outputChannelData, numOutputChannels,
                            numSamples);
        } catch (...) {
            // Silence output on error (prevent feedback)
            for (int ch = 0; ch < numOutputChannels; ++ch) {
                std::fill(outputChannelData[ch], 
                         outputChannelData[ch] + numSamples, 0.0f);
            }
            lastCallbackSucceeded_.store(false);
            ++xrunCount_;
        }
    }
}

// Public getter for diagnostics
int getXrunCount() const { return xrunCount_.load(); }
void resetXrunCount() { xrunCount_.store(0); }
```

**Validation:**
```bash
# In your test app, intentionally cause xrun:
# 1. Start engine
# 2. In background: sleep 0.1 && taskset -p -c 0 $(pgrep juce_engine)  # Force context switch
# 3. Confirm xrunCount increments
# 4. Check UI shows warning (if UI is connected)
```

---

### Fix #3: Add PipeWire Connection Loss Detection

**File:** `juce-engine/Source/JuceAudioIO.cpp`  
**Add new method:**

```cpp
// Detect if JACK/PipeWire connection is still alive
bool JuceAudioIO::isPipeWireConnected() const {
    // Simple check: try to get current device info
    auto* currentDevice = deviceManager_.getCurrentAudioDevice();
    if (!currentDevice) {
        logger.error("PipeWire: No current device");
        return false;
    }
    
    // Check if device is still active
    if (!currentDevice->isOpen()) {
        logger.error("PipeWire: Device is closed");
        return false;
    }
    
    return true;
}

// Call periodically (every 100 ms) from non-RT thread:
void JuceAudioIO::connectionMonitorThread() {
    while (initialized_) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        
        if (!isPipeWireConnected()) {
            logger.critical("PipeWire connection lost!");
            
            // Notify UI to pause playback
            std::lock_guard<std::mutex> lock(stateMutex_);
            connectionLost_ = true;
            
            // Attempt reconnect
            logger.info("Attempting PipeWire reconnect...");
            if (reconnectToPipeWire()) {
                logger.info("PipeWire reconnect successful");
                connectionLost_ = false;
            }
        }
    }
}

bool JuceAudioIO::reconnectToPipeWire() {
    // Shutdown audio
    stopAudio();
    
    // Wait for graceful shutdown
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    
    // Reinitialize
    juce::String error = deviceManager_.initialise(
        numInputChannels_,
        numOutputChannels_,
        nullptr,
        true,
        juce::String(),
        nullptr
    );
    
    if (error.isNotEmpty()) {
        logger.error("PipeWire reconnect failed: {}", error.toStdString());
        return false;
    }
    
    // Restart audio
    return startAudio();
}

// In destructor/startup:
JuceAudioIO::JuceAudioIO() {
    // Launch connection monitor thread
    connectionMonitor_ = std::thread([this] { connectionMonitorThread(); });
}

~JuceAudioIO() {
    initialized_ = false;
    if (connectionMonitor_.joinable()) {
        connectionMonitor_.join();
    }
}
```

---

## PART B: LATENCY MEASUREMENT PROTOCOL (Do Days 2–3)

### Script: Loopback Latency Measurement

**Save as:** `scripts/measure_latency_loopback.sh`

```bash
#!/bin/bash
# Measure round-trip latency using audio loopback
# Requires: Audacity CLI, audio interface with loopback capability

set -e

echo "=== MAP2 Audio Latency Measurement ==="
echo "This script measures round-trip latency using audio loopback."
echo ""
echo "Prerequisites:"
echo "  1. Audio interface with loopback mode (or use analog loopback cable)"
echo "  2. MAP2 engine running: ./m2.sh start"
echo "  3. Audacity installed: sudo dnf install audacity"
echo ""

# Configuration
SAMPLE_RATE=48000
DURATION=0.5  # 500 ms test tone
FREQUENCY=1000  # 1 kHz sine

# Check if engine is running
if ! pgrep -f "uvicorn app.main:app" > /dev/null; then
    echo "ERROR: MAP2 engine not running. Start with: ./m2.sh start"
    exit 1
fi

# Check if audio loopback is available
echo "Available audio devices:"
arecord -l | grep -E "^card|device"

echo ""
echo "Setup Instructions:"
echo "  1. If using loopback cable: Connect audio OUT → IN on interface"
echo "  2. If using interface loopback mode: Enable via interface settings"
echo "  3. Test system latency baseline (without MAP2 running):"
echo ""

# Generate test tone
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "Generating test tone: $FREQUENCY Hz, $DURATION seconds..."
ffmpeg -f lavfi -i "sine=f=$FREQUENCY:d=$DURATION" \
  -f s16le -acodec pcm_s16le -ar $SAMPLE_RATE \
  test_tone.wav -y -loglevel quiet

# Play and record simultaneously
echo "Playing tone + recording input..."
{
    # Play in background
    aplay test_tone.wav 2>/dev/null &
    APLAY_PID=$!
    
    # Record for slightly longer than tone duration
    arecord -r $SAMPLE_RATE -c 1 -f S16_LE -d 1 recorded.wav 2>/dev/null
    
    wait $APLAY_PID 2>/dev/null || true
} 

# Analyze using Audacity (if available) or SoX
if command -v sox &> /dev/null; then
    echo "Analyzing with SoX..."
    
    # Convert to WAV if needed
    sox test_tone.wav test_tone_sox.wav
    sox recorded.wav recorded_sox.wav
    
    # Use cross-correlation to find delay
    # (This requires custom script; SoX doesn't have built-in correlation)
    echo "Cross-correlation analysis (manual inspection required)"
    echo "Use: audacity test_tone_sox.wav recorded_sox.wav"
    echo "Then zoom in on waveforms and measure sample offset"
else
    echo "SoX not available. Using Audacity for visual inspection..."
    echo ""
    echo "To measure latency manually:"
    echo "  1. audacity"
    echo "  2. File → Open → test_tone.wav"
    echo "  3. File → Import → recorded.wav (onto separate track)"
    echo "  4. Zoom in (Ctrl+1) until samples are visible"
    echo "  5. Note the sample offset between output and input peaks"
    echo "  6. Calculate: offset_samples / $SAMPLE_RATE * 1000 = latency_ms"
fi

echo ""
echo "Test files saved to: $TEMP_DIR"
echo "Output: test_tone.wav, recorded.wav"
echo ""

# Cleanup
cd - > /dev/null
# Optionally: rm -rf "$TEMP_DIR"

echo "=== Measurement Complete ==="
```

**Run it:**
```bash
chmod +x scripts/measure_latency_loopback.sh
./scripts/measure_latency_loopback.sh
```

---

### Manual JACK Latency Measurement

```bash
# If you have JACK tools installed:
sudo dnf install jack-tools

# Measure latency 100 times, get statistics
jack_latency_stats -r system:capture_1 system:playback_1 2>/dev/null | tee latency_stats.txt

# Expected output:
# Latency: min=2650, max=2720, mean=2668, variance=200
# This means: 2668 µs nominal ± 70 µs jitter
```

**Interpretation:**
- **Nominal:** 2668 µs = 2.668 ms (64 samples @ 48 kHz = 1.333 ms × 2 buffers)
- **Jitter:** 70 µs standard deviation = excellent (< 100 µs is pro-level)
- **Max outlier:** 2720 µs = 2.720 ms (2.7% above nominal = acceptable)

---

### Record Results

**Template: `LATENCY_MEASUREMENT_RESULTS.md`**

```markdown
# Latency Measurement Results – MAP2 v2.0
**Date:** [TODAY]  
**System:** [YOUR CPU], [YOUR KERNEL]  
**Configuration:** PipeWire @ 48 kHz, 64-sample buffer, full plugin chain

## Test 1: Loopback Cable Measurement
- **Run 1:** 3.15 ms
- **Run 2:** 3.22 ms
- **Run 3:** 3.18 ms
- **Run 4:** 3.20 ms
- **Run 5:** 3.19 ms
- **Average:** 3.19 ms
- **Std Dev:** ±0.03 ms
- **Conclusion:** PASS ✓ (< 4 ms target)

## Test 2: JACK Latency Stats (100 samples)
```
jack_latency_stats output:
Latency: min=3180, max=3240, mean=3195, variance=400
Std Dev: 20 µs
Jitter (99th %ile): ±60 µs
```
- **Nominal:** 3.195 ms
- **Jitter:** ±60 µs (excellent)
- **Conclusion:** PASS ✓ (< 200 µs jitter target)

## Test 3: Plugin Chain Latency Breakdown
- Base I/O latency: 2.67 ms (64 samples each direction)
- Plugin chain: +0.52 ms (4 plugins)
- **Total:** 3.19 ms ✓

## Assessment
✅ Latency target achieved: 3.19 ms (target: < 4.0 ms)  
✅ Jitter excellent: ±60 µs (target: < 200 µs)  
✅ Ready for Tier A validation
```

---

## PART C: 7-DAY XRUN STRESS TEST (Do Week 1–2)

### Automated Stress Test Script

**Save as:** `scripts/stress_test_7day.sh`

```bash
#!/bin/bash
# 7-day continuous xrun and stability test

DURATION_HOURS=168  # 7 days
TEST_DIR="./stress_test_results"
mkdir -p "$TEST_DIR"

echo "=== 7-Day Stress Test ==="
echo "Duration: $DURATION_HOURS hours"
echo "Output directory: $TEST_DIR"
echo ""
echo "What this test does:"
echo "  1. Runs MAP2 engine continuously for 7 days"
echo "  2. Loads full plugin chain (4+ effects)"
echo "  3. Plays backing track on repeat"
echo "  4. Monitors xruns, CPU, memory every 10 seconds"
echo "  5. Records all events to log file"
echo ""
echo "Prerequisites:"
echo "  - MAP2 engine running (./m2.sh start)"
echo "  - Audio interface connected and active"
echo "  - Backing track: data/backing_track.wav (or similar)"
echo ""

# Start monitoring
start_time=$(date +%s)
xrun_baseline=$(jack_stat 2>/dev/null | grep -oP 'xruns: \K[0-9]+' || echo "0")

echo "[$(date)] Test started. Baseline xruns: $xrun_baseline" | tee "$TEST_DIR/test.log"

# Monitoring loop
while true; do
    current_time=$(date +%s)
    elapsed_hours=$(( (current_time - start_time) / 3600 ))
    
    # Check if 7 days elapsed
    if [ $elapsed_hours -ge $DURATION_HOURS ]; then
        echo "[$(date)] Test completed after $DURATION_HOURS hours" | tee -a "$TEST_DIR/test.log"
        break
    fi
    
    # Log stats every 10 seconds
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    xruns=$(jack_stat 2>/dev/null | grep -oP 'xruns: \K[0-9]+' || echo "0")
    cpu_use=$(ps aux | grep "map2\|python" | grep -v grep | awk '{sum+=$3} END {print sum "%"}')
    mem_use=$(ps aux | grep "map2\|python" | grep -v grep | awk '{sum+=$4} END {print sum "%"}')
    
    echo "[$timestamp] +${elapsed_hours}h – Xruns: $xruns | CPU: $cpu_use | Mem: $mem_use" | tee -a "$TEST_DIR/test.log"
    
    # Check for xruns
    if [ "$xruns" -gt "$xrun_baseline" ]; then
        xrun_count=$(( xruns - xrun_baseline ))
        echo "⚠️  WARNING: $xrun_count new xruns detected!" | tee -a "$TEST_DIR/test.log"
        xrun_baseline=$xruns
    fi
    
    # Sleep 10 seconds before next check
    sleep 10
done

# Final report
echo "" | tee -a "$TEST_DIR/test.log"
echo "=== Test Summary ===" | tee -a "$TEST_DIR/test.log"
final_xruns=$(jack_stat 2>/dev/null | grep -oP 'xruns: \K[0-9]+' || echo "0")
total_xruns=$(( final_xruns - xrun_baseline ))
echo "Total xruns in 7 days: $total_xruns" | tee -a "$TEST_DIR/test.log"

if [ "$total_xruns" -eq 0 ]; then
    echo "✅ PASS: Zero xruns (Professional standard achieved)" | tee -a "$TEST_DIR/test.log"
else
    echo "❌ FAIL: $total_xruns xruns (Target: 0, Acceptable: < 1)" | tee -a "$TEST_DIR/test.log"
fi

echo ""
echo "Full log saved to: $TEST_DIR/test.log"
```

**Run it:**
```bash
# Start the test in a tmux/screen session so it continues if terminal closes
tmux new-session -d -s stress_test "bash scripts/stress_test_7day.sh"

# Monitor progress:
tmux attach-session -t stress_test
# Or: tail -f stress_test_results/test.log

# After 7 days, check results:
cat stress_test_results/test.log | grep "Total xruns"
```

---

## PART D: DEVICE HOTPLUG VALIDATION (Do Week 2)

### USB Disconnect/Reconnect Test

```bash
#!/bin/bash
# Test graceful handling of USB audio interface disconnect

echo "=== USB Device Hotplug Test ==="
echo ""
echo "1. START: Verify engine is running"
pgrep -af "uvicorn\|map2" || echo "ERROR: Engine not running"

echo ""
echo "2. PLAYING: Start playback of test tone"
echo "   $ ffplay data/backing_track.wav"
# (User runs this manually)

echo ""
echo "3. DISCONNECT: Unplug USB audio interface (NOW!)"
read -p "Press ENTER after unplugging... "

echo ""
echo "4. EXPECTED BEHAVIOR:"
echo "   - Audio stops (expected)"
echo "   - Engine logs error: 'Device disconnected' or similar"
echo "   - Web UI remains responsive"
echo "   - No segfault or crash"

echo ""
echo "5. MONITOR ENGINE:"
journalctl -u map2-engine -f --since="10 seconds ago" &
JOURNAL_PID=$!

echo ""
echo "6. RECONNECT: Plug USB interface back in"
read -p "Press ENTER after plugging in... "

# Let it settle
sleep 3

# Kill journal monitor
kill $JOURNAL_PID 2>/dev/null || true

echo ""
echo "7. VERIFY RECOVERY:"
echo "   - Audio automatically resumes? (IDEAL)"
echo "   - Manual restart required? (ACCEPTABLE)"
echo "   - Web UI still responsive? (MANDATORY)"
echo "   - Snapshots preserved? (IDEAL)"

echo ""
echo "8. VERDICT:"
read -p "Did the engine handle disconnect gracefully? (yes/no) " verdict
if [ "$verdict" = "yes" ]; then
    echo "✅ PASS: Device hotplug handled correctly"
else
    echo "❌ FAIL: Unexpected behavior on device disconnect"
fi
```

---

## PART E: JITTER ANALYSIS (Advanced – Do Week 3)

### Kernel-Level Scheduling Jitter Analysis

```bash
#!/bin/bash
# Advanced: Measure actual kernel scheduling jitter using perf/ftrace

# Find JUCE engine PID
JUCE_PID=$(pgrep -f "map2_audio_engine" | head -1)
if [ -z "$JUCE_PID" ]; then
    echo "ERROR: MAP2 engine not running"
    exit 1
fi

echo "JUCE Engine PID: $JUCE_PID"
echo ""

# Measure context switches and scheduling latency
echo "Recording kernel scheduling events for 60 seconds..."
echo "(This requires sudo)"

sudo trace-cmd record -e "sched:sched_switch,sched:sched_wakeup" \
  -f "prev_pid==$JUCE_PID or next_pid==$JUCE_PID" \
  -o trace_60sec.dat sleep 60

# Analyze results
echo ""
echo "Analysis:"
trace-cmd report trace_60sec.dat | grep -E "sched_switch|sched_wakeup" | head -20

echo ""
echo "Interpretation:"
echo "  - Look for consistent ~1.33 ms between wakeups (64 samples @ 48 kHz)"
echo "  - If gaps vary > 200 µs, scheduling jitter is too high"
echo "  - If task is preempted early (runs < 1.33 ms), CPU isolation may be broken"

rm trace_60sec.dat
```

---

## PART F: CPU ISOLATION VERIFICATION (Week 2)

### Verify isolcpus Actually Works

```bash
#!/bin/bash
# Verify that CPU isolation is actually effective

echo "=== CPU Isolation Verification ==="

# 1. Check kernel parameters
echo "1. Kernel Parameters:"
if grep -q "isolcpus=" /proc/cmdline; then
    grep -oP "isolcpus=\K[^ ]+" /proc/cmdline
    echo "   ✅ isolcpus is set"
else
    echo "   ❌ isolcpus NOT set (critical for < 3 ms latency)"
fi

# 2. Check if cores are actually isolated
echo ""
echo "2. Check CPU Isolation Status (cat /proc/sys/kernel/sched_domain/cpu*/domain0/flags):"
for cpu in 4 5; do  # Adjust to your isolated cores
    if [ -f "/proc/sys/kernel/sched_domain/cpu${cpu}/domain0/flags" ]; then
        flags=$(cat "/proc/sys/kernel/sched_domain/cpu${cpu}/domain0/flags")
        if [ "$flags" = "0" ] || [ -z "$flags" ]; then
            echo "   cpu$cpu: Isolated ✅"
        else
            echo "   cpu$cpu: NOT isolated (flags=$flags) ❌"
        fi
    fi
done

# 3. Check kworker distribution
echo ""
echo "3. Kworker Thread Distribution (should all be on cores 0-3):"
ps aux | grep kworker | awk '{print $11}' | sort | uniq -c | head -10

# 4. Check if JUCE engine is actually on isolated core
echo ""
echo "4. JUCE Engine CPU Affinity:"
JUCE_PID=$(pgrep -f "map2_audio_engine" | head -1)
if [ -n "$JUCE_PID" ]; then
    taskset -pc $JUCE_PID | grep "current affinity"
else
    echo "   JUCE engine not running"
fi

# 5. Check interrupt distribution
echo ""
echo "5. IRQ Distribution (should be balanced away from isolated cores):"
cat /proc/interrupts | head -10

echo ""
echo "Summary: If isolated cores 4,5 show 0 kworkers and only audio IRQ"
echo "is routed there, isolation is working correctly."
```

---

## PART G: RECOMMENDED TESTING SCHEDULE

### Week-by-Week Validation Plan

```
WEEK 1:
  Day 1:
    [ ] Fix ConvolutionProcessor build error
    [ ] Verify clean build: ninja 2>&1 | tail -5
    
  Day 2–3:
    [ ] Measure round-trip latency (loopback cable method)
    [ ] Record result: ___ ms ± ___ ms
    [ ] Run JACK latency stats 100× → analyze jitter
    
  Day 4–7:
    [ ] Start 7-day continuous xrun monitoring

WEEK 2:
  Day 8–10:
    [ ] 7-day test completes; analyze xrun log
    [ ] Implement xrun detection in audio callback
    [ ] Test xrun detection with forced sleep
    
  Day 11–12:
    [ ] Device hotplug test (USB disconnect/reconnect)
    [ ] Verify graceful recovery
    
  Day 13–14:
    [ ] Verify CPU isolation is actually active (ftrace)
    [ ] Run kernel jitter analysis

WEEK 3–4: (If all tests pass)
  [ ] Beta test with 1–2 musicians
  [ ] Real-world rehearsal/gigging scenario
  [ ] Collect feedback
  
WEEK 5:
  [ ] Publish official latency spec
  [ ] Update documentation
  [ ] Plan Tier A release
```

---

## PART H: EXPECTED OUTCOMES

### If All Tests Pass

```
✅ Round-trip latency: 2.8–3.5 ms (< 4 ms target met)
✅ Jitter: ± 60–120 µs (< 200 µs target met)
✅ Xruns: 0 in 7-day test (professional standard met)
✅ Recovery: Graceful handling of device disconnect
✅ Isolation: Confirmed active via ftrace analysis

VERDICT: **TIER A ELIGIBLE**
→ Safe for professional gigging
→ Can claim "2.8–3.2 ms latency"
→ Competitive with Boss GT-1000 Core
```

### If Tests Reveal Issues

```
❌ Latency > 5 ms
  → Likely causes: Buffer size mismatch, PipeWire overhead
  → Actions: Increase quantum to 128, check config conflicts
  
❌ Jitter > 500 µs
  → Likely causes: CPU isolation not working, housekeeping threads on audio core
  → Actions: Verify isolcpus active, pin kworkers, check irqbalance
  
❌ Xruns detected
  → Likely causes: Memory pressure, thermal throttling, ALSA driver issue
  → Actions: Check dmesg for errors, increase swap, test temperature
```

---
