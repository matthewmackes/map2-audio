# Snapshot Activation Proof (2026-04-04T19:19:40+00:00)

## Profile
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Audio device: `Default ALSA Output`
- Effect count: `10`
- Transition sequence: `['A', 'S', 'B', 'S']`

## Overall
- Status: `FAIL`
- Final xrun count: `1`
- Peak callback jitter ms: `1.1748686666666666`
- Peak activation elapsed ms: `101.88885900424793`

## Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- All runtime states live: `PASS`
- Same-topology reuse observed: `PASS`
- Topology mutation observed on changed topology: `PASS`

## Key Metrics
- Activation elapsed ms (min/max/mean): `{'min': 56.46926999907009, 'max': 101.88885900424793, 'mean': 72.83851000102004}`
- Callback jitter ms (min/max/mean): `{'min': 0.02362333333333333, 'max': 1.1748686666666666, 'mean': 0.31143466666666664}`
- Topology last mutation duration ms (min/max/mean): `{'min': 0.014343, 'max': 0.020694, 'mean': 0.0189735}`
- Same-topology deltas: `[{'from': 'A', 'to': 'S', 'topology_reused': True, 'mutation_count': 0, 'no_op_skip_count': 0}]`
- Changed-topology deltas: `[{'from': 'S', 'to': 'B', 'topology_reused': False, 'mutation_count': 1, 'no_op_skip_count': 0}, {'from': 'B', 'to': 'S', 'topology_reused': False, 'mutation_count': 1, 'no_op_skip_count': 0}]`

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260404/snapshot-activation-proof-20260404T191936Z.json`
