# T066 MIDI Hub Qualification Runbook

## Purpose

Use the unified qualification runner to execute the current software regression bundle, frontend typecheck, in-process virtual-port performance microbench, delegated USB-to-DIN adapter precheck, and an explicit soak-duration gate in one restart-safe capture directory.

## Default Command

```bash
python3 scripts/run_t066_midi_hub_qualification.py \
  --output-dir "/tmp/map2-t066-qualification-$(date +%Y%m%d-%H%M%S)"
```

## Hardware-Connected Lab Command

```bash
python3 scripts/run_t066_midi_hub_qualification.py \
  --output-dir "/tmp/map2-t066-qualification-$(date +%Y%m%d-%H%M%S)" \
  --adapter-label "Roland UM-ONE mk2" \
  --adapter-name-pattern "UM-ONE" \
  --adapter-session-id "<network-session-id>" \
  --soak-seconds 86400
```

## Outputs

- `t066-midi-hub-qualification-summary.json`: aggregate machine-readable result.
- `T066_MIDI_HUB_QUALIFICATION_SUMMARY.md`: operator-facing summary.
- `commands/`: stdout/stderr capture for regression and typecheck commands.
- `performance/midi_hub_perf_microbench.json`: virtual-port route-hop and throughput metrics.
- `adapter-precheck/`: delegated `T066-subQ` runner artifacts.

## Status Interpretation

- `PASS`: regression, typecheck, performance, adapter precheck, and soak-duration gates all passed.
- `FAIL`: at least one software gate failed and needs remediation before hardware rerun.
- `BLOCKED`: software path is green enough to continue, but hardware/runtime prerequisites or the required soak duration are still missing.

## Notes

- The default run is expected to remain `BLOCKED` on hosts without `/dev/snd/seq`, a connected USB-to-DIN adapter, or completed soak evidence.
- Use `--required-soak-seconds 0` only for logic-only smoke validation. Do not use that override when collecting close-out evidence for `T066-subR`.
