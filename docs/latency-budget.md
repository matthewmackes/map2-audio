# MAP2 Latency Budget and Release Evidence Gates

This is the canonical latency/performance budget for MAP2 release decisions.

The machine-readable source of truth is [latency-budget.json](/home/mm/map2-audio/docs/latency-budget.json). Evidence artifacts are checked with [check_latency_budget.py](/home/mm/map2-audio/scripts/check_latency_budget.py).

## Why this exists

`T081-subF` found that MAP2's performance story is limited more by measurement discipline than by obvious raw DSP incapability. This budget makes release expectations explicit instead of implicit.

## Budget scopes

### `config-baseline`

Purpose: confirm that the shipped backend service still targets the canonical Tier-A operating point.

Required metrics:

- `sample_rate_hz == 48000`
- `buffer_size_samples <= 64`
- `nominal_buffer_ms <= 1.34`

### `release-smoke`

Purpose: short release-gating sanity check after startup.

Required metrics:

- `sample_rate_hz == 48000`
- `buffer_size_samples <= 64`
- `steady_state_xruns <= 0`
- `callback_jitter_p99_ms <= 0.4`
- `engine_start_ready_seconds <= 60`

### `soak-30m`

Purpose: release-grade 30 minute stability evidence on the main audio path.

Required metrics:

- `sample_rate_hz == 48000`
- `buffer_size_samples <= 64`
- `steady_state_xruns <= 0`
- `callback_jitter_p99_ms <= 0.35`
- `callback_jitter_p999_ms <= 0.75`
- `cpu_peak_percent <= 85`

## Current baseline artifact

The initial baseline artifact is [latency-budget-baseline.json](/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260310/t091/latency-budget-baseline.json). It captures the shipped backend service operating point from [map2-backend.service](/home/mm/map2-audio/systemd/map2-backend.service), not a live soak.

## Checking evidence

```bash
python3 scripts/check_latency_budget.py \
  --evidence docs/fit-for-purpose-evidence/20260310/t091/latency-budget-baseline.json
```

Optional summary output:

```bash
python3 scripts/check_latency_budget.py \
  --evidence docs/fit-for-purpose-evidence/20260310/t091/latency-budget-baseline.json \
  --summary-out docs/fit-for-purpose-evidence/20260310/t091/latency-budget-baseline-summary.json
```

## Recommended evidence sources for future gates

- `pytest tests/test_juce_engine_audio_start_stability.py tests/test_avb_service_engine_contract.py -q`
- Existing soak evidence under `docs/fit-for-purpose-evidence/20260224/`
- Existing xrun/jitter gap analysis under `docs/fit-for-purpose-evidence/20260308/t063/`
- Any future random-effects soak or release qualification artifacts should emit JSON in the same shape as the baseline artifact so the checker can evaluate them directly.

## Release rule

A release candidate should not be called latency-qualified unless:

1. `config-baseline` passes.
2. `release-smoke` passes on the current build.
3. `soak-30m` passes on the intended runtime profile.
4. Any waiver is documented explicitly in the release evidence bundle.
