# Bench Execution Summary

Date: 2026-04-26 13:17 EDT

## Scope

Executed the front of the remaining hardware-backed testing queue from `T2458`:

- `T055` UA-1000 analog loopback latency matrix
- `T219-F` drum-machine full-stack integration qualification
- `T099` dynamic-response blind A/B readiness check

The external-device tail remains blocked by design: `T066-subQ`, `T066-subR`, `T563`, and `T203-subK`.

## Host Preflight

- Backend API health: `curl http://127.0.0.1:8080/api/health` -> HTTP `200`
- Frontend health: `curl http://127.0.0.1:3000/` -> HTTP `200`
- `map2-web-prod.service`: `active`
- JACK graph: visible devices are `Jogg USB Audio`, built-in analog audio, MAP2/JUCE MIDI bridge, and PipeWire MIDI bridge
- ALSA sequencer: available; visible clients include `Midi Through`, `RtMidiOut Client MAP2:Maschine-MK1`, `JUCE`, `MAP2 Audio Engine`, and PipeWire MIDI endpoints
- `amidi -l`: no raw MIDI hardware device entries

## T055 UA-1000 Loopback

Command:

```bash
python3 scripts/run_t055_ua1000_loopback_matrix.py \
  --output-dir docs/fit-for-purpose-evidence/20260426/t055-execute \
  --duration 15 \
  --trials 3
```

Result: `BLOCKED`

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t055-execute/t055-loopback-matrix-summary.json`
- `docs/fit-for-purpose-evidence/20260426/t055-execute/T055_UA1000_LOOPBACK_MATRIX_SUMMARY.md`
- `docs/fit-for-purpose-evidence/20260426/t055-execute/jack_lsp.txt`

Reason: UA-1000 JACK ports are absent from the current JACK graph. The host is still on `Jogg USB Audio` / built-in audio, so no physical UA-1000 tuned-vs-rollback matrix can execute.

### Connected-device rerun

Date: 2026-04-26 13:43 EDT

Rerun command:

```bash
python3 scripts/run_t055_ua1000_loopback_matrix.py \
  --output-dir docs/fit-for-purpose-evidence/20260426/t055-rerun-connected \
  --duration 15 \
  --trials 3 \
  --jack-playback-port 'EDIROL UA-1000 Pro:playback_AUX0' \
  --jack-capture-port 'EDIROL UA-1000 Pro:capture_AUX0'
```

Result: `FAIL`

Observed:

- UA-1000 JACK ports were present: `capture_AUX0..3`, `playback_AUX0..3`, `monitor_AUX0..3`, and UA-1000 MIDI bridge ports.
- Matrix preflight passed, but all tuned and rollback trials failed before writing trial JSON.
- `jack_iodelay` reported no loopback latency samples.
- Manual 4-second probes across all 16 AUX playback/capture pairings (`AUX0..3` x `AUX0..3`) also returned no loopback samples.

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t055-rerun-connected/t055-loopback-matrix-summary.json`
- `docs/fit-for-purpose-evidence/20260426/t055-rerun-connected/T055_UA1000_LOOPBACK_MATRIX_SUMMARY.md`
- `docs/fit-for-purpose-evidence/20260426/t055-rerun-connected/probes/`

Status: device enumeration is no longer blocked, but the task remains blocked/failed on physical loopback signal or JACK routing. The next attempt should verify the analog patch path with signal present on the selected UA-1000 input before rerunning the matrix.

### All-eight loopback rerun

Date: 2026-04-26

Setup:

- UA-1000 rebooted into `44.1 kHz` mode.
- JACK/PipeWire exposed `playback_AUX0..9` and `capture_AUX0..11`.
- Physical loopbacks connected for channels 1 through 8.
- `scripts/measure_latency.sh` was fixed to detect this host's `jack_iodelay` client names (`jack_delay:out` / `jack_delay:in`) and to fall back to `pw-link` when `jack_connect` does not establish PipeWire JACK links.

Result: `FAIL`

Observed:

- All eight same-index pairs produced measurable samples, confirming the physical signal path is alive.
- Every channel failed the latency gate with unstable/high round-trip values.
- No XRUNs were reported during the eight-channel pass.

Summary:

| Channel | JACK pair | Gate | Mean ms | P95 ms | Jitter p95 ms | XRUNs |
|---|---|---:|---:|---:|---:|---:|
| 1 | `playback_AUX0` -> `capture_AUX0` | FAIL | 310.3383 | 1161.242 | 1161.242 | 0 |
| 2 | `playback_AUX1` -> `capture_AUX1` | FAIL | 1015.3517 | 1032.641 | 64.169 | 0 |
| 3 | `playback_AUX2` -> `capture_AUX2` | FAIL | 421.8012 | 1160.586 | 1151.384 | 0 |
| 4 | `playback_AUX3` -> `capture_AUX3` | FAIL | 710.3597 | 1161.219 | 1150.655 | 0 |
| 5 | `playback_AUX4` -> `capture_AUX4` | FAIL | 413.2567 | 1331.962 | 1278.683 | 0 |
| 6 | `playback_AUX5` -> `capture_AUX5` | FAIL | 588.6588 | 1331.921 | 1321.327 | 0 |
| 7 | `playback_AUX6` -> `capture_AUX6` | FAIL | 330.9484 | 1161.250 | 1108.617 | 0 |
| 8 | `playback_AUX7` -> `capture_AUX7` | FAIL | 352.0513 | 1333.174 | 1333.174 | 0 |

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks/results.csv`
- `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks/ch*_AUX*.json`

Status: the blocker moved from missing signal to invalid/unstable loopback measurement. Next action is to isolate one physical loop only, disable any UA-1000 direct-monitor/internal mixer loopback, and rerun that single pair to get a stable `jack_iodelay` lock before attempting the full tuned-vs-rollback matrix.

## T219-F Drum Machine Integration

Command:

```bash
pytest -q tests/test_drum_integration.py tests/test_juce_engine_drum_native_stability.py
```

Result: `3 passed, 1 skipped`

Runtime API checks:

```bash
curl -s http://127.0.0.1:8080/api/engine/drums/metering
curl -s http://127.0.0.1:8080/api/engine/drums/transport
```

Observed:

- Drum metering endpoint is reachable but idle, with all pad/bus/master peaks at `0.0`.
- Drum transport endpoint is reachable and currently stopped.
- ALSA sequencer is available, but no dedicated external drum-triggering MIDI input device is attached beyond internal/MAP2 bridge endpoints.

Status: automated full-stack and native-engine coverage passed; hardware-backed end-to-end closure remains blocked until a live external MIDI input source is attached and used to prove pad triggers, metering response, playback edit behavior, song progression, and kit-switch behavior on the running audio path.

### Connected-device rerun

Date: 2026-04-26 13:43 EDT

Result: `3 passed, 1 skipped`

Observed:

- UA-1000 raw MIDI device is present as `hw:3,0,0 UA-1000 MIDI`.
- ALSA sequencer shows `UA-1000 MIDI` connected to MAP2/RtMidi input and output clients.
- Drum metering and transport endpoints remained reachable.
- A 10-second `aseqdump -p 28:0` capture observed only the subscription event and no live note/controller events.

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t219-rerun-connected/pytest-drum-integration.txt`
- `docs/fit-for-purpose-evidence/20260426/t219-rerun-connected/aconnect-l.txt`
- `docs/fit-for-purpose-evidence/20260426/t219-rerun-connected/amidi-l.txt`
- `docs/fit-for-purpose-evidence/20260426/t219-rerun-connected/ua1000-midi-aseqdump-10s.txt`

Status: automated coverage and device visibility pass. Hardware-backed closure still requires a live MIDI trigger event during capture so pad trigger, metering response, and running-path behavior can be proven.

## T099 Dynamic Response

Readiness check:

```bash
find docs/fit-for-purpose-evidence -path '*t099*' -maxdepth 5 -type f | sort
```

Observed only protocol/templates:

- `docs/fit-for-purpose-evidence/t099-protocol.md`
- `docs/fit-for-purpose-evidence/t099-run-manifest.template.json`
- `docs/fit-for-purpose-evidence/t099-evaluator.template.json`
- `docs/fit-for-purpose-evidence/t099-subjective-eval.template.json`
- `docs/fit-for-purpose-evidence/t099-subjective-eval-form.md`
- `docs/fit-for-purpose-evidence/t099-dynamic-response-evidence-template.md`

Status: blocked until the live recording session produces the run manifest, reference/candidate WAV files, quantitative analysis output, and evaluator response JSON files.

## Next Physical Actions

1. Restore or repatch the UA-1000 analog loopback signal, then confirm `jack_iodelay` produces samples on one UA-1000 playback/capture pair before rerunning `T055`.
2. Generate a live MIDI note/controller event into `UA-1000 MIDI` during capture, then rerun the live `T219-F` trigger/metering procedure.
3. Stage the `T099` recording session artifacts before running `scripts/analyze_envelope.py` and `scripts/summarize_dynamic_response_study.py`.
