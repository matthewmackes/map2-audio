# State Authority Cutover Current Host 2026-04-07

This document captures the current-host `T778-subB` evidence for the fresh-start MAP2 State Authority database cutover.

## Current-Host Audit Bundle

- Audit command: `python3 scripts/run_t778_state_authority_cutover_audit.py --output-dir /tmp/t778-state-authority-cutover-20260407-2028`
- Fresh-start database: `/tmp/t778-state-authority-cutover-20260407-2028/t778-state-authority-cutover.db`
- JSON report: `/tmp/t778-state-authority-cutover-20260407-2028/t778-state-authority-cutover-report.json`
- Markdown report: `/tmp/t778-state-authority-cutover-20260407-2028/T778_STATE_AUTHORITY_CUTOVER_REPORT.md`

## Results

- Core State Authority tables present: `snapshots`, `snapshot_revisions`, `state_authority_assets`
- Compatibility projection tables present: `snapshot_chains`, `snapshot_channels`, `snapshot_chain_plugins`, `snapshot_loop_insertions`, `snapshot_routing`, `snapshot_midi_maps`
- Operational snapshot tables present: `snapshot_deployments`, `snapshot_deployment_history`, `snapshot_node_live_state`, `snapshot_activation_events`
- Support tables present: `schema_migrations`
- Retired table absent as expected: `snapshot_session_notes`
- Audit retirement status: `blocked`

## Cutover Contract Verified Here

- `SnapshotService.get_snapshot()` now reconstructs detail from `snapshots.document` whenever a valid State Authority document exists.
- Compatibility mutation paths that still write the relational `snapshot_*` projection now re-sync `snapshots.document` after each mutation.
- Focused workflow coverage proved that snapshot detail and summary reads still succeed after manually deleting the compatibility projection rows, which is the evidence that the graph document can carry the authoritative snapshot payload on its own.

## Remaining Retirement Blocker

Full relational snapshot-table retirement is still blocked because the following compatibility projection tables remain present on fresh-start databases:

- `snapshot_chains`
- `snapshot_channels`
- `snapshot_chain_plugins`
- `snapshot_loop_insertions`
- `snapshot_routing`
- `snapshot_midi_maps`

Those tables are still required for the compatibility API/runtime projection layer. Future work should remove the remaining consumers before claiming complete relational-table retirement.

## Validation

- `pytest -q tests/test_state_authority_snapshot_workflows.py tests/test_t778_state_authority_cutover_audit.py tests/test_t778_state_authority_qualification_runner.py` -> PASS (`14 passed`)
- `PYTHONPYCACHEPREFIX=/tmp/map2-pyc python3 -m py_compile app/services/snapshot_service.py scripts/run_t778_state_authority_cutover_audit.py tests/test_state_authority_snapshot_workflows.py tests/test_t778_state_authority_cutover_audit.py tests/test_t778_state_authority_qualification_runner.py` -> PASS
- `git diff --check` -> PASS
