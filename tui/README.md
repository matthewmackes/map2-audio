# MAP2 Terminal Interfaces

The repository now carries two terminal surfaces:

- The legacy Textual console at [app.py](/home/mm/map2-audio/tui/app.py)
- The new standalone Ink TUI at [main.tsx](/home/mm/map2-audio/tui/src/main.tsx)

## Ink TUI

Start the Ink app:

```bash
npm --prefix tui start
```

Useful flags:

```bash
npm --prefix tui start -- --help
npm --prefix tui start -- --api-url http://localhost:8080
npm --prefix tui start -- --no-color
npm --prefix tui start -- --verbose
```

The Ink build and validation commands are:

```bash
npm --prefix tui run build
npm --prefix tui test
```

The implemented screens currently cover `Home`, `Metering`, `CPU`, `Audio Grid`, `PipeWire`, `MIDI Hub`, `Devices`, `MPX1`, `Cluster`, `AVB`, `Tesira`, `Artifacts`, `Settings`, and `Diagnostics`.

The app is designed to remain usable in `80x24`; the smoke suite exercises live render coverage for representative screens against a running backend.

## Textual Console

The local MAP2 Textual console still runs through [app.py](/home/mm/map2-audio/tui/app.py).

## Start

```bash
python3 -m tui.app
```

Compatibility entrypoints still resolve into the same host app:

```bash
python3 -m tui.node_console
python3 -m tui.apps.cluster_management_app
./map2.sh
./m2.sh
./map2-info
```

The Quad Cortex touchscreen clone is a separate standalone entrypoint:

```bash
python3 -m tui.quad_cortex_touchscreen
./map2.sh touchscreen
./map2-touchscreen
```

It now runs against real MAP2 backend services rather than sample rig data. Point it at a backend explicitly when needed:

```bash
python3 -m tui.quad_cortex_touchscreen --api-url http://localhost:8080
MAP2_API_URL=http://localhost:8080 python3 -m tui.quad_cortex_touchscreen
```

Scope notes:

- Touchscreen only, no hardware chassis rendering
- Launches directly into `The Grid`
- Supports `Chain`, `Stomp`, and `Gig View`
- Uses live chain, bypass, save, audio, MIDI, and persisted touchscreen stomp-assignment services
- Carbon-restyled structure, not a faceplate replica
- Design/behavior spec: [docs/design/QUAD_CORTEX_TOUCHSCREEN_TEXTUAL_SPEC.md](/home/mm/map2-audio/docs/design/QUAD_CORTEX_TOUCHSCREEN_TEXTUAL_SPEC.md)

## Operator Model

- One host shell with grouped navigation: `Dashboard`, `Audio`, `Platform`, `Settings`
- Carbon-aligned themes: `carbon-dark` and `carbon-light`
- Built-in command palette via `Ctrl+K`
- Suspend to shell via `Ctrl+Z`, return with `fg`
- Undo standardized on `Ctrl+U`
- First run opens onboarding; returning users land on `Dashboard`

## Structure

- Host app: [tui/app.py](/home/mm/map2-audio/tui/app.py)
- Unified routes: [tui/screens/unified_console.py](/home/mm/map2-audio/tui/screens/unified_console.py)
- Shared base screen model: [tui/base_screen.py](/home/mm/map2-audio/tui/base_screen.py)
- Theme registration: [tui/theme/carbon.py](/home/mm/map2-audio/tui/theme/carbon.py)
- Shared stylesheet: [tui/styles/carbon.tcss](/home/mm/map2-audio/tui/styles/carbon.tcss)
- Command providers: [tui/commands/providers.py](/home/mm/map2-audio/tui/commands/providers.py)
- Poll manager: [tui/poll_manager.py](/home/mm/map2-audio/tui/poll_manager.py)
- Native workflows: [tui/workflows.py](/home/mm/map2-audio/tui/workflows.py)

## Compatibility Notes

- [tui/node_console/app.py](/home/mm/map2-audio/tui/node_console/app.py) and [tui/apps/cluster_management_app.py](/home/mm/map2-audio/tui/apps/cluster_management_app.py) are wrappers, not standalone product shells.
- Legacy duplicated screens, widgets, theme engines, and custom command-palette code were removed during `T050`.

## Validation

Run the focused unified-console suite:

```bash
pytest -q \
  tui/tests/test_unified_console_app.py \
  tui/tests/test_unified_poll_and_api.py \
  tui/tests/test_workflows.py \
  tui/tests/test_widget_export_smoke.py \
  tests/test_system_node_install_routes.py \
  tests/test_avb_setup_routes.py \
  tests/test_branding_shell.py
```

See [DEPLOYMENT_GUIDE.md](/home/mm/map2-audio/tui/DEPLOYMENT_GUIDE.md) for rollout notes and [docs/TUI_UNIFIED_CONSOLE_VALIDATION_REPORT.md](/home/mm/map2-audio/docs/TUI_UNIFIED_CONSOLE_VALIDATION_REPORT.md) for the current architecture and cutover report.
