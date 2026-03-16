# Tesira Parity HIL Precheck Runbook

Date: 2026-03-15
Scope: `T072` prerequisite capture for the live Tesira full-parity HIL certification matrix

## Purpose

Run one repeatable command that captures the minimum lab-readiness signals for `T072`:

- Tesira fleet connectivity
- AVB discovered-entity presence
- active AVB stream presence
- host AVB PTP lock plus Tesira fleet PTP topology

This runner does not close `T072` by itself. It replaces the manual curl bundle and tells you whether the lab is ready for the real parity session.

## Preconditions

Before running the script, confirm all of the following:

- MAP2 backend is reachable at `http://127.0.0.1:8080`
- Tesira fleet is configured in MAP2 and the target devices are expected to appear in `/api/tesira/devices`
- AVB/PTP services are running on the intended host interface

If those prerequisites are missing, the runner exits `2` and records `BLOCKED`.

## Command

```bash
python3 scripts/run_t072_tesira_hil_precheck.py \
  --api-base http://127.0.0.1:8080/api \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t072 \
  --min-connected-devices 2 \
  --min-avb-discovered-devices 1 \
  --min-active-streams 1 \
  --accepted-ptp-states MASTER,SLAVE
```

Optional device scoping:

```bash
python3 scripts/run_t072_tesira_hil_precheck.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t072 \
  --device-ids tesira_03663791,tesira_03112023
```

## Outputs

The runner writes:

- `t072-hil-precheck.json`
- `t072-hil-precheck.md`

Expected artifact directory:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/t072/`

## Exit Codes

- `0`: T072 prerequisites are present and the live HIL matrix can begin
- `1`: runner failure (unexpected API/contract error)
- `2`: prerequisites are still blocked

## Gate Interpretation

- `tesira_control_ready`:
  - `PASS` only when the scoped Tesira device set is present and connected
- `avb_discovery_ready`:
  - `PASS` only when AVB discovered-device count meets the configured threshold
- `avb_stream_ready`:
  - `PASS` only when active AVB streams meet the configured threshold
- `ptp_lock_ready`:
  - `PASS` only when host AVB PTP state and selected Tesira node states are in the accepted lock set

## Current Host Note

Recent evidence on the coding host shows `2` connected Tesira devices but `0` discovered AVB entities, `0` streams, and host PTP state `INITIALIZING`. On this host, the runner is expected to exit `BLOCKED` until the AVB/PTP lab topology is live under load.
