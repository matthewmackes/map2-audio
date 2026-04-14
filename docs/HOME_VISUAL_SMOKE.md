# Home Visual Smoke

`T2267` adds a browser-driven screenshot harness for the Carbon home shell.

## What it does

- Builds `web/dist`
- Serves the built app on a local preview port
- Launches headless Chromium through Playwright
- Stubs the shell-facing API and WebSocket contracts needed for deterministic home-shell rendering
- Captures the landing page in both minimal and cinematic modes
- Writes one full-page screenshot per scenario plus a machine-readable run summary

Artifacts are written under `artifacts/visual-smoke/home/<timestamp>/`.

## Install the browser runtime

```bash
npm --prefix web install
npm --prefix web run visual:home-smoke:install
```

If Chromium is missing system libraries on a fresh machine, install the usual Playwright runtime dependencies for that host first and then rerun the install command.

## Run the harness

```bash
npm --prefix web run visual:home-smoke
```

To reuse an existing `web/dist` build:

```bash
npm --prefix web run visual:home-smoke -- --skip-build
```

## Output contract

Each run emits:

- `home-visual-smoke-summary.json`
- `screenshots/*.png`

The summary records the viewport, scenario count, screenshot paths, and any browser-console errors seen while capturing each home-shell scenario.
