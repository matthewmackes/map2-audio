---
name: juce-random-effects-soak
description: Run a full JUCE callback-path soak using 10 random native effects at once, rotating serial/parallel flow topologies and blend strategies between flows while collecting xrun, jitter, and CPU evidence. Use when validating engine stability after graph/device/lifecycle changes, reproducing post-start_audio regressions, or generating release-grade performance proof.
---

# JUCE Random Effects Soak

Run the script in this skill to execute a long-duration JUCE soak with:
- exactly 10 randomly selected effects active per flow epoch
- rotating chain and parallel flow layouts
- rotating blend behavior between flows
- artifact capture for pass/fail evidence

## Workflow

1. Build the JUCE engine module in Release mode.
2. Run a smoke soak first.
3. Run the full soak profile.
4. Review generated JSON and markdown evidence.

## Commands

Smoke run:

```bash
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 180 \
  --flow-rotation-seconds 12 \
  --sample-interval-seconds 0.5 \
  --reset-stats-after-warmup
```

Full run:

```bash
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 1800 \
  --flow-rotation-seconds 20 \
  --sample-interval-seconds 1.0 \
  --reset-stats-after-warmup \
  --threshold-max-xruns 0 \
  --threshold-max-peak-jitter-ms 0.35 \
  --threshold-max-budget-utilization-percent 80
```

Aggressive crash-repro variant (live rewire while callback is running):

```bash
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 600 \
  --flow-rotation-seconds 8 \
  --live-rewire
```

## Required Outputs

- JSON artifact with samples, flow transitions, selected effects, and checks
- Markdown summary with PASS/FAIL verdict and thresholds
- Stable callback behavior through repeated graph rewires

Default output path:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/juce-random-fx-soak-<timestamp>.{json,md}`

## Adjustment Rules

- Keep `10` active effects per flow epoch.
- Keep flow rotation enabled; do not run static topology for this skill.
- Keep blend strategy rotation enabled between flow epochs.
- Default to safe rewire mode (stop/start audio around graph rewires); enable `--live-rewire` only when intentionally probing race/crash behavior.
- Use `--reuse-effects` only for focused callback-only triage where plugin load/unload churn is intentionally excluded.

## References

- Flow and blend definitions: `references/flow-and-blend-spec.md`
