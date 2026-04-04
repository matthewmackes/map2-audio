# Snapshot Activation Proof (2026-04-04T19:14:17+00:00)

## Profile
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Audio device: `Default ALSA Output`
- Effect count: `10`
- Transition sequence: `['A', 'S', 'B', 'S']`

## Overall
- Status: `FAIL`
- Final xrun count: `0`
- Peak callback jitter ms: `0.024680666666666573`
- Peak activation elapsed ms: `166.06038599275053`

## Checks
- Xruns <= 0: `PASS`
- Peak callback jitter <= 0.35 ms: `PASS`
- All runtime states live: `PASS`
- Same-topology reuse observed: `FAIL`
- Topology mutation observed on changed topology: `PASS`

## Key Metrics
- Activation elapsed ms (min/max/mean): `{'min': 72.75263400515541, 'max': 166.06038599275053, 'mean': 98.13657950144261}`
- Callback jitter ms (min/max/mean): `{'min': 0.024680666666666573, 'max': 0.024680666666666573, 'mean': 0.024680666666666573}`
- Topology last mutation duration ms (min/max/mean): `{'min': 0.012754, 'max': 0.027859, 'mean': 0.01894125}`
- Same-topology deltas: `[{'from': 'A', 'to': 'S', 'mutation_count': 1, 'no_op_skip_count': 0}]`
- Changed-topology deltas: `[{'from': 'S', 'to': 'B', 'mutation_count': 1, 'no_op_skip_count': 0}, {'from': 'B', 'to': 'S', 'mutation_count': 1, 'no_op_skip_count': 0}]`

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260404/snapshot-activation-proof-20260404T191415Z.json`
