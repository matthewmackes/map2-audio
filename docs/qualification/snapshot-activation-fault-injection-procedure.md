# Snapshot Activation Fault-Injection Procedure

Last updated: 2026-04-16

This procedure defines the release-grade archive expected for `T2298` snapshot activation qualification.

## Artifact root

Create one timestamped archive per qualification run:

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_ROOT="docs/qualification/evidence/snapshot-activation/${STAMP}"
mkdir -p "${ARTIFACT_ROOT}"/{automated,api,logs,notes}
```

Every command below should write into that root with `tee`, redirection, or both.

## Required environment

- Backend API reachable at `http://127.0.0.1:8080`
- Production web surface reachable at `http://127.0.0.1:3000`
- A known snapshot id available for readiness endpoint capture
- Clean worktree or separately archived local diffs if qualifying unshipped work

## Automated fault-injection archive

Run the shipped fault-injection suites and save raw output:

```bash
python3 -m pytest -q tests/test_snapshot_activation_qualification.py \
  | tee "${ARTIFACT_ROOT}/automated/test_snapshot_activation_qualification.txt"

python3 -m pytest -q tests/test_publish_readiness_service.py \
  -k 'authority_confirmation_failure or stale_observation_gap or clarifies_local_only_runtime_blockers or marks_diverged' \
  | tee "${ARTIFACT_ROOT}/automated/test_publish_readiness_service.txt"

python3 -m pytest -q tests/test_snapshot_service.py \
  -k 'authority_confirmation_failure_after_runtime_live or authority_confirmation_capabilities_are_unavailable' \
  | tee "${ARTIFACT_ROOT}/automated/test_snapshot_service_authority_failures.txt"
```

Pass condition:

- All three command outputs end with `PASS` / zero failures.
- The activation qualification output includes the restart retry and later reconciliation cases.

## Runtime/API evidence capture

Capture the live platform state before and after any manual retry/repair exercise:

```bash
SNAPSHOT_ID="<target-snapshot-id>"

curl -s "http://127.0.0.1:8080/api/runtime/live-state" \
  | tee "${ARTIFACT_ROOT}/api/runtime-live-state.json" >/dev/null

curl -s "http://127.0.0.1:8080/api/runtime/activation-events?limit=10" \
  | tee "${ARTIFACT_ROOT}/api/runtime-activation-events.json" >/dev/null

curl -s "http://127.0.0.1:8080/api/runtime/reconciliation" \
  | tee "${ARTIFACT_ROOT}/api/runtime-reconciliation.json" >/dev/null

curl -s "http://127.0.0.1:8080/api/snapshots/${SNAPSHOT_ID}/publish-readiness" \
  | tee "${ARTIFACT_ROOT}/api/publish-readiness.json" >/dev/null
```

If the target snapshot is intentionally left degraded for operator evidence, capture the repair result too:

```bash
curl -s -X POST \
  "http://127.0.0.1:8080/api/snapshots/${SNAPSHOT_ID}/repair/retry_publish" \
  | tee "${ARTIFACT_ROOT}/api/publish-repair-retry.json" >/dev/null

curl -s "http://127.0.0.1:8080/api/snapshots/${SNAPSHOT_ID}/publish-readiness" \
  | tee "${ARTIFACT_ROOT}/api/publish-readiness-after-retry.json" >/dev/null
```

## Log archive

Capture backend and web logs across the qualification window:

```bash
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

journalctl -u map2-backend --since "${SINCE}" --no-pager \
  > "${ARTIFACT_ROOT}/logs/map2-backend.log"

journalctl -u map2-web-prod --since "${SINCE}" --no-pager \
  > "${ARTIFACT_ROOT}/logs/map2-web-prod.log"
```

If a manual degraded run or retry is performed, append a short narrative to `notes/operator-summary.md` describing:

- which snapshot id was used
- which failure family was exercised
- whether `retry_publish` or `recover_local_audio_engine` was invoked
- whether the final state returned to `live_confirmed`

## Evidence matrix

Archive the following proof for each failure family:

| Failure family | Required evidence |
| --- | --- |
| Committed authority write fails after runtime live | `test_snapshot_service_authority_failures.txt`, `runtime-activation-events.json`, `publish-readiness.json` showing `authority_confirmation_failed` |
| Observation publication fails and ages into stale-read window | `test_publish_readiness_service.txt` plus `publish-readiness.json` showing the exact authority-confirmation failure rather than `observation_stale` / `node_sync_pending` |
| Retry after degraded authority confirmation | `test_snapshot_activation_qualification.txt` and, if exercised manually, `publish-repair-retry.json` plus `publish-readiness-after-retry.json` showing recovery |
| Restart-boundary recovery | `test_snapshot_activation_qualification.txt` containing `test_activation_qualification_restart_retry_recovers_after_runtime_live_degrades` |
| Later reconciliation after newer snapshot activation | `test_snapshot_activation_qualification.txt` containing `test_activation_qualification_late_reconciliation_does_not_overwrite_newer_snapshot` and `runtime-reconciliation.json` |

## Release sign-off expectations

Release qualification is complete only when:

- the automated suite archive exists under one timestamped artifact root
- runtime live-state, activation-event, reconciliation, and publish-readiness JSON snapshots are archived
- logs for `map2-backend` and `map2-web-prod` are archived for the same window
- the operator summary names the snapshot ids and any repair actions used
- the archived evidence shows degraded states with exact machine-readable causes and successful retries where expected
