# Tesira Effects Loops HIL Runbook

Date: 2026-03-14
Scope: `T030` qualification for latency and 8-loop churn stability

## Purpose

Execute the Tesira effects-loop HIL gate with one repeatable command path that:

- verifies minimum topology readiness (`>=8` loops)
- captures engine-backed loop calibration and added-latency evidence
- runs a bypass-churn qualification loop across the selected topology
- emits JSON and markdown artifacts suitable for `docs/fit-for-purpose-evidence/<YYYYMMDD>/t030/`

## Preconditions

Before running the script, confirm all of the following:

- Tesira hardware and AVB topology are online
- `/api/effects-loops` returns at least `8` usable loops
- each selected loop has `send_endpoint_id` and `return_endpoint_id`
- AVB/PTP prerequisites are green enough that loop activation succeeds
- the engine exposes real loop calibration (`engine_calibration=true`)

If those prerequisites are missing, the runner will exit `2` and record `BLOCKED`.

## Command

```bash
python3 scripts/run_effects_loops_hil_qualification.py \
  --api-base http://127.0.0.1:8080/api \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t030 \
  --min-loops 8 \
  --latency-threshold-ms 0.5 \
  --churn-cycles 20 \
  --sleep-seconds 0.2
```

Optional explicit loop set:

```bash
python3 scripts/run_effects_loops_hil_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t030 \
  --loop-ids loop_a,loop_b,loop_c,loop_d,loop_e,loop_f,loop_g,loop_h
```

## Outputs

The runner writes:

- `t030-hil-summary.json`
- `T030_EFFECTS_LOOPS_HIL_SUMMARY.md`

Expected artifact directory:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/t030/`

## Exit Codes

- `0`: all T030 gates passed
- `1`: at least one executable gate failed
- `2`: gate execution was blocked by missing topology or missing real calibration evidence

## Gate Interpretation

- Minimum topology gate:
  - `PASS` only when `>=8` loops are present in the selected topology
- Latency gate:
  - `PASS` only when all selected loops activate successfully, return real `engine_calibration=true`, and stay within `0.5ms`
  - `BLOCKED` if topology exists but the calibration path is not producing real engine-backed measurements
- Churn soak gate:
  - `PASS` only when all configured bypass operations complete without failure

## Current Host Note

The current coding host has repeatedly returned `count=0` from `/api/effects-loops`, so this runner is expected to exit `BLOCKED` here until live Tesira/effects-loop topology is connected.
