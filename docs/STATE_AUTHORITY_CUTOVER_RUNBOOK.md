# State Authority Cutover Runbook

`T778-subB` closes the database side of the MAP2 State Authority cutover by making three points explicit:

1. Fresh-start qualification must run against a new SQLite file, not the live production database.
2. The canonical snapshot payload is the graph document stored in `snapshots.document`.
3. Several `snapshot_*` tables still exist on fresh-start databases, but they are now compatibility projections rather than the intended source of truth.

## Fresh-Start Reset Path

Use a brand-new database path for cutover verification. Do not run the audit against the production `data/map2.db` file.

```bash
export MAP2_DATABASE_PATH=/tmp/map2-state-authority-cutover.db
python3 scripts/run_t778_state_authority_cutover_audit.py \
  --output-dir /tmp/t778-state-authority-cutover-audit
```

The audit creates the fresh-start database, inspects the resulting schema, and emits:

- `t778-state-authority-cutover-report.json`
- `T778_STATE_AUTHORITY_CUTOVER_REPORT.md`

## Table Classification

Core State Authority tables:

- `snapshots`
- `snapshot_revisions`
- `state_authority_assets`

Compatibility-only snapshot projection tables:

- `snapshot_chains`
- `snapshot_channels`
- `snapshot_chain_plugins`
- `snapshot_loop_insertions`
- `snapshot_routing`
- `snapshot_midi_maps`

Operational snapshot/runtime tables:

- `snapshot_deployments`
- `snapshot_deployment_history`
- `snapshot_node_live_state`
- `snapshot_activation_events`

Retired tables that must stay absent:

- `snapshot_session_notes`

## Cutover Contract

- `SnapshotService.get_snapshot()` should rebuild detail from `snapshots.document` whenever a valid State Authority document is present.
- Compatibility mutation routes that still write `snapshot_*` rows must immediately re-sync `snapshots.document` after each mutation.
- Fresh-start audits should treat the compatibility projection tables as blockers for full relational-table retirement, but not as blockers for document-authority qualification.

## Validation Gate

Run the focused State Authority workflow tests plus the fresh-start audit regression:

```bash
pytest -q \
  tests/test_state_authority_snapshot_workflows.py \
  tests/test_t778_state_authority_cutover_audit.py \
  tests/test_t778_state_authority_qualification_runner.py
```

The cutover is qualified when:

- The document-backed workflow tests pass.
- The audit reports all core tables present.
- `snapshot_session_notes` stays absent.
- The audit explicitly lists the remaining compatibility projection tables as the only blockers for full table retirement.
