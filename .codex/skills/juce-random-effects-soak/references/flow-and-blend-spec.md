# Flow And Blend Spec

## Purpose

Define the exact topology and blend behavior used by `run_juce_random_fx_soak.py`.

## Active Effect Count

- Keep exactly `10` effects active per flow epoch.
- Select effects randomly from the pool per epoch unless `--reuse-effects` is set.

## Flow Templates

Each template consumes exactly 10 effect instances.

1. `serial4_parallel3x3`
- Serial chain nodes: 4
- Parallel groups: one 2-branch group with 3 and 3 effects

2. `serial2_parallel4x4`
- Serial chain nodes: 2
- Parallel groups: one 2-branch group with 4 and 4 effects

3. `parallel5x5`
- Serial chain nodes: 0
- Parallel groups: one 2-branch group with 5 and 5 effects

4. `parallel3x2_then3x2`
- Serial chain nodes: 0
- Parallel groups: two sequential 2-branch groups, each sized 3 and 2

## Blend Types

Blend type rotates when the flow template rotates.

1. `hard_a`
- Constant A-side blend (`0.0`)

2. `hard_b`
- Constant B-side blend (`1.0`)

3. `step_ab`
- Alternates between `0.0` and `1.0` every second

4. `triangle`
- Triangle sweep over the flow epoch

5. `sine`
- Sinusoidal sweep over the flow epoch

6. `random_jump`
- Random blend value each blend update step

## Expected Evidence

- Flow-event log includes template, blend type, active effects, and apply failures.
- Sample log includes callback jitter, xruns, CPU, budget utilization, and blend value.
- Summary contains threshold checks and overall pass/fail verdict.
