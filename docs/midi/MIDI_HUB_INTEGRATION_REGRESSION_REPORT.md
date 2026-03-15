# MIDI Hub Integration Regression Report (T066-subR)

Date: 2026-03-09
Owner: Codex

## Summary
Software-only integration regression is largely green across the MIDI Hub API and service surfaces. Hardware-in-the-loop and long-duration performance gates remain blocked in this environment.

The current rerun path is the unified qualification runner:

```bash
python3 scripts/run_t066_midi_hub_qualification.py \
  --output-dir "/tmp/map2-t066-qualification-$(date +%Y%m%d-%H%M%S)"
```

That command wraps the regression suites, `npm --prefix web run typecheck`, the virtual-port performance microbench, the delegated `T066-subQ` adapter precheck, and an explicit soak-duration gate into one summary bundle.

## Executed Validation

### Unified qualification rerun
```bash
python3 scripts/run_t066_midi_hub_qualification.py \
  --output-dir /tmp/map2-t066-qualification-check-fixed \
  --adapter-label "Generic USB-to-DIN Adapter"
```
Result: `BLOCKED`.

Latest host evidence (`2026-03-14`):
- Software regression bundle: `PASS` (`23 passed`, clean exit after the `test_device_registry.py` async-engine teardown fix)
- Frontend/API contract validation: `PASS`
- Performance microbench: `BLOCKED` (`3.930 ms` hop latency, `4736.90 msg/s`, delivery ratio `1.0`)
- Adapter precheck: `BLOCKED` (`/dev/snd/seq` / physical adapter prerequisites absent on this host)
- Soak duration gate: `BLOCKED` (`0.0 / 86400.0` seconds observed)
- Summary artifact: `/tmp/map2-t066-qualification-check-fixed/t066-midi-hub-qualification-summary.json`

### Regression suites
```bash
timeout 300s pytest -q \
  tests/midi_hub/test_traffic_routes.py \
  tests/midi_hub/test_consumer_migration.py \
  tests/midi_hub/test_device_registry.py \
  tests/midi_hub/test_gateway.py
```
Result: `18 passed`.

```bash
timeout 240s pytest -q \
  tests/midi_hub/test_device_registry.py \
  tests/midi_hub/test_gateway.py \
  tests/midi_hub/test_traffic_routes.py
```
Result: `14 passed`.

### Frontend/API contract validation
```bash
npm --prefix web run typecheck
```
Result: PASS.

### Targeted performance micro-benchmark
Artifact: `docs/fit-for-purpose-evidence/20260309/t066/midi_hub_perf_microbench.json`

Measured:
- Burst messages injected: `10000`
- Delivered to destination TX queue: `4224`
- Effective throughput: `421.83 msg/s`
- Single route hop sample latency: `1.082 ms`
- Target check (`<100us hop`, `>=10,000 msg/s`): FAIL in this environment

## Acceptance Matrix

1. Port layer: PARTIAL
- Virtual port lifecycle and gateway reconnect behavior validated in tests.
- USB hot-plug timing on real ALSA hardware pending HIL execution.

2. Router: PASS (software path)
- Multi-route CRUD, enable/disable, filtering, transform path, and topology validated.

3. Consumer migration: PASS (covered subset)
- Existing MIDI engine migration test path passes (`test_consumer_migration.py`).
- Full MPX1 + JUCE + Tesira HIL joint matrix still pending.

4. Traffic monitor: PASS
- Snapshot/stats/export/clear regression routes pass.

5. Presets: PASS
- Save/recall/compare/export/import, default + chain + program slot mapping validated.

6. Scripting: PASS
- CRUD, run/trigger, console, enable/disable, stop flow validated.

7. Clock: PASS (software gate)
- Config/start/stop/continue/tap API paths validated.
- Real external-clock convergence measurement pending HIL.

8. Performance gate: BLOCKED
- Throughput and hop-latency targets not met in this non-HIL execution environment.
- 24h soak evidence not executed in this run.

## Blockers
- Real adapter/ALSA sequencer and external device topology not available in this execution context.
- HIL-only gates (USB hot-plug timing, external SysEx loops, full 24h soak) require lab hardware access.

## Next Steps to Close
1. Execute HIL matrix on a hardware-connected host with `/dev/snd/seq` access.
2. Run 24h soak and capture xrun/jitter/throughput artifacts.
3. Re-run the unified qualification bundle from `docs/midi/T066_MIDI_HUB_QUALIFICATION_RUNBOOK.md` and archive the resulting summary directory under dated `fit-for-purpose-evidence`.
