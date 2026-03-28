# MAP2 TUI Status

This is the canonical status file for the `tui/` workspace.

## Current Surfaces

- Legacy Textual console: `tui/app.py`
- Standalone Ink TUI: `tui/src/main.tsx`

## Ink TUI State

- `map2-tui` is the operator-first terminal entrypoint.
- Startup behavior is productized: strict CLI parsing, clean canvas on launch, non-TTY guard, explicit exit controls, and a searchable command palette.
- The primary home screen is `Signal Chains Live`, optimized around one active chain, live meters, clear plugin identity, and instant `1-8` bypass for the first eight plugins in order.
- Active-chain switching is available directly from the rack with `,` and `.` / left-right arrows.
- The shell uses a centralized OLED-friendly palette and remains usable in `80x24`.

## Validation Baseline

- `npm --prefix tui run build`
- `npm --prefix tui test`
- `pytest -q tests/test_branding_shell.py`

## Archived History

Earlier phase snapshots, completion reports, and review-heavy one-off markdown files were moved under `tui/archive/legacy-docs/` so `tui/` root only keeps current operator docs and this canonical status summary.
