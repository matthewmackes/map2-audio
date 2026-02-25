# SynthForge T010 Tier A Soak Validation (2026-02-24)

## Goal

Execute sustained SynthForge stress profiling at Tier A settings (`48kHz`, `64` buffer) for `>=30 minutes`, capture callback timing + xrun + CPU headroom behavior, and provide explicit pass/fail outcomes.

## Command

```bash
cd /home/mm/map2-audio
./scripts/run_synthforge_tier_a_soak.py \
  --duration-seconds 1800 \
  --sample-interval-seconds 1 \
  --phase-seconds 5 \
  --log-every-seconds 60 \
  --output-json docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.json
```

## Result Summary

- Duration target: `1800s`
- Duration actual: `1800.197s`
- Samples captured: `1797`
- Device: `Default ALSA Output (currently PipeWire Media Server)`
- Final xrun count: `2579`
- Overall status: `FAIL` (meets CPU headroom and budget-utilization targets, fails xrun/jitter targets)

## Threshold Checks

- Xruns `<= 0`: `FAIL` (`2579`)
- Min headroom `>= 30%`: `PASS` (`36.62%` minimum observed)
- Peak callback jitter `<= 0.2ms`: `FAIL` (`38.40ms` observed)
- Peak budget utilization `<= 70%`: `PASS` (`63.42%` observed)
- Voice tracking target coverage: `PASS`
  - Target `8`: `>=target 100.00%`, exact `99.78%`
  - Target `16`: `>=target 99.56%`, exact `99.56%`
  - Target `32`: `>=target 100.00%`, exact `100.00%`
  - Target `64`: `>=target 99.78%`, exact `99.78%`

## Key Metrics

- CPU total percent: min `33.60`, max `63.38`, mean `36.64`
- CPU headroom percent: min `36.62`, max `66.40`, mean `63.36`
- Callback jitter ms: min `0.713`, max `1.452`, mean `0.827`
- Peak callback jitter ms (lifetime peak): `38.401`
- Budget utilization percent: min `33.63`, max `63.42`, mean `36.67`
- Max active voices: `64`
- Max peak voices: `64`
- MIDI injection counters:
  - note-on accepted `5048`, rejected `0`
  - note-off accepted `5048`, rejected `0`

## Interpretation

The callback path and voice-load tracking are functionally stable over a full 30-minute window, but this host misses strict Tier A real-time timing gates due to high xrun accumulation and large worst-case jitter spikes. The next step is host/system real-time tuning and isolation work, then re-running the same soak harness for comparison.

## Artifacts

- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.json`
- Report: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.md`
