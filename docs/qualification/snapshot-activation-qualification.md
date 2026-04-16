# Snapshot Activation Qualification

Last updated: 2026-04-16

This document tracks the executable qualification slices for `T2298`.

## Automated coverage shipped

| Qualification case | Evidence |
| --- | --- |
| Retry after degraded authority confirmation failure | `tests/test_snapshot_activation_qualification.py::test_activation_qualification_retry_recovers_after_degraded_authority_confirmation` |
| Repeating activation of the same snapshot keeps the success contract stable | `tests/test_snapshot_activation_qualification.py::test_activation_qualification_repeating_same_snapshot_keeps_success_contract_stable` |
| Overlapping activation attempts for the same snapshot stay serialized and keep event history coherent | `tests/test_snapshot_activation_qualification.py::test_activation_qualification_overlapping_same_snapshot_attempts_keep_history_coherent` |
| Overlapping activation attempts for different snapshots leave the later snapshot live | `tests/test_snapshot_activation_qualification.py::test_activation_qualification_overlapping_different_snapshots_leave_latest_snapshot_live` |
| Runtime success followed by committed-state failure | `tests/test_snapshot_service.py::test_activate_snapshot_records_authority_confirmation_failure_after_runtime_live` |
| Runtime success with authority confirmation unavailable after `desired` refresh only | `tests/test_snapshot_service.py::test_activate_snapshot_degrades_when_authority_confirmation_capabilities_are_unavailable` |

## Current command set

```bash
python3 -m pytest -q tests/test_snapshot_activation_qualification.py
python3 -m pytest -q tests/test_snapshot_service.py -k 'authority_confirmation_failure_after_runtime_live or authority_confirmation_capabilities_are_unavailable'
python3 -m pytest -q tests/test_snapshot_runtime_state_progress.py -k authority_publication
```

## Remaining qualification gaps

- Restart/crash after runtime apply but before committed/observed authority confirmation.
- Runtime success without observation publication followed by retry/repair and stale-read windows.
- Reconciliation overwrite attempts and proof that later reconciliation does not silently erase a newer authority contract.
- Archived fault-injection procedure and operator evidence expectations for release qualification.
