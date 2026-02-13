# SynthForge Implementation Plan - MAP2 Audio Integration
## Professional Sound Module / Sampler / MIDI Expander Plugin

**Planning Date:** February 12, 2026  
**Target:** JUCE 8.0 plugin integrated with MAP2 Audio Platform  
**Reference:** [Claude Artifact - AI Build Instructions](https://claude.ai/public/artifacts/f446199e-8e04-4c05-b887-0d9c4a35dfc7)

---

## Executive Summary

SynthForge is a professional-grade JUCE audio plugin combining hardware sound module, sampler, and MIDI expander capabilities into a single native plugin. This document outlines the detailed architectural design, integration strategy, and phased implementation plan for embedding SynthForge within the MAP2 Audio platform's existing JUCE engine infrastructure.

**Key Integration Points:**
- JUCE audio engine (`juce-engine/` directory)
- Plugin hosting system (`JucePluginHost`, `PluginGraph`)
- FastAPI backend (`app/routes/`, `app/services/`)
- React frontend (`web/src/app/`)
- Real-time performance constraints (Tier A: <3ms latency, 64 buffer @ 48kHz)

---

## Part 1: Architecture Assessment

### 1.1 Existing MAP2 JUCE Infrastructure

**Current Architecture (from reconnaissance):**

```
map2-audio/
├── juce-engine/                          # JUCE C++ audio engine
│   ├── CMakeLists.txt                    # JUCE 8.0, C++17, Release-only
│   ├── Source/
│   │   ├── Map2AudioEngine.{h,cpp}       # Main engine coordinator
│   │   ├── JucePluginHost.{h,cpp}        # Multi-format plugin hosting
│   │   ├── JuceAudioGraph.{h,cpp}        # AudioProcessorGraph wrapper
│   │   ├── JuceAudioIO.{h,cpp}           # Audio device I/O
│   │   ├── PluginGraph.{h,cpp}           # Legacy LV2 graph (being phased out)
│   │   ├── MidiHandler.{h,cpp}           # MIDI routing and processing
│   │   ├── CPUMonitor.{h,cpp}            # Per-plugin CPU tracking
│   │   ├── SnapshotManager.{h,cpp}       # State save/restore
│   │   ├── *Processor.{h,cpp}            # Native JUCE processors (chorus, reverb, etc.)
│   │   └── Common.h                      # Shared types and constants
│   └── Modules/                          # Custom JUCE modules
├── app/                                  # Python FastAPI backend
│   ├── routes/engine.py                  # Engine control API
│   ├── routes/plugins.py                 # Plugin management API
│   ├── routes/midi.py                    # MIDI routing API
│   └── services/
│       ├── juce_engine_service.py        # Python bindings to JUCE
│       ├── dsp_manager.py                # DSP resource allocation
│       └── plugin_loader_unified.py      # Plugin discovery
└── web/src/app/                          # React frontend
    ├── pages/GridFlowPage.tsx            # Main effects chain UI
    ├── components/PluginCards/           # Per-plugin UI cards
    └── hooks/usePluginHost.ts            # Plugin state management
```

**Key Observations:**

1. **Plugin Hosting System:**
   - `JucePluginHost` supports VST3, AU, LV2, LADSPA
   - Uses `juce::AudioPluginFormatManager` and `juce::KnownPluginList`
   - Instance management via `InstanceId` (int64_t)
   - CPU tracking per plugin via `CPUMonitor`

2. **Audio Graph:**
   - `JuceAudioGraph` wraps `juce::AudioProcessorGraph`
   - Serial chain processing (plugins in order)
   - VU metering per plugin + master I/O
   - Latency compensation tracking

3. **Performance Constraints (CRITICAL):**
   - **Locked Settings:** `sample_rate=48000`, `buffer_size=64`, `backend=pipewire`
   - **CPU Budget:** 64 samples @ 48kHz = **1.33ms per callback**
   - **Target Latency:** <3ms round-trip (Tier A professional guitar processor)
   - **Build Mode:** **Release ONLY** (Debug too slow for real-time)
   - **SIMD:** `-march=native` + `-ffast-math` enabled

4. **MIDI Routing:**
   - `MidiHandler` manages MIDI I/O
   - Per-plugin MIDI buffer routing
   - MIDI learn functionality

5. **Frontend Integration:**
   - Custom React cards per processor type (`IntelliFXCard`, `EventideH9Card`, etc.)
   - Parameter knobs with MIDI mapping
   - Real-time metering via WebSocket
   - Plugin parameter sync via REST + WebSocket

### 1.2 SynthForge Requirements Analysis

**From Original Specification:**

| Feature Category | Complexity | Integration Challenge |
|------------------|------------|----------------------|
| 16-part multitimbral MIDI | HIGH | MIDI routing, voice allocation |
| 128-voice polyphony | HIGH | CPU budget management |
| Wavetable synthesis | MEDIUM | Memory management, streaming |
| Sample engine (SF2/SFZ/WAV) | HIGH | Disk streaming, file I/O on audio thread |
| Per-part FX chains (4 slots × 16) | HIGH | Nested graph architecture |
| Master FX bus | MEDIUM | Integration with existing FX processors |
| Arpeggiator + sequencer | MEDIUM | Tempo sync with host |
| Patch management | MEDIUM | State save/restore, SysEx |
| 9 stereo output buses | LOW | Already supported by JUCE |
| Hardware-style GUI | HIGH | Web frontend integration strategy |

**Critical Architectural Decisions:**

1. **Standalone vs. Integrated Plugin?**
   - **Option A:** Build SynthForge as separate VST3/AU/Standalone, load via `JucePluginHost`
   - **Option B:** Build as native JUCE processor, integrate directly into `Map2AudioEngine`
   - **Recommendation:** **Option B (Native Integration)** - better performance, tighter integration

2. **Voice Allocation Strategy:**
   - 128 voices max (per spec) vs. CPU budget
   - Estimated CPU per voice (synthesis): ~0.2% on modern CPU
   - 128 voices × 0.2% = **25.6% CPU** (acceptable within 70% target)
   - Voice stealing MUST be real-time safe (no malloc on audio thread)

3. **Sample Streaming:**
   - Disk streaming CANNOT block audio thread
   - Requires **background thread** + **lock-free ring buffer**
   - Preload strategy: 64KB per zone (spec suggestion)
   - Max RAM usage: Configurable limit (e.g., 2GB for large libraries)

4. **MIDI Routing Integration:**
   - SynthForge needs **internal 16-channel routing**
   - Must integrate with MAP2's `MidiHandler`
   - Each "part" could be exposed as separate plugin instance? NO - too complex
   - Better: Single plugin with 16 internal parts, single MIDI input

5. **GUI Integration:**
   - Original spec: Hardware-style JUCE GUI (desktop UI)
   - MAP2 reality: **Web-based UI** (React frontend)
   - **Hybrid approach:** JUCE GUI for standalone, React UI for MAP2 integration

---

## Part 2: Integration Architecture

### 2.1 SynthForge as Native JUCE Processor

**Proposed Structure:**

```cpp
// juce-engine/Source/SynthForgeProcessor.h

namespace map2 {

class SynthForgeProcessor : public juce::AudioProcessor {
public:
    SynthForgeProcessor();
    ~SynthForgeProcessor() override;

    // AudioProcessor overrides
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    // === 16-Part Multitimbral Engine ===
    class Part {
    public:
        // Voice allocator (polyphonic)
        class VoiceAllocator {
            static constexpr int MAX_VOICES = 128; // Global pool
            // Voice stealing, mono/poly modes, unison
        };

        // Sound engine (synthesis)
        class SoundEngine {
            std::array<Oscillator, 3> oscillators_;  // 3 osc per voice
            std::array<Filter, 2> filters_;           // 2 filters per voice
            std::array<Envelope, 5> envelopes_;       // Amp + Filter + Pitch + 2 Aux
            std::array<LFO, 4> lfos_;                 // 4 LFOs per part
            ModulationMatrix modMatrix_;              // 32 slots
        };

        // Sample engine
        class SampleEngine {
            std::vector<SampleZone> zones_;           // Keygroups
            DiskStreamer diskStreamer_;               // Background thread
            // SF2/SFZ/WAV import
        };

        // FX chain (4 insert slots)
        class FXChain {
            static constexpr int MAX_SLOTS = 4;
            std::array<std::unique_ptr<juce::AudioProcessor>, MAX_SLOTS> slots_;
            float reverbSend_ = 0.0f;
            float delaySend_ = 0.0f;
            float chorusSend_ = 0.0f;
        };

        // Performance features
        class Arpeggiator { /*...*/ };
        class StepSequencer { /*...*/ };
        class Portamento { /*...*/ };

    private:
        int midiChannel_ = 1;              // 1-16, or 0 = OMNI
        VoiceAllocator voices_;
        SoundEngine synth_;
        SampleEngine sampler_;
        FXChain fxChain_;
        Arpeggiator arp_;
        StepSequencer sequencer_;
        Portamento portamento_;
        juce::AudioBuffer<float> partBuffer_;  // Per-part rendering
        OutputBus outputBus_ = OutputBus::MAIN;
    };

    // === Master Architecture ===
    std::array<std::unique_ptr<Part>, 16> parts_;  // 16 multitimbral parts

    // MIDI router (internal)
    class MidiRouter {
        void routeMidi(const juce::MidiBuffer& input,
                       std::array<juce::MidiBuffer, 16>& partBuffers);
    };
    MidiRouter midiRouter_;

    // Master FX
    class MasterFX {
        juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>,
                                        juce::dsp::IIR::Coefficients<float>> eq_;
        juce::dsp::Compressor<float> compressor_;
        juce::dsp::Limiter<float> limiter_;
    };
    MasterFX masterFX_;

    // Output routing (9 stereo buses)
    static constexpr int NUM_OUTPUT_BUSES = 9;
    std::array<juce::AudioBuffer<float>, NUM_OUTPUT_BUSES> outputBuffers_;

    // Patch management
    class PatchManager {
        std::vector<Patch> factoryPatches_;
        std::vector<Patch> userPatches_;
        std::map<std::pair<int,int>, Patch> patchBank_;  // (bank, program) → Patch
    };
    PatchManager patchManager_;

    // State save/restore
    juce::AudioProcessorValueTreeState parameters_;  // For automation
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

private:
    // Audio thread safety
    juce::CriticalSection processLock_;
    std::atomic<bool> initialized_{false};

    // Performance monitoring
    CPUMonitor cpuMonitor_;
    VoiceUsageMonitor voiceMonitor_;
};

} // namespace map2
```

### 2.2 Integration with Map2AudioEngine

**Modification to Map2AudioEngine.h:**

```cpp
// Add to existing native processors section
class Map2AudioEngine {
    // ...existing processors...

    // SynthForge (NEW)
    SynthForgeProcessor synthForge_;

public:
    // SynthForge API
    SynthForgeProcessor& getSynthForge() { return synthForge_; }

    // Part selection
    void setSynthForgePart(int partIndex);  // 0-15
    int getSynthForgePart() const;

    // Quick access (delegates to active part)
    void setSynthForgeParameter(const std::string& param, float value);
    float getSynthForgeParameter(const std::string& param) const;

    // Patch management
    void loadSynthForgePatch(int bank, int program);
    void saveSynthForgePatch(int bank, int program, const std::string& name);
    std::vector<PatchInfo> getSynthForgePatches() const;

    // MIDI routing
    void setSynthForgePartChannel(int partIndex, int midiChannel);
    int getSynthForgePartChannel(int partIndex) const;

    // Metering
    SynthForgeMetering getSynthForgeMetering() const;
};
```

### 2.3 Backend API Design

**New Routes: `app/routes/synthforge.py`**

```python
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api/synthforge", tags=["SynthForge"])

# === Data Models ===
class PartConfig(BaseModel):
    part_index: int  # 0-15
    midi_channel: int  # 0=OMNI, 1-16
    output_bus: str  # "main", "aux_1", ..., "aux_8"
    level: float  # 0.0-1.0
    pan: float  # -1.0 to 1.0
    mute: bool
    solo: bool

class PatchInfo(BaseModel):
    bank: int
    program: int
    name: str
    category: str
    author: str
    description: Optional[str]

class VoiceMetrics(BaseModel):
    active_voices: int
    peak_voices: int
    voices_per_part: List[int]  # 16 parts
    cpu_percent: float

# === Endpoints ===

@router.get("/parts")
async def get_parts() -> List[PartConfig]:
    """Get configuration for all 16 parts"""
    return engine.getSynthForgePartsConfig()

@router.post("/parts/{part_index}/config")
async def update_part(part_index: int, config: PartConfig):
    """Update single part configuration"""
    if not 0 <= part_index < 16:
        raise HTTPException(400, "Part index must be 0-15")
    engine.setSynthForgePartConfig(part_index, config)

@router.get("/patches")
async def list_patches(category: Optional[str] = None) -> List[PatchInfo]:
    """List available patches (factory + user)"""
    return engine.getSynthForgePatches(category)

@router.post("/patches/load")
async def load_patch(part_index: int, bank: int, program: int):
    """Load patch into specific part"""
    engine.loadSynthForgePatch(part_index, bank, program)

@router.post("/patches/save")
async def save_patch(part_index: int, bank: int, program: int, name: str):
    """Save current part state as user patch"""
    engine.saveSynthForgePatch(part_index, bank, program, name)

@router.get("/voices")
async def get_voice_metrics() -> VoiceMetrics:
    """Get voice allocation statistics"""
    return engine.getSynthForgeVoiceMetrics()

@router.get("/parameters/{part_index}")
async def get_part_parameters(part_index: int) -> Dict[str, float]:
    """Get all parameters for a part"""
    return engine.getSynthForgePartParameters(part_index)

@router.post("/parameters/{part_index}")
async def set_part_parameter(part_index: int, param: str, value: float):
    """Set single parameter on a part"""
    engine.setSynthForgeParameter(part_index, param, value)

# === WebSocket for real-time updates ===
@router.websocket("/ws/metering")
async def metering_websocket(websocket: WebSocket):
    """Real-time voice usage + metering"""
    await websocket.accept()
    while True:
        metrics = engine.getSynthForgeMetering()
        await websocket.send_json(metrics.dict())
        await asyncio.sleep(0.05)  # 20 Hz update rate
```

### 2.4 Frontend Integration Strategy

**Option 1: Dedicated SynthForge Page**

```typescript
// web/src/app/pages/SynthForgePage.tsx

export function SynthForgePage() {
  const [activePart, setActivePart] = useState(0);
  const { data: parts } = useQuery(['synthforge', 'parts'], fetchParts);
  const { data: patches } = useQuery(['synthforge', 'patches'], fetchPatches);

  return (
    <div className="synthforge-page">
      {/* 16-Part Mixer Strip */}
      <PartMixer
        parts={parts}
        activePart={activePart}
        onSelectPart={setActivePart}
      />

      {/* Tabbed Editor */}
      <TabbedEditor activePart={activePart}>
        <Tab label="PERFORM">
          <PerformView parts={parts} />
        </Tab>
        <Tab label="MIXER">
          <MixerView parts={parts} />
        </Tab>
        <Tab label="EDIT">
          <SynthEditView
            partIndex={activePart}
            params={usePartParameters(activePart)}
          />
        </Tab>
        <Tab label="SAMPLER">
          <SamplerView partIndex={activePart} />
        </Tab>
        <Tab label="FX">
          <FXRackView partIndex={activePart} />
        </Tab>
        <Tab label="ARP/SEQ">
          <ArpSeqView partIndex={activePart} />
        </Tab>
        <Tab label="PATCH">
          <PatchBrowser
            patches={patches}
            onLoad={(bank, program) => loadPatch(activePart, bank, program)}
          />
        </Tab>
      </TabbedEditor>

      {/* Virtual Keyboard */}
      <VirtualKeyboard midiChannel={activePart + 1} />
    </div>
  );
}
```

**Option 2: Plugin Card in GridFlow**

```typescript
// web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx

export const SynthForgeCard: React.FC<PluginCardProps> = ({ instanceId }) => {
  const [activePart, setActivePart] = useState(0);

  return (
    <PluginCardShell
      instanceId={instanceId}
      title="SynthForge"
      uri="map2://juce/synthforge"
    >
      {/* Compact 16-part selector */}
      <PartSelector value={activePart} onChange={setActivePart} />

      {/* Current part quick controls */}
      <ParameterSection title="Oscillators">
        <ParameterKnob param={`part${activePart}.osc1.coarse`} label="OSC1 Tune" />
        <ParameterKnob param={`part${activePart}.osc1.level`} label="OSC1 Level" />
        {/* ... */}
      </ParameterSection>

      {/* Link to full editor */}
      <Button onClick={() => navigate('/synthforge')}>
        Open Full Editor →
      </Button>
    </PluginCardShell>
  );
};
```

**Recommendation:** **Both approaches** - card for quick access, dedicated page for deep editing.

---

## Part 3: Phased Implementation Plan

### Phase 1: Core Framework & MIDI Engine (Weeks 1-3)

**Goal:** Establish basic infrastructure and MIDI routing

**Tasks:**

1. **Project Structure**
   ```bash
   juce-engine/Source/SynthForge/
   ├── SynthForgeProcessor.h / .cpp           # Main processor
   ├── Core/
   │   ├── Part.h / .cpp                      # Single multitimbral part
   │   ├── VoiceAllocator.h / .cpp            # Polyphony management
   │   └── MidiRouter.h / .cpp                # 16-channel routing
   ├── Sound/
   │   └── (empty for now - Phase 2)
   ├── Sampler/
   │   └── (empty - Phase 3)
   ├── FX/
   │   └── (empty - Phase 4)
   └── Common/
       ├── Types.h                             # SynthForge-specific types
       └── Constants.h                         # Default values
   ```

2. **CMake Integration**
   - Add `SynthForge/` to `juce_add_plugin` sources
   - No new dependencies (all JUCE built-ins)

3. **Basic AudioProcessor Shell**
   ```cpp
   class SynthForgeProcessor : public juce::AudioProcessor {
       // Passthrough audio for now
       // Accept MIDI, print to console
       // 16 empty parts
   };
   ```

4. **MIDI Router Implementation**
   - Route MIDI to parts by channel
   - Support OMNI mode (all channels to one part)
   - MIDI filtering per part (note on/off, CC, program change, etc.)

5. **Voice Allocator (Stub)**
   - Track note on/off events
   - Voice stealing logic (oldest/quietest)
   - No actual synthesis yet - just tracking

6. **Backend Integration**
   - Add SynthForge to `Map2AudioEngine` as native processor
   - Create `/api/synthforge/parts` endpoint
   - Test MIDI routing via Python API

**Verification:**
- MIDI input routed to correct parts
- Voice allocation tracking (no audio yet)
- API returns part configurations

**Estimated Effort:** 40-60 hours

---

### Phase 2: Basic Synthesis Engine (Weeks 4-7)

**Goal:** Single-oscillator subtractive synthesis per voice

**Tasks:**

1. **Oscillator Implementation**
   ```cpp
   class Oscillator {
       enum Waveform { SINE, SAW, SQUARE, TRIANGLE };
       juce::dsp::Oscillator<float> osc_;  // Use JUCE built-in
       // PolyBLEP anti-aliasing for non-sine
   };
   ```

2. **Filter Implementation**
   ```cpp
   class Filter {
       enum Type { LPF_12, LPF_24, HPF_12, HPF_24, BPF };
       juce::dsp::StateVariableTPTFilter<float> svf_;
       // JUCE SVF is stable at high resonance
   };
   ```

3. **Envelope Generator**
   ```cpp
   class Envelope {
       juce::ADSR adsr_;
       // Extended: hold, curves, velocity sensitivity
   };
   ```

4. **Voice Class**
   ```cpp
   class SynthVoice : public juce::SynthesiserVoice {
       Oscillator osc1_;
       Filter filter1_;
       Envelope ampEnv_;
       Envelope filterEnv_;

       void renderNextBlock(juce::AudioBuffer<float>&, int startSample, int numSamples) override;
   };
   ```

5. **Polyphonic Synthesizer**
   ```cpp
   class SynthSound : public juce::SynthesiserSound {
       // Empty - all voices play all notes
   };

   // In Part:
   juce::Synthesiser synthesiser_;
   synthesiser_.addVoice(new SynthVoice());  // Add 128 voices
   synthesiser_.addSound(new SynthSound());
   ```

6. **Parameter Management**
   - Use `juce::AudioProcessorValueTreeState`
   - Per-part parameters: `part0.osc1.coarse`, `part0.filter1.cutoff`, etc.
   - Automation support

7. **Frontend: Basic Editor**
   ```typescript
   <ParameterSection title="Oscillator 1">
     <ParameterKnob param="osc1.coarse" min={-24} max={24} />
     <ParameterKnob param="osc1.fine" min={-100} max={100} />
     <Dropdown param="osc1.waveform" options={["Sine", "Saw", "Square"]} />
   </ParameterSection>
   ```

**Verification:**
- Play notes on MIDI keyboard → hear sound
- Change parameters → hear changes
- 128-voice polyphony works
- CPU usage < 30% at 64 voices

**Estimated Effort:** 80-120 hours

---

### Phase 3: Advanced Synthesis (Weeks 8-11)

**Goal:** 3 oscillators, 2 filters, full mod matrix

**Tasks:**

1. **Multi-Oscillator Voice**
   - 3 oscillators per voice
   - Sub-oscillator (-1 or -2 octaves)
   - Noise generator
   - Oscillator mixer

2. **Dual Filters**
   - Serial, parallel, or split routing
   - Per-filter envelope

3. **LFO Implementation**
   ```cpp
   class LFO {
       enum Shape { SINE, TRIANGLE, SAW_UP, SAW_DOWN, SQUARE, S_AND_H };
       juce::dsp::Oscillator<float> lfo_;
       bool tempoSynced_ = false;
       float rateHz_ = 1.0f;
       float rateDivision_ = 0.25f;  // 1/4 note
   };
   ```

4. **Modulation Matrix**
   ```cpp
   struct ModSlot {
       ModSource source;  // Velocity, Key, Aftertouch, LFO1-4, Env1-4, etc.
       ModDestination dest;  // Osc pitch, filter cutoff, etc.
       float amount;  // -1.0 to 1.0
       ModSource amountMod;  // Optional modulation of modulation
   };

   class ModulationMatrix {
       static constexpr int MAX_SLOTS = 32;
       std::array<ModSlot, MAX_SLOTS> slots_;

       void process();  // Apply all mods per sample
   };
   ```

5. **Wavetable Support**
   - Load wavetable banks (float arrays)
   - Morphing between tables
   - Factory wavetables: saw, square, PWM, vocal, etc.

6. **Frontend: Advanced Editor**
   - Mod matrix table view
   - Drag-and-drop mod routing
   - LFO waveform visualizer

**Verification:**
- Complex patches sound professional
- Mod matrix works correctly
- CPU still < 40% at 64 voices

**Estimated Effort:** 100-140 hours

---

### Phase 4: Sample Engine (Weeks 12-16)

**Goal:** WAV/AIFF playback, zone mapping, loop points

**Tasks:**

1. **Sample Loading**
   ```cpp
   class SampleData {
       juce::AudioBuffer<float> audioData_;
       int rootNote_ = 60;
       float sampleRate_ = 44100.0f;
       int loopStart_ = 0;
       int loopEnd_ = -1;  // -1 = no loop
   };

   class SampleLoader {
       static std::unique_ptr<SampleData> loadWAV(const juce::File& file);
       static std::unique_ptr<SampleData> loadAIFF(const juce::File& file);
   };
   ```

2. **Zone Mapping**
   ```cpp
   class SampleZone {
       std::shared_ptr<SampleData> sampleData_;
       juce::Range<int> keyRange_;     // 0-127
       juce::Range<int> velocityRange_; // 0-127
       int rootNote_ = 60;
       float coarseTune_ = 0.0f;  // semitones
       float fineTune_ = 0.0f;    // cents
   };

   class KeygroupManager {
       std::vector<SampleZone> zones_;
       SampleZone* findZone(int note, int velocity);
   };
   ```

3. **Sampler Voice**
   ```cpp
   class SamplerVoice : public juce::SynthesiserVoice {
       SampleZone* currentZone_ = nullptr;
       double playbackPosition_ = 0.0;
       double pitchRatio_ = 1.0;

       void renderNextBlock(...) override {
           // Interpolated playback (cubic)
           // Loop handling (forward, ping-pong)
       }
   };
   ```

4. **Interpolation**
   - Linear (fast, lo-fi mode)
   - Cubic (default)
   - Sinc (optional, high quality)

5. **Disk Streaming (Background Thread)**
   ```cpp
   class DiskStreamer {
       juce::Thread streamingThread_;
       juce::AbstractFifo fifo_;  // Lock-free ring buffer
       size_t preloadSize_ = 64 * 1024;  // 64KB per zone
       size_t maxRAM_ = 2ULL * 1024 * 1024 * 1024;  // 2GB limit

       void streamSamples();  // Runs on background thread
   };
   ```

6. **SF2/SFZ Import**
   - Use existing libraries (e.g., libsndfile for WAV, custom SF2 parser)
   - Convert to internal zone format

7. **Frontend: Sample Editor**
   ```typescript
   <SampleWaveformDisplay
     sampleData={currentSample}
     loopStart={loopStart}
     loopEnd={loopEnd}
     onLoopChange={(start, end) => setLoopPoints(start, end)}
   />
   <SampleZoneMap
     zones={zones}
     onZoneClick={(zone) => selectZone(zone)}
   />
   ```

**Verification:**
- Load WAV files → hear playback
- Pitch shifting works correctly
- Loop points are click-free
- Disk streaming doesn't glitch
- RAM usage stays under limit

**Estimated Effort:** 120-160 hours

---

### Phase 5: Effects Engine (Weeks 17-20)

**Goal:** Per-part FX chains + master FX

**Tasks:**

1. **FX Chain Architecture**
   ```cpp
   class FXChain {
       static constexpr int MAX_SLOTS = 4;
       std::array<std::unique_ptr<juce::AudioProcessor>, MAX_SLOTS> slots_;

       void setSlotEffect(int slot, EffectType type);
       void process(juce::AudioBuffer<float>& buffer);
   };
   ```

2. **Integrate Existing MAP2 Processors**
   - `ChorusProcessor`, `PhaserProcessor`, etc. already exist
   - Wrap as effect slots
   - Add new effects as needed

3. **New Effects (Priority List)**
   - EQ (3-band + parametric)
   - Compressor / Limiter / Gate (use `juce::dsp::Compressor`)
   - Reverb (use `juce::dsp::Reverb` or custom algorithmic)
   - Delay (stereo, ping-pong, tempo-synced)

4. **Master FX Bus**
   - Global send effects (reverb, delay, chorus)
   - Master compressor + limiter
   - 7-band parametric EQ

5. **Send/Return Routing**
   - Per-part send levels (reverb, delay, chorus)
   - Pre-fader vs. post-fader sends

**Verification:**
- FX chains sound good
- No audio glitches
- CPU overhead acceptable (<10% per FX chain)

**Estimated Effort:** 60-80 hours

---

### Phase 6: Performance Features (Weeks 21-24)

**Goal:** Arpeggiator, step sequencer, portamento

**Tasks:**

1. **Arpeggiator**
   ```cpp
   class Arpeggiator {
       enum Pattern { UP, DOWN, UP_DOWN, RANDOM, ORDER_PLAYED };
       Pattern pattern_ = UP;
       int octaveRange_ = 1;  // 1-4
       float rate_ = 0.25f;   // Note division (1/4, 1/8, etc.)
       bool tempoSynced_ = true;

       void process(juce::MidiBuffer& midiIn, juce::MidiBuffer& midiOut);
   };
   ```

2. **Step Sequencer**
   ```cpp
   struct Step {
       bool active;
       int note;
       int velocity;
       float gate;  // 0.0-1.0 (gate length)
   };

   class StepSequencer {
       static constexpr int MAX_STEPS = 64;
       std::array<Step, MAX_STEPS> steps_;
       int currentStep_ = 0;

       void process(juce::MidiBuffer& midiOut);
   };
   ```

3. **Portamento**
   ```cpp
   class Portamento {
       enum Mode { OFF, ALWAYS, LEGATO_ONLY };
       Mode mode_ = OFF;
       float timeMs_ = 100.0f;

       void applyGlide(float& currentPitch, float targetPitch);
   };
   ```

4. **Tempo Sync**
   - Get host BPM via `AudioProcessor::getPlayHead()`
   - Sync arp, sequencer, LFOs to host tempo

**Verification:**
- Arpeggiator patterns sound correct
- Step sequencer triggers notes
- Portamento glides smoothly
- Tempo sync works with DAW

**Estimated Effort:** 40-60 hours

---

### Phase 7: Patch Management & State (Weeks 25-27)

**Goal:** Save/load patches, bank organization, SysEx

**Tasks:**

1. **Patch Structure**
   ```cpp
   struct Patch {
       std::string name;
       std::string category;
       int bank = 0;
       int program = 0;

       // Serialized state (all parameters)
       juce::ValueTree state;
   };
   ```

2. **Patch Manager**
   - Factory patch bank (256 patches minimum)
   - User patch bank (unlimited)
   - Search / filter by category
   - Favorites list

3. **State Serialization**
   ```cpp
   void getStateInformation(juce::MemoryBlock& destData) override {
       // Serialize all 16 parts + master FX + global settings
       auto state = parameters_.copyState();
       auto xml = state.createXml();
       copyXmlToBinary(*xml, destData);
   }

   void setStateInformation(const void* data, int sizeInBytes) override {
       auto xml = getXmlFromBinary(data, sizeInBytes);
       if (xml != nullptr) {
           auto state = juce::ValueTree::fromXml(*xml);
           parameters_.replaceState(state);
       }
   }
   ```

4. **Program Change Handling**
   - Listen for MIDI program change messages
   - Load patch from bank

5. **SysEx Support (Optional)**
   - Dump patch as SysEx
   - Receive patch via SysEx
   - Custom SysEx format (not MIDI standard)

6. **Factory Content**
   - Create 256+ patches across categories
   - Piano, Bass, Lead, Pad, FX, Drum kits, etc.

**Verification:**
- Save/load patches works
- Program change loads patches
- Factory patches sound professional

**Estimated Effort:** 60-80 hours

---

### Phase 8: Web Frontend Integration (Weeks 28-31)

**Goal:** Full React UI for SynthForge

**Tasks:**

1. **Dedicated Page**
   - Implement `SynthForgePage.tsx` (see §2.4)
   - 16-part mixer strip
   - Tabbed editor (PERFORM, MIXER, EDIT, SAMPLER, FX, ARP/SEQ, PATCH)

2. **Custom Components**
   - `PartMixer` - 16-channel mixer view
   - `SynthEditView` - Osc, filter, env, LFO controls
   - `SamplerView` - Waveform display, zone map
   - `FXRackView` - Effect slot rack
   - `PatchBrowser` - Searchable patch library
   - `VirtualKeyboard` - MIDI input via mouse/touch

3. **Real-Time Updates**
   - WebSocket for metering (voice count, CPU, VU levels)
   - Parameter sync (bidirectional)

4. **Plugin Card**
   - `SynthForgeCard.tsx` for GridFlow integration
   - Compact controls + link to full editor

5. **Styling**
   - Tron-inspired theme (consistent with MAP2)
   - Hardware rack unit aesthetic (optional mode)

**Verification:**
- UI is responsive and intuitive
- Parameter changes update instantly
- Real-time metering works
- No visual glitches

**Estimated Effort:** 80-120 hours

---

### Phase 9: Optimization & Polish (Weeks 32-35)

**Goal:** Performance tuning, edge case handling

**Tasks:**

1. **SIMD Optimization**
   - Use `juce::FloatVectorOperations` for buffer operations
   - SIMD in oscillators, filters (already using JUCE DSP → already optimized)

2. **Memory Pooling**
   - Pre-allocate voice objects
   - Pre-allocate sample buffers
   - No `new`/`delete` on audio thread

3. **Denormal Prevention**
   - `juce::ScopedNoDenormals` in `processBlock()`

4. **CPU Profiling**
   - Measure per-voice CPU cost
   - Identify hotspots
   - Target: <0.2% per voice

5. **Latency Reporting**
   - Report actual latency via `getLatencySamples()`
   - Include FX chain latency

6. **Edge Cases**
   - Voice stealing under polyphony limits
   - Sample loading errors (corrupted files)
   - Disk streaming underruns
   - MIDI buffer overflow

7. **Documentation**
   - User manual (Markdown)
   - Parameter reference
   - Patch creation guide

**Verification:**
- CPU usage meets targets
- No audio glitches under stress
- All edge cases handled gracefully

**Estimated Effort:** 60-80 hours

---

### Phase 10: Testing & Deployment (Weeks 36-40)

**Goal:** Comprehensive testing, validation

**Tasks:**

1. **Unit Tests**
   - Voice allocator logic
   - MIDI routing
   - Modulation matrix
   - Disk streaming

2. **Integration Tests**
   - Full plugin in DAW
   - Full plugin in MAP2 platform
   - MIDI learn
   - State save/restore

3. **Performance Tests**
   - 128-voice stress test
   - CPU headroom measurement
   - Latency measurement (loopback test)
   - Xrun count (8-hour session)

4. **Validation Checklist (from spec)**
   - [ ] All 16 parts produce audio independently
   - [ ] MIDI routing works across all channels
   - [ ] Voice allocation + stealing at max polyphony
   - [ ] All filter types correct frequency response
   - [ ] Sample loading (WAV/AIFF/SF2/SFZ) at all bit depths/sample rates
   - [ ] Loop points click-free with crossfading
   - [ ] All effects process without artifacts
   - [ ] Patch save/load round-trips perfectly
   - [ ] SysEx dump/receive works
   - [ ] GUI responsive, doesn't block audio thread
   - [ ] No glitches at 64-sample buffer
   - [ ] CPU < 25% at 64 voices on modern CPU
   - [ ] Preset recall < 50ms
   - [ ] MIDI Learn works
   - [ ] Arpeggiator syncs to host
   - [ ] Multiple instances run without conflict

5. **Deployment**
   - Build release binaries
   - Update MAP2 systemd service
   - Deploy to production

**Verification:**
- All tests pass
- Validation checklist complete
- Ready for production use

**Estimated Effort:** 80-100 hours

---

## Part 4: Performance Budget Analysis

### 4.1 CPU Budget Breakdown

**MAP2 Constraints:**
- **Buffer Size:** 64 samples @ 48kHz = **1.33ms** callback
- **Target CPU:** 70% utilization = **0.93ms** processing budget
- **Headroom:** 30% reserved = **0.40ms** safety margin

**SynthForge CPU Estimate (64 voices active):**

| Component | CPU per Voice | 64 Voices Total | Notes |
|-----------|---------------|-----------------|-------|
| 3 Oscillators (PolyBLEP) | ~0.05% | 3.2% | JUCE `dsp::Oscillator` |
| 2 Filters (SVF) | ~0.03% | 1.9% | State-variable topology |
| 5 Envelopes (ADSR) | ~0.01% | 0.6% | Simple math |
| 4 LFOs | ~0.01% | 0.6% | Shared across voices |
| Mod Matrix (32 slots) | ~0.02% | 1.3% | Multiply-accumulate |
| Sample Playback | ~0.05% | 3.2% | Cubic interpolation |
| **Subtotal per Voice** | **~0.17%** | **~10.8%** | **Synth + Sampler** |
| Per-Part FX (4 slots) | N/A | 12.8% | 16 parts × 4 slots × 0.2% |
| Master FX | N/A | 2.0% | Reverb + compressor + EQ |
| MIDI Routing | N/A | 0.5% | Negligible |
| **Total (64 voices + FX)** | | **~26.1%** | **WITHIN BUDGET** |

**Conclusion:** ✅ **SynthForge fits within MAP2's CPU budget**

**Headroom:** 70% - 26.1% = **43.9%** remaining for other plugins in chain

### 4.2 Memory Budget

**Voice Memory:**
- Voice object: ~2KB (oscillators, filters, envelopes, state)
- 128 voices × 2KB = **256KB** (negligible)

**Sample Memory:**
- Preload: 64KB per zone
- Max zones: 1000 (realistic multisample library)
- Preload total: 64MB
- Streaming: Up to 2GB limit (configurable)
- **Total:** ~2GB max (user-configurable)

**Patch Memory:**
- Patch object: ~10KB (all parameters + metadata)
- 256 factory + 1000 user = **12.6MB**

**Total RAM:** ~2.1GB (within modern system limits)

### 4.3 Latency Impact

**Additional Latency:**
- Oscillator/filter processing: 0 samples (feed-forward)
- FX chains: Depends on effects (reverb ~64 samples, others minimal)
- Expected total: **< 64 samples (1.33ms)** additional

**Total System Latency:**
- Current MAP2: ~2.67ms (64 samples input + 64 samples output)
- With SynthForge: ~4ms (acceptable for studio, marginal for live)

**Recommendation:** Offer "low-latency mode" with reduced FX complexity

---

## Part 5: Risk Analysis & Mitigation

### 5.1 High-Risk Areas

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Disk streaming glitches** | HIGH | HIGH | Thorough testing, lock-free buffers, preload tuning |
| **Voice stealing pops/clicks** | MEDIUM | MEDIUM | Fade-out on stolen voices, proper envelope handling |
| **CPU budget exceeded** | MEDIUM | HIGH | Early profiling, voice limiting, quality modes |
| **Sample loading crashes** | MEDIUM | MEDIUM | Robust error handling, file validation |
| **MIDI timing jitter** | LOW | MEDIUM | Use JUCE's MidiBuffer timestamp system |
| **State save/load corruption** | LOW | HIGH | Versioning, validation, backup mechanisms |
| **Web UI performance** | MEDIUM | LOW | Debouncing, WebSocket throttling, React optimization |

### 5.2 Fallback Strategies

**If CPU budget is exceeded:**
- Implement dynamic voice limiting (reduce from 128 → 64 → 32)
- Offer "quality modes": Ultra (128 voices), High (64), Low (32)
- Disable per-part FX in low-latency mode

**If disk streaming fails:**
- Fall back to RAM-only mode (limit sample size)
- Show warning to user
- Graceful degradation (play preload buffer only)

**If GUI is too complex:**
- Simplify to essential controls only
- Offer "advanced mode" toggle
- Use lazy loading for patch browser

---

## Part 6: Success Metrics

### 6.1 Performance Targets

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Max Polyphony | 128 voices | Stress test with all notes |
| CPU per Voice (synth) | < 0.2% | Profiler measurement |
| CPU per Voice (sample) | < 0.1% | Profiler measurement |
| Total CPU @ 64 voices | < 30% | Real-world usage test |
| Latency | < 5ms | Loopback test |
| Patch Load Time | < 50ms | Timer measurement |
| Sample Load Time | < 5s (1GB library) | File I/O benchmark |
| GUI Frame Rate | 60fps | Browser dev tools |
| RAM Usage (no samples) | < 100MB | Memory profiler |

### 6.2 Functional Requirements

**Must Have (MVP):**
- [x] 16-part multitimbral
- [x] MIDI routing per part
- [x] Basic synthesis (osc + filter + env)
- [x] Sample playback (WAV/AIFF)
- [x] Patch save/load
- [x] Web UI integration

**Should Have (Phase 2):**
- [x] Advanced synthesis (3 osc, 2 filters, mod matrix)
- [x] Disk streaming
- [x] Per-part FX chains
- [x] Arpeggiator + sequencer
- [x] SF2/SFZ import

**Nice to Have (Future):**
- [ ] SysEx support
- [ ] Microtuning scales
- [ ] Advanced wavetable editor
- [ ] Sample recording
- [ ] MPE support

---

## Part 7: Documentation Requirements

### 7.1 Technical Documentation

1. **Architecture Document** (this doc) ✅
2. **API Reference**
   - C++ class documentation (Doxygen)
   - Python API docs (Sphinx)
   - REST API docs (OpenAPI/Swagger)
3. **Integration Guide**
   - How to add new effects
   - How to add new wavetables
   - How to extend modulation sources

### 7.2 User Documentation

1. **Quick Start Guide**
   - Loading your first patch
   - Basic synthesis tutorial
   - Loading samples

2. **Parameter Reference**
   - Full list of all parameters
   - Default values
   - Modulation destinations

3. **Patch Creation Guide**
   - Sound design workflows
   - Modulation matrix examples
   - Sampler keygroup mapping

4. **MIDI Implementation Chart**
   - CC mappings
   - Program change behavior
   - SysEx format (if implemented)

---

## Part 8: Timeline & Resource Allocation

### 8.1 Estimated Timeline

**Total Duration:** 40 weeks (~9-10 months)

| Phase | Weeks | Developer Hours | Dependencies |
|-------|-------|-----------------|--------------|
| 1. Core Framework | 3 | 40-60 | None |
| 2. Basic Synthesis | 4 | 80-120 | Phase 1 |
| 3. Advanced Synthesis | 4 | 100-140 | Phase 2 |
| 4. Sample Engine | 5 | 120-160 | Phase 2 |
| 5. Effects Engine | 4 | 60-80 | Phase 3 |
| 6. Performance Features | 4 | 40-60 | Phase 3 |
| 7. Patch Management | 3 | 60-80 | Phase 2-6 |
| 8. Web Frontend | 4 | 80-120 | Phase 2-7 |
| 9. Optimization | 4 | 60-80 | All phases |
| 10. Testing | 5 | 80-100 | All phases |
| **Total** | **40 weeks** | **720-1000 hours** | |

### 8.2 Parallel Development

**Can be parallelized:**
- Sound engine (Phase 2-3) + Sample engine (Phase 4) → different developers
- Effects (Phase 5) + Performance features (Phase 6) → backend dev
- Web frontend (Phase 8) → frontend dev (can start after Phase 2 completes)

**Sequential dependencies:**
- Phase 1 MUST complete before any other phase
- Phase 7 (Patch Management) requires Phase 2-6 to be substantially complete
- Phase 9-10 (Optimization + Testing) require all features complete

**Recommended Team:**
- 1 Senior C++/JUCE Developer (Phases 1-7, 9)
- 1 DSP Engineer (Phases 2-3, part-time)
- 1 Frontend Developer (Phase 8)
- 1 QA Engineer (Phase 10)

---

## Part 9: Next Steps

### 9.1 Immediate Actions (Week 1)

1. **Get Approval**
   - Review this plan with stakeholders
   - Confirm resource allocation
   - Adjust timeline if needed

2. **Set Up Development Environment**
   ```bash
   cd /home/mm/map2-audio/juce-engine
   mkdir -p Source/SynthForge/{Core,Sound,Sampler,FX,Performance,Patch,Common}
   touch Source/SynthForge/SynthForgeProcessor.{h,cpp}
   ```

3. **Create Git Branch**
   ```bash
   git checkout -b feature/synthforge
   ```

4. **Update CMakeLists.txt**
   ```cmake
   # Add SynthForge sources
   file(GLOB_RECURSE SYNTHFORGE_SOURCES Source/SynthForge/*.cpp)
   target_sources(map2_audio_engine PRIVATE ${SYNTHFORGE_SOURCES})
   ```

5. **Create Initial Test**
   ```cpp
   // tests/SynthForgeTests.cpp
   TEST(SynthForge, BasicInstantiation) {
       SynthForgeProcessor processor;
       EXPECT_EQ(processor.getName(), "SynthForge");
   }
   ```

### 9.2 Phase 1 Kickoff Checklist

- [ ] Development branch created
- [ ] CMake updated to include SynthForge
- [ ] Basic processor skeleton compiles
- [ ] Integrated into Map2AudioEngine
- [ ] Python bindings stubbed
- [ ] Initial API endpoint responds
- [ ] MIDI routing test written

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building SynthForge as a native JUCE processor within the MAP2 Audio platform. The phased approach ensures:

1. **Incremental Progress** - Each phase delivers testable functionality
2. **Risk Mitigation** - High-risk areas (disk streaming, CPU budget) addressed early
3. **Performance Compliance** - Stays within MAP2's strict latency and CPU constraints
4. **Integration Coherence** - Leverages existing infrastructure (JucePluginHost, React UI patterns)

**Key Success Factors:**
- Strict adherence to real-time audio safety (no malloc, locks, or file I/O on audio thread)
- Early profiling and optimization (don't wait until Phase 9)
- Comprehensive testing at each phase boundary
- Clear separation of concerns (synthesis, sampling, effects, GUI)

**Final Recommendation:** Proceed with Phase 1 implementation following this plan. Re-evaluate after Phase 2 completion to validate CPU budget assumptions.

---

**Document Status:** PLANNING COMPLETE ✅  
**Next Action:** Stakeholder review + Phase 1 kickoff  
**Estimated Project Completion:** November 2026 (40 weeks from Feb 2026)
