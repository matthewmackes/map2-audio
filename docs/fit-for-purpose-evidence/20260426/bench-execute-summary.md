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

1. Switch the host audio graph to the UA-1000, confirm `jack_lsp` contains UA-1000 playback/capture ports, then rerun `T055`.
2. Attach a real external MIDI trigger source for drums, confirm it appears in `aconnect -l` or the MAP2 MIDI Hub, then run the live `T219-F` trigger/metering procedure.
3. Stage the `T099` recording session artifacts before running `scripts/analyze_envelope.py` and `scripts/summarize_dynamic_response_study.py`.
