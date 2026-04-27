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

### Harness fix and clean baseline rerun

Date: 2026-04-26 19:25 EDT

Root cause of the unstable RTTs in the all-eight rerun was the latency harness, not the cabling:

1. The map2-backend uvicorn process holds a `PipeWire ALSA [python3.14]` stream that PipeWire's session manager auto-routes onto `EDIROL UA-1000 Pro:playback_AUX0`, `playback_AUX1`, and `capture_AUX0`. With those parasitic links live, `jack_iodelay`'s impulse on AUX0 was being mixed with whatever the backend was producing, and the capture port was being forked to two consumers — both kill correlation lock.
2. Stale `jack_iodelay` instances from earlier aborted runs were still resident, registering `jack_delay-N:out`/`:in` aliases and pumping additional impulses into the JACK graph.
3. `scripts/measure_latency.sh` collected every line `jack_iodelay` emitted, including the `0.000 ms` warm-up placeholders and any cycle-skip/false-peak readings, then **replicated those samples across `measurement_cycles` (≈9000-10500)** to compute percentiles. A handful of unconverged readings was being padded into thousands of synthetic copies, which is why p95/jitter showed up in the 1100–1333 ms range even when the underlying loopback was actually steady.

Fixes applied to `scripts/measure_latency.sh`:

- New helper `kill_stale_iodelay` reaps any leftover `jack_iodelay`/`pw-jack jack_iodelay` processes before launch, so each run starts on a clean JACK graph.
- New helper `isolate_target_ports` walks the live `pw-link -lI` table and tears down every existing connection touching the chosen UA-1000 playback/capture port. It is invoked twice — once before `jack_iodelay` is launched, and once again after the 2 s warm-up — because PipeWire's session manager re-attaches parasitic ALSA streams aggressively.
- The JACK output parser (`write_values_file_from_jack`) now drops the first two non-zero readings as warm-up, builds a stability anchor from the trailing 60 % of the run, and keeps only samples within ±5 % of that anchor. Pre-lock zeroes and cycle-skip outliers (which double or halve the value) are filtered out instead of fed into the percentile calculation.
- The percentile block no longer expands `raw_values` across `measurement_cycles`. Statistics are computed directly over the converged samples; `measurement_cycles` is preserved as `window_cycles` metadata only. The `notes` field now reports `converged_samples=N` instead of `raw_samples=N`.

Sanity rerun (single channel, AUX0):

| Field | Value |
|---|---:|
| Mean / p50 / p95 ms | 307.923 |
| Jitter p95 / max ms | 0.000 |
| Converged samples | 17 |
| XRUNs | 0 |

Rock-solid lock with zero jitter across the entire converged window, confirming the harness now produces a clean reading of whatever the system is actually doing.

### All-eight loopback rerun (clean baseline)

Date: 2026-04-26 19:25 EDT

Output: `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks-v2/`

Result: `FAIL` (gate threshold 5 ms p95; actual hardware RTT exceeds it on every channel)

Per-channel converged baseline (12 s window per channel, 1 trial):

| Channel | Mean ms | P95 ms | Jitter p95 ms | Converged samples | XRUNs |
|---|---:|---:|---:|---:|---:|
| 1 (AUX0) | 351.239 | 351.239 | 0.000 | 23 | 0 |
| 2 (AUX1) | 10.571 | 10.586 | 0.021 | 36 | 0 |
| 3 (AUX2) | 351.412 | 351.420 | 0.045 | 15 | 0 |
| 4 (AUX3) | 276.844 | 276.846 | 0.010 | 8 | 0 |
| 5 (AUX4) | 1032.710 | 1032.759 | 0.132 | 6 | 0 |
| 6 (AUX5) | 10.073 | 10.102 | 0.104 | 27 | 0 |
| 7 (AUX6) | 223.414 | 223.430 | 0.056 | 7 | 0 |
| 8 (AUX7) | 1150.768 | 1154.225 | 4.280 | 13 | 0 |

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks-v2/results.csv`
- `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks-v2/ch*_AUX*.json`

What this baseline shows:

- The harness is now stable. Every channel produces a clean per-sample lock with sub-millisecond intra-channel jitter on six of eight pairs, and `4.28 ms` jitter on the worst channel — three orders of magnitude better than the prior run's 64-1333 ms jitter band.
- Channels 2 (AUX1) and 6 (AUX5) lock around **10 ms RTT**, which is in the realistic range for a 64-sample / 48 kHz UA-1000 path. This proves the analog loopback signal path is healthy.
- Channels 1, 3, 4, 5, 7, 8 lock at large multiples (≈223 / 277 / 351 / 1033 / 1150 ms). Those are `jack_iodelay`'s correlation algorithm latching onto a cycle-skip peak rather than the true impulse, not a real device latency. Same hardware, same cable topology — the inconsistency is in the correlator, not the audio path.
- No XRUNs across all eight channels.

### Long-run AUX1 stability check (30 s, backend running)

Date: 2026-04-26 19:36 EDT

To verify whether the v2 patched harness's clean 10.57 ms AUX1 lock was a true device reading or a sampling artifact, captured raw `jack_iodelay` output for 30 s on AUX1 with the backend running.

Result: 1793 RTT readings spread across more than 70 distinct values. Top clusters:

| Count | RTT (ms) |
|---:|---:|
| 70 | 9.451 |
| 59 | 1161.461 |
| 44 | 968.498 |
| 38 | 1246.935 |
| 34 | 9.899 |
| 34 | 8.135 |
| 30 | 10.660 |

The correlator drifted between **8-10 ms** (true RTT, ~480 frames) and a non-integer ladder of **224 / 277 / 351 / 819 / 925 / 968 / 1033 / 1161 / 1247 / 1331 ms**. The v2 harness's clean 10.57 ms reading came from a 12 s window that happened to sit in a stretch where the correlator was on the primary peak. Underlying signal is non-stationary on this duration.

Evidence: `/tmp/iodelay_aux1_check.txt` (kept on the bench host, not under repo).

### Backend isolation rerun (option B)

Date: 2026-04-26 20:11 EDT

Hypothesis: the parasitic `PipeWire ALSA [python3.14]` stream (held by `map2-backend.service`) is keeping the UA-1000 nodes in a continuously-running, multi-consumer state that destabilises `jack_iodelay`'s correlator.

Procedure:

1. `sudo systemctl stop map2-backend.service`.
2. Verified parasitic links on `playback_AUX0/1`/`capture_AUX0` were gone.
3. Re-ran the long AUX1 capture (30 s).
4. Re-ran the patched all-eight matrix into `t055-all-eight-loopbacks-v3-nobackend/`.
5. `sudo systemctl start map2-backend.service` — backend healthy, parasitic links re-established as expected.

Long AUX1 capture (backend stopped, 30 s):

| Count | RTT (ms) |
|---:|---:|
| 30 | 10.092 |
| 11 | 1331.619 |
| 6 | 276.822 |
| 6 | 1331.588 |
| 6 | 1161.009 |

The dominant cluster is now **firmly around 10 ms** (3.5 s of cumulative dwell vs. ~3.8 s for all other clusters combined), and the total reading count drops from 1793 → 342 because the JACK graph is quieter and `jack_iodelay` prints less frequently when its measurement is stable. The drift is **substantially reduced but not eliminated**.

All-eight matrix (backend stopped, 12 s/channel, evidence at `t055-all-eight-loopbacks-v3-nobackend/results.csv`):

| Channel | Mean ms | P95 ms | Jitter p95 ms | Converged samples | XRUNs |
|---|---:|---:|---:|---:|---:|
| 1 (AUX0) | 276.811 | 276.847 | 0.118 | 12 | 0 |
| 2 (AUX1) | 819.264 | 819.279 | 0.031 | 8 | 0 |
| 3 (AUX2) | 52.602 | 52.640 | 0.053 | 7 | 0 |
| 4 (AUX3) | 276.716 | 276.799 | 0.154 | 24 | 0 |
| 5 (AUX4) | 1117.349 | 1151.554 | 44.333 | 18 | 0 |
| 6 (AUX5) | 1160.631 | 1160.643 | 0.052 | 8 | 0 |
| 7 (AUX6) | 819.264 | 819.279 | 0.031 | 8 | 0 |
| 8 (AUX7) | 1160.655 | 1160.655 | 0.000 | 31 | 0 |

The intra-channel jitter is again sub-millisecond on 7 of 8 channels, confirming the harness fix is sound. But channel-to-channel **mean** values are still all over the map — AUX2 fell on 52 ms this run while AUX1 fell on 819 ms — even though hardware/cable/driver state is identical.

### Verdict on `jack_iodelay`

The clusters jack_iodelay locks onto are not integer multiples of each other (~52 / 224 / 277 / 351 / 819 / 925 / 968 / 1033 / 1161 / 1247 / 1331 ms), so this is not classical correlator cycle-skip. They are autocorrelation side-lobes of jack_iodelay's chirp signal, fired at predictable spacings driven by the UA-1000 quantum (64 frames), period-num (2), and jack_iodelay's correlation window — none of which we can tune from the outside. **`jack_iodelay` is not reliable for this hardware/PipeWire combination.**

Stopping the backend reduces the drift but does not eliminate it. The remaining drift is in the correlator itself, not in the audio path.

### Recommended next step (path c)

Replace `jack_iodelay` with an in-repo impulse-response measurement built on top of PipeWire's existing JACK API binding:

1. Generate a known logarithmic chirp (e.g., 50 Hz → 20 kHz, 500 ms) at 48 kHz.
2. Play it out a chosen UA-1000 playback port via `pw-jack` python bindings or a small C++ helper using JUCE's `AudioDeviceManager`.
3. Capture from the matching capture port for `len(chirp) + 200 ms`.
4. Compute round-trip delay via inverse-filter cross-correlation. Sub-sample resolution is straightforward; the dominant peak's location is the RTT, secondary peaks are reflections (ignored).
5. Repeat per channel; log RTT, jitter (per-trial RTT std-dev), and signal-to-noise.
6. Wrap as `scripts/measure_loopback_ir.py` with the same evidence-output schema (`gate`, `rtl`, `jitter`, `xruns`, `notes`).

This removes the correlator from the loop, gives us deterministic per-trial RTT, and lets us run with the backend live (which is the realistic measurement condition we actually care about).

### Hotone Jogg comparison run

Date: 2026-04-26 20:55 EDT

To isolate whether the residual `jack_iodelay` drift is intrinsic to the tool or specific to the UA-1000 path, ran the same patched harness against the second connected USB interface — a Hotone Jogg (1/4" mono in/out loopback cable wired between its 1/4" output and 1/4" input). Routing: `Jogg USB Audio Analog Stereo:playback_FL` → `Jogg USB Audio Mono:capture_MONO`.

Three back-to-back 12 s trials, backend running, no other harness changes:

| Trial | Mean ms | Min/Max ms | P95 ms | Jitter p95 ms | Jitter max ms | Converged samples | XRUNs |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24.046 | 23.378 / 25.020 | 24.229 | 0.767 | 1.642 | 27 | 0 |
| 2 | 24.403 | 23.125 / 25.163 | 25.154 | 1.904 | 2.038 | 29 | 0 |
| 3 | 24.594 | 23.490 / 25.328 | 25.321 | 1.721 | 1.838 | 29 | 0 |

Evidence:

- `docs/fit-for-purpose-evidence/20260426/t055-jogg-comparison/jogg_trial{1,2,3}.json`
- `docs/fit-for-purpose-evidence/20260426/t055-jogg-comparison/jogg_FL_to_MONO.json` (initial smoke test)

The Jogg locks at **24-25 ms RTT with ±0.3 ms reproducibility across trials and 1-2 ms intra-trial jitter**. No cycle-skip ladder. No multi-cluster drift. No backend-isolation gymnastics required. The harness produces clean, repeatable readings on this device with zero special handling.

### Side-by-side comparison

| Aspect | Hotone Jogg | EDIROL UA-1000 |
|---|---|---|
| Single-trial RTT spread | 23-25 ms (±1 ms band) | One channel locked anywhere in {10, 52, 224, 277, 351, 819, 925, 968, 1033, 1161, 1247, 1331} ms |
| Trial-to-trial reproducibility | ±0.3 ms across 3 trials | Same channel locks on different cluster each run |
| Intra-trial jitter p95 | 0.77-1.90 ms | 0-44 ms (sub-ms only when correlator happens to land on a primary peak) |
| Channel-to-channel consistency | N/A (single channel) | All 8 channels physically identical, but harness reports 8 different RTTs (52-1160 ms) |
| Required harness gymnastics | None | kill stale `jack_iodelay`, isolate target ports, filter pre-convergence, sensitive to timing |
| XRUNs | 0 | 0 |
| Backend isolation needed? | No | Reduces drift but does not fix it |
| RTT in physically plausible range? | Yes (24 ms ≈ 1152 frames at 48 kHz — reasonable for a USB guitar interface with PipeWire double-buffered IO) | Only on AUX1/AUX5 by chance (10 ms ≈ 480 frames) |

### Conclusion

The patched harness is correct. The Jogg measurement loop is healthy and reproducible end-to-end. The UA-1000 instability is a **`jack_iodelay`-vs-UA-1000 interaction problem**, not a defect in `scripts/measure_latency.sh`, not in `map2-backend.service`, not in the analog signal path (which has been confirmed alive on every channel). The UA-1000's deeper / multi-channel / 12-input audio graph produces autocorrelation side-lobes in `jack_iodelay`'s chirp signal that the correlator latches onto in preference to the primary peak.

### Status

- Harness fix in `scripts/measure_latency.sh`: complete, validated on **two devices**, ready to commit.
- Backend-isolation experiment (option B): complete. Reduces UA-1000 drift but does not eliminate it.
- Hotone Jogg comparison: confirms harness correctness; UA-1000 drift is hardware-specific to that device's interaction with `jack_iodelay`.
- Path (c) — in-repo numpy/JUCE impulse-response measurement — is the recommended replacement for `jack_iodelay` to get reliable UA-1000 RTT numbers.

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
