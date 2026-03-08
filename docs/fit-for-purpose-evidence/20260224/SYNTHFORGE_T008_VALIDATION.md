# SynthForge T008 Runtime Validation (2026-02-24)

## Goal

Validate SynthForge note triggering, voice metrics, CPU, and xruns at Tier A settings:

- `sample_rate=48000`
- `buffer_size=64`

## Command

```bash
cd /home/mm/map2-audio
python3 - <<'PY'
import json
import sys
import time
from pathlib import Path

out_path = Path('/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260224/synthforge-runtime-validation.json')
sys.path.insert(0, '/home/mm/map2-audio/juce-engine/build')
import map2_audio_engine

engine = map2_audio_engine.create_engine()
engine.set_sample_rate(48000)
engine.set_buffer_size(64)
engine.initialize('')
engine.start_audio()
time.sleep(0.25)

result = {
    "baseline": {
        "voice_metrics": engine.get_synthforge_voice_metrics(),
        "cpu_metrics": engine.get_cpu_metrics(),
        "xrun_count": engine.get_xrun_count(),
    },
    "runs": [],
}

for count in [8, 16, 32, 64]:
    notes = [36 + i for i in range(count)]
    accepted_on = sum(1 for note in notes if engine.midi_inject_note_on(1, note, 100))
    time.sleep(0.2)
    on_metrics = engine.get_synthforge_voice_metrics()
    cpu_metrics = engine.get_cpu_metrics()
    xrun_after_on = engine.get_xrun_count()
    accepted_off = sum(1 for note in notes if engine.midi_inject_note_off(1, note, 0))
    time.sleep(0.25)
    off_metrics = engine.get_synthforge_voice_metrics()
    xrun_after_off = engine.get_xrun_count()
    result["runs"].append({
        "requested_notes": count,
        "accepted_note_on": accepted_on,
        "accepted_note_off": accepted_off,
        "on_metrics": on_metrics,
        "cpu_metrics": cpu_metrics,
        "xrun_after_on": xrun_after_on,
        "off_metrics": off_metrics,
        "xrun_after_off": xrun_after_off,
    })

result["final_cpu_metrics"] = engine.get_cpu_metrics()
result["final_xrun_count"] = engine.get_xrun_count()
result["system_info"] = engine.get_system_info()
out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

engine.stop_audio()
engine.shutdown()
print(out_path)
PY
```

## Result Summary

- Initialization: `init_ok=true`
- Audio start: `start_ok=true`
- Callback device: `Default ALSA Output (currently PipeWire Media Server)`
- Injected MIDI note-on/off: accepted for all requested note counts (`8/16/32/64`)
- SynthForge voice metrics (channel 1 test part):
  - `8` notes: `active_voices=8`, `peak_voices=8`
  - `16` notes: `active_voices=16`, `peak_voices=16`
  - `32` notes: `active_voices=32`, `peak_voices=32`
  - `64` notes: `active_voices=64`, `peak_voices=64`
- CPU metrics (`total_cpu_percent`, engine-wide):
  - baseline: `34.75%`
  - 8 notes: `35.14%`
  - 16 notes: `36.38%`
  - 32 notes: `36.05%`
  - 64 notes: `38.16%`
- XRuns: `0` throughout run

Raw data:

- `docs/fit-for-purpose-evidence/20260224/synthforge-runtime-validation.json`

## Interpretation

This host now exercises a real callback path at `48kHz/64` and produces stable non-zero SynthForge voice metrics under injected MIDI load. Runtime validation is now meaningful on this machine, and T008 acceptance criteria are met for callback-path activation, voice activity, and xrun-free operation in this scenario.

Observed startup warning context:

- AVDECC initialization warning is non-fatal and does not block audio callback execution in this test path.

## Code Added During Validation

Internal MIDI injection hooks were added to drive note events through the existing MIDI callback path:

- `Map2AudioEngine::injectMidiNoteOn`
- `Map2AudioEngine::injectMidiNoteOff`

Files:

- `juce-engine/Source/Map2AudioEngine.h`
- `juce-engine/Source/Map2AudioEngine.cpp`
- `juce-engine/Source/PythonBindings.cpp`
- `app/services/juce_engine_service.py`
- `juce-engine/Source/JuceAudioIO.cpp`
- `juce-engine/Source/H3000Processor.cpp`
- `juce-engine/Source/SynthForge/SynthForgeProcessor.cpp`
- `juce-engine/CMakeLists.txt`
- `tests/test_juce_engine_audio_start_stability.py`

## Next Required Step

Extend from callback validation to sustained stress validation (long-run xrun/jitter soak and per-feature CPU isolation) as part of broader Tier A qualification.
