# T076 Manual Deployment HIL Bundle (2026-03-15T22:37:45Z)

## Summary

- Layout: `forte_ci_avb_bridge_default` v`1.0.0`
- Selected devices: `2`
- Manual upload confirmed: `False`
- Overall status: `BLOCKED`

## Gates

| Gate | Status | Reason |
|---|---|---|
| manual_upload_mode_ready | PASS | Backend reports manual SageVue upload as the supported deployment workflow. |
| layout_catalog_ready | PASS | Layout forte_ci_avb_bridge_default v1.0.0 is present in the catalog. |
| target_devices_ready | BLOCKED | Need at least 2 connected Tesira devices; found 0. |
| manual_package_ready | BLOCKED | Package verification did not run because layout/device preflight was not ready. |
| manual_upload_execution | BLOCKED | Manual SageVue upload/deploy has not been confirmed yet; rerun with --manual-upload-confirmed after the lab step. |
| post_upload_verification | BLOCKED | Post-upload verification is skipped until manual upload is confirmed. |

## Conclusion

- Blocked: T076 manual-package preflight or post-upload verification is still missing required evidence.

