# TUI Deployment Guide

This guide covers deployment and verification of the unified MAP2 Textual console.

## Primary Entrypoint

The product entrypoint is [tui/app.py](/home/mm/map2-audio/tui/app.py):

```bash
python3 -m tui.app
```

Compatibility launch paths still route into the same host shell:

```bash
python3 -m tui.node_console
python3 -m tui.apps.cluster_management_app
./map2.sh
./m2.sh
./map2-info
```

## Pre-Deployment Checks

```bash
cd /home/mm/map2-audio
python3 -m py_compile \
  tui/screens/__init__.py \
  tui/screens/chains_manager_screen.py \
  tui/screens/midi.py \
  tui/tests/test_unified_console_app.py \
  tui/tests/test_widget_export_smoke.py

pytest -q \
  tui/tests/test_unified_console_app.py \
  tui/tests/test_unified_poll_and_api.py \
  tui/tests/test_workflows.py \
  tui/tests/test_widget_export_smoke.py \
  tests/test_system_node_install_routes.py \
  tests/test_avb_setup_routes.py \
  tests/test_branding_shell.py
```

## Rollout Steps

1. Back up the current checkout or create a release tag.
2. Verify the focused unified-console validation suite passes.
3. Launch `python3 -m tui.app` locally and confirm startup lands on onboarding for first run or `Dashboard` for returning users.
4. Verify `Ctrl+K`, `Ctrl+Z`, `Ctrl+U`, route navigation, and one native workflow action.
5. Confirm compatibility entrypoints still route into the same host shell.

## Rollback

If rollout needs to be reversed, use normal git-based rollback for the feature branch or release tag. Do not restore deleted legacy TUI modules by hand; the unified host should be rolled back as one coherent unit.

## Operator Verification

- Header shows product, version, user, environment, workspace, connection state, and pending jobs.
- Left navigation exposes grouped sections only.
- Command palette opens with `Ctrl+K`.
- Suspending with `Ctrl+Z` returns cleanly to shell and `fg` restores the app.
- Theme cycling persists between launches.
- Workflow actions log progress in the shared runtime panel.

## Current Status

- Unified host refactor `T050`: complete
- Carbon/style migration `T050-subG`: complete
- Validation/cutover evidence `T050-subK`: complete

For the detailed architecture and validation summary, see [docs/TUI_UNIFIED_CONSOLE_VALIDATION_REPORT.md](/home/mm/map2-audio/docs/TUI_UNIFIED_CONSOLE_VALIDATION_REPORT.md).
