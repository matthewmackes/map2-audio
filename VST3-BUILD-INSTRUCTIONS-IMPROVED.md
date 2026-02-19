# VST3 Build Instructions for MAP2 Native Processors
## Continuable AI Workflow for Multi-Session Handoff

---

## Mission Statement

Create VST3 plugin artifacts for each MAP2 native audio processor, placing them in:
```
/home/mm/map2-audio/VSTs-MAP2/
```

This guide is designed for **multi-AI continuance**: each stage produces concrete artifacts and checkpoints that any AI can pick up and continue.

---

## Ground Rules (Critical for Handoff)

1. **One Step at a Time**: Never batch multiple big changes. Do one thing → verify → checkpoint → proceed.

2. **After Every Step**: Update `build-notes/STATE.md` with:
   - What changed (files/commands/output)
   - What was verified (commands + results)
   - Current blockers (if any)
   - Next single step

3. **All Data is Explicit**: Never assume. Discover and record:
   - OS, compiler, CMake version, JUCE version
   - Plugin list with exact paths
   - Build failures with full error messages

4. **Deterministic Builds**:
   - Clean build directory per plugin
   - Explicit config (Release)
   - Record exact commands used

---

## Architecture Context (READ FIRST)

### Current State (as of 2026-02-17)

**Repo**: `/home/mm/map2-audio/`

**JUCE Engine**: `juce-engine/`
- JUCE 8.0.0 via FetchContent
- Python-bound module `map2_audio_engine` (not a plugin)
- ~19 native processors in `juce-engine/Source/*Processor.{h,cpp}`
- Processors are C++ DSP classes, **NOT** `juce::AudioProcessor` plugins

**Existing Plugin**: `juce-engine/WDFAmpPlugin/`
- CMakeLists.txt with `juce_add_plugin()`
- **Current FORMATS**: `Standalone LV2` (NO VST3 yet)
- This is the **template** for other plugins

**Native Processors** (incomplete list from CMakeLists.txt):
1. Peavey5150Processor - Tube amp simulator
2. TweedBassmanProcessor - Bassman amp
3. PassionFXProcessor - Multi-effect (Steve Vai)
4. EventideH9Processor - Multi-effect (10 algorithms)
5. H3000Processor - Harmonizer
6. BossXS1PolyShifterProcessor - Poly pitch shifter
7. IntelliFX8VoiceChorusProcessor - 8-voice chorus
8. CircularDelayProcessor - Circular delay
9. DelayProcessor - Standard delay
10. ChorusProcessor - Chorus
11. PhaserProcessor - Phaser
12. PitchShifterProcessor - Pitch shifter
13. ShoeGazeProcessor - Shoegaze effect
14. LexiLoveProcessor - Reverb effect
15. NAMProcessor - Neural amp modeler
16. ConvolutionProcessor - Cabinet IR/Reverb
17. DynamicsProcessor - Compressor/Gate/Limiter
18. FilterProcessor - EQ
19. ParallelMixerProcessor - Parallel routing

**Build System**: CMake (no Projucer)

**OS**: Linux (Fedora 43, kernel 6.18.5-200.fc43.x86_64)

**Toolchain**: gcc + clang available, cmake 3.x, ninja available

---

## Stage 0 — Preflight (No Builds)

### Objective
Capture environment, enumerate processors, understand current build.

### Step 0.1 — Environment Capture

**Action**:
```bash
mkdir -p build-notes
cat > build-notes/00-environment.md << 'EOF'
# Build Environment

**Date**: $(date -I)
**User**: $(whoami)
**Hostname**: $(hostname)

## OS
$(uname -a)

## Toolchain
- gcc: $(gcc --version | head -1)
- clang: $(clang --version | head -1)
- cmake: $(cmake --version | head -1)
- ninja: $(ninja --version 2>/dev/null || echo "not installed")
- pkg-config: $(pkg-config --version)

## JUCE
- Version: 8.0.0 (FetchContent from juce-engine/CMakeLists.txt)
- Location: build/_deps/juce-src/
- Method: CMake FetchContent

## Build System
- CMake (no Projucer)
- FetchContent for JUCE
- pybind11 for Python bindings

## Current Plugin Projects
- WDFAmpPlugin: juce-engine/WDFAmpPlugin/ (Standalone + LV2, NO VST3)

## Current Processor Classes (in juce-engine/Source/)
- 19 native processors (not plugins yet)
- Used in map2_audio_engine Python module
- Need plugin wrappers to create VST3s
EOF
```

**Verify**:
```bash
cat build-notes/00-environment.md
test -f build-notes/00-environment.md && echo "✓ Environment captured"
```

**Checkpoint**: Commit or snapshot `build-notes/00-environment.md`

**Update STATE.md**:
```markdown
## Current State
- Captured environment
- Verified toolchain (gcc, clang, cmake, ninja)
- Documented JUCE version (8.0.0)

## Next Step
- Create processor inventory with exact class names and file paths
```

---

### Step 0.2 — Processor Inventory

**Action**:
```bash
cat > build-notes/01-processor-inventory.md << 'EOF'
# MAP2 Native Processor Inventory

## Source Location
All processors: `juce-engine/Source/*Processor.{h,cpp}`

## Processor List

| # | Processor Class | Header | Impl | Type | Plugin Ready? | Notes |
|---|----------------|--------|------|------|---------------|-------|
| 1 | Peavey5150Processor | Peavey5150Processor.h | Peavey5150Processor.cpp | Amp | No | 6-stage preamp, tube sim |
| 2 | TweedBassmanProcessor | TweedBassmanProcessor.h | TweedBassmanProcessor.cpp | Amp | No | Bassman 5F6-A |
| 3 | EventideH9Processor | EventideH9Processor.h | EventideH9Processor.cpp | Multi-FX | No | 10 algorithms |
| 4 | H3000Processor | H3000Processor.h | H3000Processor.cpp | Harmonizer | No | |
| 5 | PassionFXProcessor | PassionFXProcessor.h | PassionFXProcessor.cpp | Multi-FX | No | Vai P&W |
| 6 | BossXS1PolyShifterProcessor | BossXS1PolyShifterProcessor.h | BossXS1PolyShifterProcessor.cpp | Pitch | No | |
| 7 | IntelliFX8VoiceChorusProcessor | IntelliFX8VoiceChorusProcessor.h | IntelliFX8VoiceChorusProcessor.cpp | Chorus | No | 8-voice |
| 8 | CircularDelayProcessor | CircularDelayProcessor.h | CircularDelayProcessor.cpp | Delay | No | |
| 9 | DelayProcessor | DelayProcessor.h | DelayProcessor.cpp | Delay | No | |
| 10 | ChorusProcessor | ChorusProcessor.h | ChorusProcessor.cpp | Modulation | No | |
| 11 | PhaserProcessor | PhaserProcessor.h | PhaserProcessor.cpp | Modulation | No | |
| 12 | PitchShifterProcessor | PitchShifterProcessor.h | PitchShifterProcessor.cpp | Pitch | No | |
| 13 | ShoeGazeProcessor | ShoeGazeProcessor.h | ShoeGazeProcessor.cpp | Multi-FX | No | |
| 14 | LexiLoveProcessor | LexiLoveProcessor.h | LexiLoveProcessor.cpp | Reverb | No | |
| 15 | NAMProcessor | NAMProcessor.h | NAMProcessor.cpp | Amp | No | Neural amp modeler |
| 16 | ConvolutionProcessor | ConvolutionProcessor.h | ConvolutionProcessor.cpp | IR | No | Cabinet/Reverb IR |
| 17 | DynamicsProcessor | DynamicsProcessor.h | DynamicsProcessor.cpp | Dynamics | No | Comp/Gate/Limiter |
| 18 | FilterProcessor | FilterProcessor.h | FilterProcessor.cpp | EQ | No | |
| 19 | ParallelMixerProcessor | ParallelMixerProcessor.h | ParallelMixerProcessor.cpp | Routing | No | |

## Existing Plugin Wrapper

| Plugin | Path | Formats | Has VST3? | Status |
|--------|------|---------|-----------|--------|
| WDFAmpPlugin | juce-engine/WDFAmpPlugin/ | Standalone, LV2 | ❌ | Template for others |

## Architecture Notes

1. **Processors are NOT JUCE plugins**: They're DSP classes used in the main engine
2. **To create VST3s**: Need to create plugin wrapper projects (like WDFAmpPlugin) for each processor
3. **WDFAmpPlugin is the template**: Copy and adapt for each processor
4. **Each wrapper needs**:
   - CMakeLists.txt with `juce_add_plugin(...FORMATS VST3...)`
   - PluginProcessor.h/cpp that uses the processor class
   - PluginEditor.h/cpp for UI

## Decision: Initial Subset

**For pilot build**: Start with 3-5 processors to prove the workflow before scaling to all 19.

**Recommended pilot set**:
1. Peavey5150Processor (amp, well-documented)
2. EventideH9Processor (multi-FX, complex)
3. DelayProcessor (simple, good test case)

**Scale later**: Automate the remaining 16 after pilot succeeds.
EOF
```

**Verify**:
```bash
# Cross-check inventory against actual files
echo "Verifying processor files exist..."
cd /home/mm/map2-audio/juce-engine/Source
for proc in Peavey5150 TweedBassman EventideH9 DelayProcessor; do
  test -f "${proc}Processor.h" && test -f "${proc}Processor.cpp" && echo "✓ ${proc}Processor" || echo "✗ ${proc}Processor MISSING"
done
```

**Checkpoint**: Commit `build-notes/01-processor-inventory.md`

**Update STATE.md**:
```markdown
## Current State
- Enumerated 19 native processors
- Verified processors are DSP classes, not plugins
- Identified WDFAmpPlugin as template
- Selected 3 pilot processors (Peavey5150, EventideH9, Delay)

## Blockers
- None

## Next Step
- Analyze WDFAmpPlugin structure to understand wrapper pattern
```

---

## Stage 1 — Understand the Template

### Objective
Study WDFAmpPlugin to understand the plugin wrapper pattern.

### Step 1.1 — Analyze WDFAmpPlugin

**Action**:
```bash
cat > build-notes/02-wdfamp-analysis.md << 'EOF'
# WDFAmpPlugin Structure Analysis

## Location
`juce-engine/WDFAmpPlugin/`

## Directory Structure
```
WDFAmpPlugin/
├── CMakeLists.txt          ← juce_add_plugin() definition
├── Source/
│   ├── PluginProcessor.h   ← juce::AudioProcessor subclass
│   ├── PluginProcessor.cpp ← Audio callback, parameter handling
│   ├── PluginEditor.h      ← juce::AudioProcessorEditor subclass
│   ├── PluginEditor.cpp    ← UI implementation
│   ├── WDF/                ← Processor-specific DSP classes
│   ├── Amps/               ← Amp model classes
│   ├── DSP/                ← Oversampling, etc.
│   └── UI/                 ← Custom UI components
```

## CMakeLists.txt Key Points
```cmake
juce_add_plugin(WDFAmpPlugin
    COMPANY_NAME "MAP2Audio"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE Wdfa
    FORMATS Standalone LV2        ← ADD VST3 HERE
    PRODUCT_NAME "WDFAmpSimulator"
    LV2URI "https://map2audio.com/wdf-amp"
)
```

**To add VST3**: Change `FORMATS Standalone LV2` to `FORMATS Standalone LV2 VST3`

## Pattern for New Plugins

1. **Create directory**: `juce-engine/<PluginName>/`
2. **Copy template**: Use WDFAmpPlugin as base
3. **Update CMakeLists.txt**:
   - Change plugin name
   - Change PLUGIN_CODE (4-char unique)
   - Add VST3 to FORMATS
   - Update source files list
4. **Update PluginProcessor**:
   - Include the processor class header
   - Instantiate processor in constructor
   - Call processor methods in processBlock()
5. **Update PluginEditor**: Create UI for processor parameters
6. **Add to parent CMake**: Add `add_subdirectory(<PluginName>)` to `juce-engine/CMakeLists.txt`

## Build Output Location (typical)
```
juce-engine/build/<PluginName>_artefacts/Release/VST3/<PluginName>.vst3/
```
EOF
```

**Verify**:
```bash
cat build-notes/02-wdfamp-analysis.md
test -f juce-engine/WDFAmpPlugin/CMakeLists.txt && echo "✓ WDFAmpPlugin CMakeLists.txt exists"
```

**Checkpoint**: Commit `build-notes/02-wdfamp-analysis.md`

**Update STATE.md**:
```markdown
## Current State
- Analyzed WDFAmpPlugin structure
- Identified plugin wrapper pattern
- Documented required changes for new plugins
- **KEY FINDING**: WDFAmpPlugin needs VST3 added to FORMATS

## Next Step
- Define build strategy (pilot-first approach)
```

---

## Stage 2 — Build Strategy

### Step 2.1 — Define Strategy

**Action**:
```bash
cat > build-notes/03-build-strategy.md << 'EOF'
# Build Strategy

## Approach: Pilot-First, Then Automate

### Phase 1: Pilot Plugin (WDFAmpPlugin + VST3)
**Goal**: Prove VST3 build works end-to-end with existing plugin

**Steps**:
1. Add VST3 to WDFAmpPlugin's FORMATS
2. Build WDFAmpPlugin with VST3
3. Locate .vst3 output
4. Copy to VSTs-MAP2/
5. Validate (pluginval if available, or manual load test)

**Success criteria**:
- WDFAmpPlugin.vst3 exists in VSTs-MAP2/
- .vst3 contains .so library
- No build errors

### Phase 2: Create One New Plugin Wrapper
**Goal**: Prove wrapper creation pattern

**Target**: Peavey5150Processor → Peavey5150Plugin

**Steps**:
1. Copy WDFAmpPlugin/ to Peavey5150Plugin/
2. Update CMakeLists.txt (name, code, sources)
3. Update PluginProcessor to use Peavey5150Processor class
4. Update PluginEditor for Peavey5150 parameters
5. Add to parent juce-engine/CMakeLists.txt
6. Build Peavey5150Plugin VST3
7. Copy to VSTs-MAP2/

**Success criteria**:
- Peavey5150Plugin.vst3 exists in VSTs-MAP2/
- Loads without errors
- Parameters work

### Phase 3: Automate for Remaining Processors
**Goal**: Script the wrapper creation and build process

**Steps**:
1. Create template generator script
2. Create plugins.json inventory
3. Create build_vst3_all.sh automation script
4. Process remaining ~17 processors

### Phase 4: Validation & Documentation
**Goal**: Ensure all VST3s work

**Steps**:
1. Run pluginval on all VST3s (if available)
2. Document each plugin's parameters and presets
3. Create summary report

## Build System Details

**CMake-based** (no Projucer)

**Parent CMake**: `juce-engine/CMakeLists.txt`
- Add `add_subdirectory(<PluginName>)` for each plugin

**Plugin CMake**: `juce-engine/<PluginName>/CMakeLists.txt`
- `juce_add_plugin(...)` with VST3 in FORMATS
- Link against juce::juce_audio_utils, juce::juce_dsp

**Build commands**:
```bash
cd /home/mm/map2-audio/juce-engine
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=clang++
cmake --build build --target <PluginName> -j
```

**Output locations** (typical):
```
build/<PluginName>_artefacts/Release/VST3/<PluginName>.vst3/
```

## Output Folder

**Location**: `/home/mm/map2-audio/VSTs-MAP2/`

**Naming**: `<PluginName>.vst3` (directory on Linux)

**Script responsibility**: Copy from build output to VSTs-MAP2/
EOF
```

**Verify**:
```bash
cat build-notes/03-build-strategy.md
```

**Checkpoint**: Commit `build-notes/03-build-strategy.md`

**Update STATE.md**:
```markdown
## Current State
- Defined 4-phase build strategy
- Phase 1: Pilot (WDFAmpPlugin + VST3)
- Phase 2: One new wrapper (Peavey5150)
- Phase 3: Automate remaining 17
- Phase 4: Validate & document

## Next Step
- Create VSTs-MAP2/ output folder
```

---

## Stage 3 — Setup Output Folder

### Step 3.1 — Create Output Folder

**Action**:
```bash
mkdir -p /home/mm/map2-audio/VSTs-MAP2
cat > build-notes/04-output-layout.md << 'EOF'
# Output Layout

## Location
`/home/mm/map2-audio/VSTs-MAP2/`

## Naming Convention
Each plugin VST3: `<PluginName>.vst3/` (directory)

## Contents (typical)
```
VSTs-MAP2/
├── WDFAmpPlugin.vst3/
│   └── Contents/
│       └── x86_64-linux/
│           └── WDFAmpPlugin.so
├── Peavey5150Plugin.vst3/
│   └── Contents/
│       └── x86_64-linux/
│           └── Peavey5150Plugin.so
└── ...
```

## .gitignore Recommendation
Add to `.gitignore`:
```
VSTs-MAP2/
```

(Unless you want to commit binaries - not typical)
EOF

echo "/VSTs-MAP2/" >> /home/mm/map2-audio/.gitignore
```

**Verify**:
```bash
test -d /home/mm/map2-audio/VSTs-MAP2 && echo "✓ Output folder exists"
test -w /home/mm/map2-audio/VSTs-MAP2 && echo "✓ Output folder writable"
```

**Checkpoint**: Commit `build-notes/04-output-layout.md` and `.gitignore`

**Update STATE.md**:
```markdown
## Current State
- Created /home/mm/map2-audio/VSTs-MAP2/
- Added to .gitignore
- Documented output structure

## Next Step
- Begin Phase 1: Add VST3 to WDFAmpPlugin
```

---

## Stage 4 — Phase 1 Pilot (WDFAmpPlugin + VST3)

### Step 4.1 — Add VST3 to WDFAmpPlugin

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine/WDFAmpPlugin
cp CMakeLists.txt CMakeLists.txt.backup

# Edit CMakeLists.txt: change line 53
# FROM: FORMATS Standalone LV2
# TO:   FORMATS Standalone LV2 VST3
```

**Edit with**:
```bash
# Use sed or manual edit
sed -i 's/FORMATS Standalone LV2/FORMATS Standalone LV2 VST3/' CMakeLists.txt

# Verify change
grep "FORMATS" CMakeLists.txt
```

**Expected output**:
```
    FORMATS Standalone LV2 VST3
```

**Verify**:
```bash
diff CMakeLists.txt.backup CMakeLists.txt
# Should show VST3 added
```

**Checkpoint**: Commit change

**Update STATE.md**:
```markdown
## Current State
- Modified WDFAmpPlugin/CMakeLists.txt to include VST3

## Next Step
- Build WDFAmpPlugin with VST3 target
```

---

### Step 4.2 — Build WDFAmpPlugin VST3

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine

# Clean build (optional but recommended for pilot)
rm -rf build

# Configure
cmake -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++

# Build WDFAmpPlugin
cmake --build build --target WDFAmpPlugin -j

# Capture output
cmake --build build --target WDFAmpPlugin -j 2>&1 | tee ../build-notes/05-pilot-build-log.txt
```

**Verify**:
```bash
# Check build succeeded
echo $?  # Should be 0

# Find VST3 output
find build -type d -name "WDFAmpPlugin.vst3" -print

# Should find something like:
# build/WDFAmpPlugin_artefacts/Release/VST3/WDFAmpPlugin.vst3
```

**If build fails**:
1. Capture full error
2. Analyze root cause (missing SDK, dependency, etc.)
3. Apply minimal fix
4. Document in STATE.md
5. Retry

**Update STATE.md** (if success):
```markdown
## Current State
- Built WDFAmpPlugin with VST3 target
- VST3 output: build/WDFAmpPlugin_artefacts/Release/VST3/WDFAmpPlugin.vst3

## Next Step
- Copy VST3 to output folder
```

---

### Step 4.3 — Copy to Output Folder

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine

# Find VST3
VST3_PATH=$(find build -type d -name "WDFAmpPlugin.vst3" -print -quit)
echo "Found VST3: $VST3_PATH"

# Copy to output
cp -a "$VST3_PATH" /home/mm/map2-audio/VSTs-MAP2/

# Verify copy
ls -lah /home/mm/map2-audio/VSTs-MAP2/WDFAmpPlugin.vst3
```

**Verify**:
```bash
# Check .so library exists
find /home/mm/map2-audio/VSTs-MAP2/WDFAmpPlugin.vst3 -name "*.so" -exec file {} \;

# Should show ELF shared object
```

**Update STATE.md**:
```markdown
## Current State
- Copied WDFAmpPlugin.vst3 to VSTs-MAP2/
- Verified .so library exists (ELF 64-bit shared object)

## Phase 1 Status
✅ COMPLETE - VST3 build proven

## Next Step
- Begin Phase 2: Create Peavey5150Plugin wrapper
```

**Checkpoint**: Document in `build-notes/06-phase1-complete.md`

---

## Stage 5 — Phase 2 Create New Plugin Wrapper

**NOTE**: This stage is detailed but mechanical. If another AI picks up here, they should have all context needed.

### Step 5.1 — Create Peavey5150Plugin Directory

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine

# Copy WDFAmpPlugin as template
cp -r WDFAmpPlugin Peavey5150Plugin

# Remove WDF-specific files
cd Peavey5150Plugin
rm -rf Source/WDF Source/Amps Source/DSP Source/UI

# Keep only plugin wrapper files
# Should have: PluginProcessor.{h,cpp}, PluginEditor.{h,cpp}
```

**Verify**:
```bash
ls -la Source/
# Should show:
# PluginProcessor.h
# PluginProcessor.cpp
# PluginEditor.h
# PluginEditor.cpp
```

**Update STATE.md**:
```markdown
## Current State
- Created Peavey5150Plugin/ from WDFAmpPlugin template
- Removed WDF-specific sources

## Next Step
- Update CMakeLists.txt for Peavey5150Plugin
```

---

### Step 5.2 — Update CMakeLists.txt

**Action**: Edit `juce-engine/Peavey5150Plugin/CMakeLists.txt`

**Changes**:
```cmake
# Line 2: project name
project(Peavey5150Plugin VERSION 1.0.0)

# Line 43-56: juce_add_plugin()
juce_add_plugin(Peavey5150Plugin
    COMPANY_NAME "MAP2Audio"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE P515         # ← Change: unique 4-char code
    FORMATS VST3 Standalone LV2  # ← VST3 first
    PRODUCT_NAME "Peavey 5150 Block Letter"
    # LV2URI omitted (not critical for VST3)
)

# Line 59-84: target_sources()
target_sources(Peavey5150Plugin
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        # Add path to processor class
        ../Source/Peavey5150Processor.cpp
        ../Source/Peavey5150Processor.h
)

# Line 86-91: compile definitions (keep as-is)

# Line 94-95: disable LTO (keep)

# Line 97-104: link libraries
target_link_libraries(Peavey5150Plugin
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags
)
```

**Verify**:
```bash
grep "project(Peavey5150Plugin" CMakeLists.txt
grep "juce_add_plugin(Peavey5150Plugin" CMakeLists.txt
grep "Peavey5150Processor" CMakeLists.txt
```

**Update STATE.md**:
```markdown
## Current State
- Updated Peavey5150Plugin/CMakeLists.txt
- Set PLUGIN_CODE to P515
- Added Peavey5150Processor sources

## Next Step
- Update PluginProcessor to use Peavey5150Processor class
```

---

### Step 5.3 — Update PluginProcessor

**Action**: Edit `juce-engine/Peavey5150Plugin/Source/PluginProcessor.h`

**Key changes**:
```cpp
// Add include for processor class
#include "../../Source/Peavey5150Processor.h"

class Peavey5150PluginProcessor : public juce::AudioProcessor
{
public:
    Peavey5150PluginProcessor();
    ~Peavey5150PluginProcessor() override;

    // ... standard AudioProcessor methods ...

private:
    map2::Peavey5150Processor peavey5150_;  // ← Add processor instance

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Peavey5150PluginProcessor)
};
```

**In PluginProcessor.cpp**:
```cpp
Peavey5150PluginProcessor::Peavey5150PluginProcessor()
     : AudioProcessor (BusesProperties()
                     .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                     .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    // Initialize Peavey5150Processor
    peavey5150_.prepare(44100.0, 512);  // Default, will update in prepareToPlay
}

void Peavey5150PluginProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    peavey5150_.prepare(sampleRate, samplesPerBlock);
}

void Peavey5150PluginProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                               juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    // Call Peavey5150Processor's process method
    peavey5150_.processBlock(buffer, midiMessages);
}
```

**NOTE**: You'll need to check Peavey5150Processor's actual API (prepare(), processBlock() method signatures) and adapt accordingly.

**Update STATE.md**:
```markdown
## Current State
- Updated PluginProcessor to use Peavey5150Processor

## Blocker (potential)
- Need to verify Peavey5150Processor API matches assumptions
- May need to adapt processBlock() call

## Next Step
- Read Peavey5150Processor.h to confirm API
- Update PluginEditor for parameters
```

---

### Step 5.4 — Verify Processor API & Adapt

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine
grep -A 20 "class Peavey5150Processor" Source/Peavey5150Processor.h
```

**Check for**:
- prepare() method signature
- processBlock() method signature
- Parameter getters/setters

**Adapt PluginProcessor.cpp** based on actual API.

**Update STATE.md** with findings.

---

### Step 5.5 — Add to Parent CMakeLists.txt

**Action**: Edit `/home/mm/map2-audio/juce-engine/CMakeLists.txt`

**Add near end** (after map2_audio_engine definition, before install section):

```cmake
# ========================================
# VST3 Plugins (Native Processors)
# ========================================
add_subdirectory(Peavey5150Plugin)
```

**Verify**:
```bash
grep "add_subdirectory(Peavey5150Plugin)" CMakeLists.txt
```

**Update STATE.md**:
```markdown
## Current State
- Added Peavey5150Plugin to parent CMakeLists.txt

## Next Step
- Build Peavey5150Plugin
```

---

### Step 5.6 — Build Peavey5150Plugin

**Action**:
```bash
cd /home/mm/map2-audio/juce-engine

# Reconfigure (picks up new subdirectory)
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=clang++

# Build
cmake --build build --target Peavey5150Plugin -j 2>&1 | tee ../build-notes/07-peavey5150-build-log.txt
```

**Verify**:
```bash
echo $?  # Check exit code

# Find VST3
find build -type d -name "Peavey5150Plugin.vst3" -print
```

**If build fails**: See Failure Handling section below.

**Update STATE.md**:
```markdown
## Current State
- Built Peavey5150Plugin successfully (or document failure)

## Next Step
- Copy to VSTs-MAP2/
```

---

### Step 5.7 — Copy to Output

**Action**:
```bash
VST3_PATH=$(find build -type d -name "Peavey5150Plugin.vst3" -print -quit)
cp -a "$VST3_PATH" /home/mm/map2-audio/VSTs-MAP2/

ls -lah /home/mm/map2-audio/VSTs-MAP2/Peavey5150Plugin.vst3
```

**Update STATE.md**:
```markdown
## Current State
- Copied Peavey5150Plugin.vst3 to VSTs-MAP2/

## Phase 2 Status
✅ COMPLETE - New plugin wrapper pattern proven

## Next Step
- Begin Phase 3: Automate remaining processors
```

**Checkpoint**: Commit all changes, tag as `phase2-complete`

---

## Stage 6 — Phase 3 Automation

### Step 6.1 — Create plugins.json

**Action**:
```bash
cat > /home/mm/map2-audio/build-notes/plugins.json << 'EOF'
[
  {
    "name": "WDFAmpPlugin",
    "processorClass": "N/A",
    "pluginCode": "Wdfa",
    "productName": "WDF Amp Simulator",
    "status": "existing",
    "cmakeTarget": "WDFAmpPlugin",
    "expectedVst3Name": "WDFAmpPlugin.vst3"
  },
  {
    "name": "Peavey5150Plugin",
    "processorClass": "Peavey5150Processor",
    "pluginCode": "P515",
    "productName": "Peavey 5150 Block Letter",
    "status": "done",
    "cmakeTarget": "Peavey5150Plugin",
    "expectedVst3Name": "Peavey5150Plugin.vst3"
  },
  {
    "name": "EventideH9Plugin",
    "processorClass": "EventideH9Processor",
    "pluginCode": "Eh9p",
    "productName": "Eventide H9",
    "status": "todo",
    "cmakeTarget": "EventideH9Plugin",
    "expectedVst3Name": "EventideH9Plugin.vst3"
  },
  {
    "name": "DelayPlugin",
    "processorClass": "DelayProcessor",
    "pluginCode": "Mdly",
    "productName": "MAP2 Delay",
    "status": "todo",
    "cmakeTarget": "DelayPlugin",
    "expectedVst3Name": "DelayPlugin.vst3"
  }
]
EOF
```

**NOTE**: Add remaining 15 processors to this JSON with unique pluginCode values.

**Verify**:
```bash
jq . build-notes/plugins.json  # Check valid JSON
```

**Update STATE.md**:
```markdown
## Current State
- Created plugins.json with 4 initial entries
- TODO: Add remaining 15 processors

## Next Step
- Create automation script build_vst3_all.sh
```

---

### Step 6.2 — Create Build Automation Script

**Action**: Create `/home/mm/map2-audio/scripts/build_vst3_all.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# MAP2 VST3 Build Automation Script
# Purpose: Build all MAP2 native processor VST3 plugins
# Usage: ./scripts/build_vst3_all.sh [clang|gcc]
###############################################################################

TOOLCHAIN="${1:-clang}"
REPO_ROOT="/home/mm/map2-audio"
JUCE_ENGINE="$REPO_ROOT/juce-engine"
BUILD_DIR="$JUCE_ENGINE/build"
OUT_DIR="$REPO_ROOT/VSTs-MAP2"
INV="$REPO_ROOT/build-notes/plugins.json"
LOG_DIR="$REPO_ROOT/build-logs"
SUMMARY="$REPO_ROOT/build-notes/08-build-summary.md"

mkdir -p "$OUT_DIR" "$LOG_DIR" "$REPO_ROOT/build-notes"

# Check jq
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not found. Install with: sudo dnf install jq" >&2
  exit 1
fi

# Set compiler
if [[ "$TOOLCHAIN" == "clang" ]]; then
  CC=clang
  CXX=clang++
elif [[ "$TOOLCHAIN" == "gcc" ]]; then
  CC=gcc
  CXX=g++
else
  echo "ERROR: toolchain must be clang or gcc" >&2
  exit 1
fi

# Generator
GEN="Ninja"
if ! command -v ninja >/dev/null 2>&1; then
  GEN="Unix Makefiles"
fi

echo "========================================="
echo "MAP2 VST3 Build - $(date)"
echo "Toolchain: $CC/$CXX"
echo "Generator: $GEN"
echo "========================================="

# Configure CMake (once)
cd "$JUCE_ENGINE"
echo "Configuring CMake..."
cmake -B "$BUILD_DIR" -G "$GEN" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER="$CC" \
  -DCMAKE_CXX_COMPILER="$CXX" \
  || { echo "ERROR: CMake configure failed"; exit 1; }

# Initialize summary
echo "# VST3 Build Summary" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "**Date**: $(date -I)" >> "$SUMMARY"
echo "**Toolchain**: $CC/$CXX" >> "$SUMMARY"
echo "" >> "$SUMMARY"
echo "| Plugin | Target | Status | Artifact | Notes |" >> "$SUMMARY"
echo "|--------|--------|--------|----------|-------|" >> "$SUMMARY"

# Helper: find VST3 output
find_vst3() {
  local vst3name="$1"
  local hit
  hit="$(find "$BUILD_DIR" -type d -name "$vst3name" -print -quit 2>/dev/null || true)"
  if [[ -n "$hit" ]]; then
    echo "$hit"
    return 0
  fi
  return 1
}

# Process each plugin
jq -c '.[] | select(.status != "skip")' "$INV" | while read -r item; do
  name="$(jq -r '.name' <<<"$item")"
  target="$(jq -r '.cmakeTarget' <<<"$item")"
  vst3name="$(jq -r '.expectedVst3Name' <<<"$item")"
  status="$(jq -r '.status' <<<"$item")"

  log="$LOG_DIR/${name}.log"
  echo "" | tee -a "$log"
  echo "=========================================" | tee -a "$log"
  echo "Building: $name ($target)" | tee -a "$log"
  echo "Status: $status" | tee -a "$log"
  echo "=========================================" | tee -a "$log"

  # Build
  set +e
  cmake --build "$BUILD_DIR" --target "$target" -j >>"$log" 2>&1
  rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "| $name | $target | ❌ FAIL |  | See $log |" >> "$SUMMARY"
    echo "ERROR: Build failed for $name" | tee -a "$log"
    continue
  fi

  # Find VST3
  if ! artifact_path="$(find_vst3 "$vst3name")"; then
    echo "| $name | $target | ⚠️  BUILT |  | VST3 not found under $BUILD_DIR |" >> "$SUMMARY"
    echo "WARNING: VST3 not found for $name" | tee -a "$log"
    continue
  fi

  # Copy to output
  dest="$OUT_DIR/$vst3name"
  rm -rf "$dest"
  cp -a "$artifact_path" "$dest"

  echo "| $name | $target | ✅ OK | $dest |  |" >> "$SUMMARY"
  echo "SUCCESS: $name → $dest" | tee -a "$log"
done

echo ""
echo "========================================="
echo "Build complete!"
echo "Summary: $SUMMARY"
echo "Logs: $LOG_DIR/"
echo "Output: $OUT_DIR/"
echo "========================================="
```

**Make executable**:
```bash
chmod +x /home/mm/map2-audio/scripts/build_vst3_all.sh
```

**Verify**:
```bash
bash -n /home/mm/map2-audio/scripts/build_vst3_all.sh  # Syntax check
```

**Update STATE.md**:
```markdown
## Current State
- Created build_vst3_all.sh automation script
- Script builds all plugins in plugins.json
- Writes summary to build-notes/08-build-summary.md

## Next Step
- Test script on existing plugins (WDFAmpPlugin, Peavey5150Plugin)
```

---

### Step 6.3 — Test Automation Script

**Action**:
```bash
cd /home/mm/map2-audio
./scripts/build_vst3_all.sh clang
```

**Verify**:
```bash
cat build-notes/08-build-summary.md
ls -lah VSTs-MAP2/
```

**Expected**:
- Summary shows ✅ for WDFAmpPlugin and Peavey5150Plugin
- VSTs-MAP2/ contains both .vst3 directories

**Update STATE.md**:
```markdown
## Current State
- Tested build automation script
- Successfully built existing plugins via automation

## Phase 3 Status
🔄 IN PROGRESS - Automation proven, need to add remaining processors

## Next Step
- Complete plugins.json with all 19 processors
- Create plugin wrappers for remaining processors (can be scripted)
```

---

## Stage 7 — Scale to All Processors

**NOTE**: This stage would involve:
1. Adding all 19 processors to `plugins.json` with unique plugin codes
2. Creating a script to generate plugin wrapper directories
3. Running `build_vst3_all.sh` for all

**This is mechanical work**. The pattern is established. An AI can:
- Loop through processors
- Copy Peavey5150Plugin template
- Update names/codes
- Build each

---

## Failure Handling Rules

### When a Build Fails

1. **Capture error**:
   ```bash
   tail -50 build-logs/<Plugin>.log
   ```

2. **Identify root cause**:
   - Missing include: Check processor class location
   - Link error: Missing JUCE module
   - API mismatch: Processor class API doesn't match wrapper expectations

3. **Apply minimal fix**:
   - Don't refactor unrelated code
   - Fix only the blocker

4. **Document**:
   ```markdown
   ## Failure: <PluginName>
   **Error**: <brief description>
   **Root cause**: <analysis>
   **Fix applied**: <what you changed>
   **Result**: <success or next blocker>
   ```

5. **Retry**:
   ```bash
   cmake --build build --target <Plugin> -j
   ```

6. **Update plugins.json**:
   ```json
   {
     "name": "FailedPlugin",
     "status": "blocked",
     "notes": "Missing dependency XYZ"
   }
   ```

---

## Validation (Optional - Stage 8)

### If pluginval is Available

```bash
# Download pluginval (Linux)
wget https://github.com/Tracktion/pluginval/releases/download/latest_release/pluginval_Linux.zip
unzip pluginval_Linux.zip
chmod +x pluginval

# Validate all VST3s
for vst3 in VSTs-MAP2/*.vst3; do
  echo "Validating $vst3..."
  ./pluginval --validate-in-process --verbose --vst3 "$vst3" \
    2>&1 | tee "build-logs/$(basename "$vst3" .vst3)-validation.log"
done
```

### Manual Load Test

1. Install a VST3 host (e.g., Reaper, Ardour, Carla)
2. Point host to `VSTs-MAP2/`
3. Load each plugin
4. Test basic parameter changes
5. Verify no crashes

---

## Deliverables Checklist

When complete, you should have:

- [ ] `VSTs-MAP2/` folder with 19+ .vst3 plugins
- [ ] `build-notes/00-environment.md`
- [ ] `build-notes/01-processor-inventory.md`
- [ ] `build-notes/02-wdfamp-analysis.md`
- [ ] `build-notes/03-build-strategy.md`
- [ ] `build-notes/04-output-layout.md`
- [ ] `build-notes/05-pilot-build-log.txt`
- [ ] `build-notes/07-peavey5150-build-log.txt`
- [ ] `build-notes/08-build-summary.md`
- [ ] `build-notes/plugins.json`
- [ ] `build-notes/STATE.md` (always current)
- [ ] `scripts/build_vst3_all.sh`
- [ ] `build-logs/` with per-plugin logs
- [ ] (Optional) Validation logs

---

## Continuance Notes for Future AIs

### If Picking Up Mid-Stream

1. **Read `build-notes/STATE.md` first** - it tells you exactly where we are

2. **Check plugins.json** - see which plugins are done/todo/blocked

3. **Review build-notes/** - understand decisions made

4. **Run status check**:
   ```bash
   ls -lah VSTs-MAP2/
   jq '.[] | select(.status == "todo")' build-notes/plugins.json
   ```

5. **Resume next step** from STATE.md

### Common Recovery Scenarios

**Scenario**: Build directory corrupted
```bash
cd /home/mm/map2-audio/juce-engine
rm -rf build
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=clang++
```

**Scenario**: Lost which plugins are built
```bash
ls VSTs-MAP2/*.vst3 | sed 's|VSTs-MAP2/||; s|\.vst3||'
# Update plugins.json status to match
```

**Scenario**: CMake cache issues
```bash
rm -rf juce-engine/build/CMakeCache.txt
cmake -B juce-engine/build ...
```

---

## References

- JUCE CMake API: https://github.com/juce-framework/JUCE/blob/master/docs/CMake%20API.md
- VST3 SDK: https://github.com/steinbergmedia/vst3sdk
- pluginval: https://github.com/Tracktion/pluginval
- MAP2 Audio Engine: `juce-engine/Source/`

---

**Document Version**: 1.0
**Last Updated**: 2026-02-17
**Compatible with**: MAP2 Audio Platform (JUCE 8.0.0, CMake 3.22+, Linux)

