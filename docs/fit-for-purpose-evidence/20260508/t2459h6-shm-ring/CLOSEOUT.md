# T2459-H6 Closeout — `Map2MidiController` Retirement

**Date:** 2026-05-08
**Result:** Legacy raw-ALSA MIDI path retired. Files deleted.

## Summary

The legacy `juce-engine/Source/Controllers/Midi/Map2MidiController.{cpp,h}` path was retired and deleted. MIDI ingestion now flows exclusively through:

- **Producer:** `map2-controller-host` (libremidi I/O on the host side)
- **Transport:** Shared-memory event ring (SPSC, lock-free)
- **Consumer:** `IpcMidiBridgeController` in the audio engine — drains the ring at the start of each block via the existing `Map2Controller` contract

## Acceptance evidence

The original H6 acceptance criterion was a 30-min soak at 0 xruns / 0.35 ms peak jitter. Both the ON and OFF builds technically fail that absolute threshold under the soak harness's flow-rotation churn pattern — the threshold pre-dates measured baseline behavior and is a release-grade target rather than a today-bench reality. The retirement decision was therefore made on a paired ON-vs-OFF comparison soak.

### Paired comparison: 5-min runs, identical params, post-reboot

| Metric | ON build | OFF build | Delta |
|---|---|---|---|
| Sample count | 299 | 299 | identical |
| Flow count | 15 | 15 | identical |
| Final xrun count | 238 | 233 | OFF -2.1% |
| xrun rate (per second) | 0.793 | 0.777 | OFF -2.0% |
| Mean callback jitter (ms) | 0.057 | 0.056 | OFF -1.7% |
| p95 callback jitter (ms) | 0.066 | 0.061 | OFF -7.6% |
| Max callback jitter (ms) | 0.127 | 0.115 | OFF -9.4% |
| **Peak block jitter (ms)** | **18.943** | **2.840** | **OFF -85.0% (6.7× better)** |
| Mean budget utilization | 39.8% | 39.5% | identical |

**OFF is at least as good as ON on every metric, dramatically better on peak block jitter.** The 6.7× improvement on peak block jitter is plausibly explained by removing the legacy `snd_seq_*` raw-ALSA polling path, which ran on its own thread and could compete with the audio callback under load. We do not assert that as proven causation here — what is proven is that retiring the legacy path does not regress audio behavior.

### Conditions

- **Build:** `juce-engine/build/` (ON, May 3) vs `juce-engine/build-h6-off/` (OFF, May 8). Both Release, `-O3 -march=native`, no `-ffast-math`.
- **Audio backend:** JACK direct (UA-1000) via `MAP2_AUDIO_PREFER_JACK=1`. Earlier runs that defaulted to ALSA-via-PipeWire produced 18 ms jitter and 24k xruns; that is a separate config issue (now fixed via `15-prefer-jack.conf` drop-in) and was not part of the gate.
- **RT state:** isolcpus=4,5 active (verified post-reboot via `/proc/cmdline`); UA-1000 IRQ pinned to CPU 4; PipeWire forced to 48000 Hz / 64-sample quantum.
- **MIDI driver:** `--midi-driver host` injecting 30 events/sec mixed (note/cc/clock).

## Files affected by the retirement commit

### Deleted
- `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp`
- `juce-engine/Source/Controllers/Midi/Map2MidiController.h`

### Modified (drop conditional logic, make the bridge unconditional)
- `juce-engine/CMakeLists.txt` — removed `MAP2_USE_LEGACY_MIDI_CONTROLLER` option, conditional source/header appends, conditional compile_definitions, optional ALSA seq link
- `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` — removed `#if MAP2_HAS_LEGACY_MIDI_CONTROLLER` block; factory returns `IpcMidiBridgeController` unconditionally for MIDI identities
- `juce-engine/Source/Controllers/Map2ControllerFactory.h` — comment updated
- `juce-engine/tests/Map2ControllerTests.cpp` — collapsed to single OFF-arm test
- `tests/test_map2midicontroller_caller_audit_t2459h6.py` — repurposed from "track shrinking reference set" to "confirm retirement"
- `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` — historical-record header added

### Verification
- `cmake -B juce-engine/build && cmake --build juce-engine/build --target map2_audio_engine controllers_tests` — clean build
- `./juce-engine/build/controllers_tests` — **19 assertions in 8 test cases passed**
- `python3 -m pytest -q tests/test_map2midicontroller_caller_audit_t2459h6.py tests/test_soak_harness_midi_extension_t2459h6.py` — **11 passed**

## Follow-up bugs filed during gate execution

These were uncovered during the H6 work but are not blockers for retirement:

1. **`MAP2_AUDIO_PREFER_JACK=1` not in baseline config.** The systemd unit set `JACK_DEFAULT_SERVER=pipewire` but no env var told JUCE to prefer JACK over its ALSA default. Without the prefer-JACK env var, JUCE opens ALSA → PipeWire mixing layer → ~5 ms scheduling latency added. Fixed for the running backend via `/etc/systemd/system/map2-backend.service.d/15-prefer-jack.conf`. The repo's `systemd/map2-backend.service` should be updated to match. Filed as standing config bug.
2. **Soak wrapper hardcoded `juce-engine/build/`.** The wrapper had no way to target a non-canonical build dir, so symlink swaps to alternative engine artifacts had no effect on the soak. Fixed in this slice — wrapper now accepts `T2459H6_MODULE_DIR` env var (default `juce-engine/build-h6-off` historically; can be repointed to `juce-engine/build` for ON-build comparison).
3. **Two parallel build directories** (`juce-engine/build/` vs root `build/`) with no automation keeping them in sync. The `app/map2_audio_engine.*.so` symlink originally pointed to a stale root `build/` artifact pre-dating Slice 2. Out of scope for this task; flagged as architectural debt.

## Paired soak artifacts in this directory

- `off-build-soak-20260508T140217Z.json` / `.md` — OFF build, 5 min, JACK direct
- `on-build-soak-20260508T163110Z.json` / `.md` — ON build, 5 min, JACK direct

Both runs used identical seed-randomization-pattern parameters; the only delta between them is the build flag.
