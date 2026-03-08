# T055 Analog Loopback Latency Validation (2026-03-07)

## Scope
- Objective: measure true UA-1000 analog round-trip latency before/after period tuning with repeated runs.
- Conditions:
  - Tuned: Pro Audio + WirePlumber override (`period-size=64`, `period-num=2`, `headroom=0`).
  - Rollback: Pro Audio without override (`period-size=64`, `period-num=3`, `headroom=0`).

## Measurement harness hardening
- Updated `scripts/measure_latency.sh` to support real PipeWire/JACK port names on this host.
- Root cause fixed:
  - Previous script attempted `jack_iodelay:output/input` and `system:playback_1/capture_1`.
  - Actual runtime ports are `jack_delay:out/in` and `EDIROL UA-1000 Pro:playback_AUX0/capture_AUX0`.
- Added script options:
  - `--jack-playback-port`
  - `--jack-capture-port`
- Added port auto-detection and embedded selected JACK ports into JSON outputs.

## A/B setup verification
- Tuned condition evidence:
  - `tuned/node-58-before-trials.txt` and `tuned/node-59-before-trials.txt` show `api.alsa.period-num=2`.
- Rollback condition evidence:
  - `rollback/node-58-before-trials.txt` and `rollback/node-59-before-trials.txt` show `api.alsa.period-num=3`.

## Trial results (JACK iodelay, 15s each)

### Tuned (`period-num=2`)
- `tuned/trial1.json`: `status=failed` (`No loopback signal detected`)
- `tuned/trial2.json`: `status=failed` (`No loopback signal detected`)
- `tuned/trial3.json`: `status=failed` (`No loopback signal detected`)

### Rollback (`period-num=3`)
- `rollback/trial1.json`: `status=failed` (`No loopback signal detected`)
- `rollback/trial2.json`: `status=failed` (`No loopback signal detected`)
- `rollback/trial3.json`: `status=failed` (`No loopback signal detected`)

All trial files include detected routing ports:
- `iodelay_output=jack_delay:out`
- `iodelay_input=jack_delay:in`
- `playback=EDIROL UA-1000 Pro:playback_AUX0`
- `capture=EDIROL UA-1000 Pro:capture_AUX0`

## Outcome
- No measured analog round-trip values were produced in either condition because no return signal was detected.
- `T055` cannot complete acceptance criteria (avg/p95 RTT comparison) until physical loopback signal is present.

## Post-run platform state
- Low-latency override restored (steady state remains tuned):
  - `node-58-post-restore.txt` / `node-59-post-restore.txt` show `period-num=2`.
- Service health artifacts captured:
  - `latency-post-restore.json`
  - `pipewire-latency-post-restore.json`
  - `xruns-post-restore.json`
  - `internal-estimate-smoke.json` (software estimate sanity-check only; not physical loopback)
  - `wpctl-status-post-restore.txt`

## Unblock action
- Connect physical analog loopback cable on UA-1000 (output AUX0 -> input AUX0).
- Re-run:
  - `bash scripts/measure_latency.sh --jack --duration 15 --json`
  - Repeat 3x for tuned and 3x for rollback, then compute avg/p95 RTT.

## 2026-03-07 Cabled Recheck (User-confirmed AUX0->AUX0 patch)
- Re-ran direct `jack_iodelay` probe with explicit ports:
  - playback: `EDIROL UA-1000 Pro:playback_AUX0`
  - capture: `EDIROL UA-1000 Pro:capture_AUX0`
  - result: `No loopback signal detected`.
- Executed exhaustive pair scan across all pro channels:
  - playback `AUX0..AUX3` x capture `AUX0..AUX3` (`16` combinations)
  - result: `16/16 NO_SIGNAL`, `0/16 MEASURED`.
- Additional sanity check: `speaker-test` playback reached UA-1000 output ports, while `pw-record` capture RMS remained `0.000000` on all recorded channels.

### New evidence files
- `aux-pair-scan-cabled.txt`
- `t055-cabled-retry-scan-summary.json`

## 2026-03-07 Interface Switch Recheck (Jogg USB Audio)
- User switched from UA-1000 to `Jogg USB Audio` and requested a fresh start.
- Detected I/O topology on the new device:
  - playback: `Jogg USB Audio Analog Stereo:playback_FL`, `...:playback_FR`
  - capture: `Jogg USB Audio Mono:capture_MONO`
- Re-ran `jack_iodelay` loopback probes on both available playback paths:
  - `playback_FL -> capture_MONO`: `status=failed` (`No loopback signal detected`)
  - `playback_FR -> capture_MONO`: `status=failed` (`No loopback signal detected`)

### New evidence files
- `jogg-usb-restart/probe-playback_FL-to-capture_MONO.json`
- `jogg-usb-restart/probe-playback_FR-to-capture_MONO.json`
- `jogg-usb-restart/combined.txt`
- `jogg-usb-restart/summary.json`

## 2026-03-07 Post-cable-change Recheck (`Output Left -> Input`)
- User reported a new cable change with left output patched to input.
- Re-ran targeted probe on the expected left path:
  - `playback_FL -> capture_MONO`: `status=failed` (`No loopback signal detected`)
- Ran cross-check in case of channel mapping mismatch:
  - `playback_FR -> capture_MONO`: `status=failed` (`No loopback signal detected`)

### New evidence files
- `jogg-usb-restart/probe-output-left-to-input-latest.json`
- `jogg-usb-restart/probe-crosscheck-FR-to-MONO-latest.json`

## 2026-03-07 Immediate Retry (same cable state)
- Re-ran loopback after user requested another attempt.
- Results:
  - `playback_FL -> capture_MONO`: `status=measured`, `round_trip_ms=23.202` (`1113.714` frames @ `48kHz`)
  - `playback_FR -> capture_MONO`: `status=failed` (`No loopback signal detected`)
- Interpretation: current physical patch is reaching the mono input from left output path only.

### New evidence files
- `jogg-usb-restart/retry-20260307-204731-FL-to-MONO.json`
- `jogg-usb-restart/retry-20260307-204731-FR-to-MONO.json`
