# Snapshot Activation Proof (2026-04-04T19:22:05+00:00)

## Profile
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Audio device: `Default ALSA Output`
- Effect count: `10`
- Transition sequence: `['A', 'S', 'B', 'S']`

## Overall
- Status: `PASS`
- Final xrun count: `0`
- Peak callback jitter ms: `0.02685766666666667`
- Peak activation elapsed ms: `109.95686499518342`

## Checks
- Xruns <= 0: `PASS`
- Peak callback jitter <= 0.35 ms: `PASS`
- All runtime states live: `PASS`
- Same-topology reuse observed: `PASS`
- Topology mutation observed on changed topology: `PASS`

## Key Metrics
- Activation elapsed ms (min/max/mean): `{'min': 56.555365008534864, 'max': 109.95686499518342, 'mean': 75.38648525223834}`
- Callback jitter ms (min/max/mean): `{'min': 0.014363666666666663, 'max': 0.02685766666666667, 'mean': 0.020838583333333327}`
- Topology last mutation duration ms (min/max/mean): `{'min': 0.013141, 'max': 0.01739, 'mean': 0.015616749999999999}`
- Same-topology deltas: `[{'from': 'A', 'to': 'S', 'topology_reused': True, 'mutation_count': 0, 'no_op_skip_count': 0}]`
- Changed-topology deltas: `[{'from': 'S', 'to': 'B', 'topology_reused': False, 'mutation_count': 1, 'no_op_skip_count': 0}, {'from': 'B', 'to': 'S', 'topology_reused': False, 'mutation_count': 1, 'no_op_skip_count': 0}]`

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260404/snapshot-activation-proof-20260404T192201Z.json`
