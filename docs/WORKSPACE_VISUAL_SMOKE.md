# Workspace Visual Smoke

`T2254` adds a browser-driven screenshot harness for the canonical `/workspace/*` routes.

## What it does

- Builds `web/dist`
- Serves the built app on a local preview port
- Launches headless Chromium through Playwright
- Stubs the API and WebSocket surfaces needed for shell-level rendering
- Visits each canonical workspace route
- Captures one full-page screenshot per route
- Writes a machine-readable run summary alongside the screenshots

Artifacts are written under `artifacts/visual-smoke/workspace/<timestamp>/`.

## Install the browser runtime

```bash
npm --prefix web install
npm --prefix web run visual:workspace-smoke:install
```

If Chromium is missing system libraries on a fresh machine, install the usual Playwright runtime dependencies for that host first and then rerun the install command.

## Run the harness

```bash
npm --prefix web run visual:workspace-smoke
```

To reuse an existing `web/dist` build:

```bash
npm --prefix web run visual:workspace-smoke -- --skip-build
```

## Output contract

Each run emits:

- `workspace-visual-smoke-summary.json`
- `screenshots/*.png`

The summary records the viewport, route count, screenshot paths, and any browser-console errors seen while capturing each route.
