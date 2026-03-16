# Tesira Manual Deployment HIL Runbook

Date: 2026-03-15
Scope: `T076` evidence capture for the current manual SageVue deployment workflow

## Purpose

Run one repeatable command that validates the currently supported Tesira deployment path:

- layout exists in the MAP2 catalog
- manual SageVue package ZIP downloads successfully
- package contents are complete (`README`, manifest, TMF)
- target Tesira devices are connected before the upload
- post-upload MAP2 verification can be captured after the operator deploys in SageVue

This runner is intentionally aligned to the product that exists today. MAP2 direct SageVue deployment endpoints are removed; the supported path is manual package download plus operator upload/deploy in SageVue.

## Workflow

1. Run the bundle without `--manual-upload-confirmed` to capture preflight/package evidence.
2. Upload/deploy the generated TMF in SageVue.
3. Rerun the bundle with `--manual-upload-confirmed` to capture post-upload MAP2 verification.

## Preflight Command

```bash
python3 scripts/run_t076_manual_deploy_hil_bundle.py \
  --api-base http://127.0.0.1:8080/api \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t076 \
  --layout-id forte_ci_default \
  --layout-version 1.0.0 \
  --device-ids tesira_03663791,tesira_03112023 \
  --min-connected-devices 2
```

Expected result:

- exit `2`
- package verification passes
- conclusion says the operator must complete manual SageVue upload

## Post-Upload Command

```bash
python3 scripts/run_t076_manual_deploy_hil_bundle.py \
  --api-base http://127.0.0.1:8080/api \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t076 \
  --layout-id forte_ci_default \
  --layout-version 1.0.0 \
  --device-ids tesira_03663791,tesira_03112023 \
  --min-connected-devices 2 \
  --min-active-streams 1 \
  --accepted-ptp-states MASTER,SLAVE \
  --manual-upload-confirmed
```

## Outputs

The runner writes:

- `t076-manual-deploy-hil-summary.json`
- `t076-manual-deploy-hil-summary.md`
- `packages/*.zip` for each selected device

Expected artifact directory:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/t076/`

## Exit Codes

- `0`: all current-workflow T076 gates passed
- `1`: runner failure (unexpected API/contract error)
- `2`: evidence is still blocked or waiting on the manual upload step

## Gate Interpretation

- `manual_upload_mode_ready`:
  - `PASS` only when MAP2 advertises manual-upload mode for SageVue
- `layout_catalog_ready`:
  - `PASS` only when the requested layout/version is present
- `target_devices_ready`:
  - `PASS` only when the scoped Tesira devices are present and connected
- `manual_package_ready`:
  - `PASS` only when each downloaded ZIP contains the README, manifest, and TMF
- `manual_upload_execution`:
  - `PASS` only on the rerun after the operator has actually deployed in SageVue
- `post_upload_verification`:
  - `PASS` only when the selected devices remain connected and satisfy the configured AVB/PTP thresholds after the upload

## Current Host Note

This coding host can validate package generation and MAP2-side readiness, but final T076 closure still requires a real SageVue/manual deployment session on live Tesira hardware.
