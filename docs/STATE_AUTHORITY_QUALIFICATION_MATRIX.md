# MAP2 State Authority Qualification Matrix

This document is the canonical `T778-subA` runbook for the locked MAP2 State Authority phase-verification matrix.

## Purpose

`T778` is not a single code change. It is the qualification and cutover gate for the State Authority redesign across the already-landed phases `T771` through `T777`. The matrix runner added in `scripts/run_t778_state_authority_qualification.py` converts that gate into a restart-safe artifact bundle instead of relying on scattered test names and worklist notes.

## Default Runner

```bash
python3 scripts/run_t778_state_authority_qualification.py \
  --output-dir /tmp/map2-state-authority-qualification
```

Artifacts:

- `t778-state-authority-qualification-summary.json`
- `T778_STATE_AUTHORITY_QUALIFICATION_SUMMARY.md`
- `phase*/stdout.txt`
- `phase*/stderr.txt`

Exit codes:

- `0`: all phases passed
- `1`: at least one phase failed
- `2`: no phases failed, but at least one phase was blocked by host/tooling conditions

Runtime behavior:

- The runner executes each phase under a bounded timeout and disables external pytest plugin autoload for the subprocess environment.
- If a phase prints a passing pytest summary and then leaves a lingering process behind, the runner records that as a pass with a timeout note instead of stalling the whole matrix indefinitely.

## Locked Matrix

| Phase | Scope | Default evidence command |
| --- | --- | --- |
| 1 | Graph foundation, validation, asset registry | `python3 -m pytest -q tests/test_state_authority_graph.py tests/test_state_authority_snapshot_workflows.py -k 'persists_and_reads_state_authority_document or rejects_invalid_state_authority_document_write or restores_asset_paths_from_state_authority_registry'` |
| 2 | Direct sub-services and route wiring | `python3 -m pytest -q tests/test_state_authority_activation_service.py tests/test_snapshot_routes.py -k 'apply_graph_document_to_engine_builds_document_and_uses_crossfade or apply_graph_document_to_engine_reuses_snapshot_document_when_present or revision_routes_call_state_authority_revision_service_directly or activation_routes_call_state_authority_activation_service_directly'` |
| 3 | Native engine graph import/export/morph | `python3 -m pytest -q tests/test_juce_engine_graph_document.py` |
| 4 | Activation state machine, preflight, hooks, preload | `python3 -m pytest -q tests/test_state_authority_activation_service.py tests/test_state_authority_snapshot_workflows.py tests/test_snapshot_routes.py tests/test_snapshot_runtime_state_progress.py -k 'activate_snapshot_marks_validating_phase_before_preflight_failure or run_activation_hooks_uses_configured_order or snapshot_activation_preflight_blocks_broken_assets_and_preserves_live_snapshot or plan_preload_candidates_for_snapshot_returns_top_three_candidates or get_snapshot_preload_plan_route_returns_top_candidates or tracks_activation_phase_progress or marks_current_phase_failed'` |
| 5 | Reconciliation, live health, observability | `python3 -m pytest -q tests/test_state_authority_reconciliation_service.py tests/test_snapshot_runtime_state_progress.py tests/test_snapshot_routes.py tests/test_observability_policy.py -k 'marks_healthy_when_runtime_matches or applies_targeted_parameter_and_bypass_corrections or requires_reactivation_for_topology_drift or flags_missing_assets or refresh_live_snapshot_health_records_reconciliation_metrics or refresh_live_snapshot_health_skips_reconciliation_within_interval or refresh_live_snapshot_health_reruns_reconciliation_after_interval or cluster_reconciliation_report_summarizes_node_statuses or runtime_reconciliation_routes_delegate_to_runtime_state_service or prometheus_route_exports_state_authority_reconciliation_metrics'` |
| 6 | Templates, live links, portability | `python3 -m pytest -q tests/test_state_authority_snapshot_workflows.py tests/test_snapshot_routes.py -k 'template_crud_and_portability or template_live_link_cascade_preserves_local_overrides or template_bundle_and_community_workflows or template_routes_delegate_to_snapshot_service or template_export_import_bundle_and_community_routes'` |

## Host Notes

- Phase 3 is intentionally native-engine-specific. If the local JUCE build output is missing, the pytest file can report skipped rows while the runner still records a passing command with skip hints. That condition must still be written into `docs/PROJECT_WORKLIST.md` during `T778-subC`.
- If a phase summary records a timeout note, that means the evidence command completed logically but required process reaping on this host. Preserve that note in the `T778-subC` evidence.
- `T778-subA` only codifies the executable matrix and runbook. Fresh-start database cutover proof and legacy-table retirement are handled in later `T778` subtasks.
- Any blocked or failed phase result must be preserved in the worklist before claiming the parent epic complete.
