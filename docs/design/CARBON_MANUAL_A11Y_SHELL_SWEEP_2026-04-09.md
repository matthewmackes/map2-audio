# Carbon Manual Shell Accessibility Sweep

Date: 2026-04-09 10:07 EDT  
Canonical task: T855

## Scope

Manual accessibility sweep for the live shell surfaces after the navigation cleanup:

- Window chrome in `web/src/app/layout/AppWindow.tsx`
- Floating launcher and power menu in `web/src/app/layout/ShellLauncherPanel.tsx`
- Shell telemetry readouts in `web/src/app/components/LatencyPressureShellReadout.tsx`
- Taskbar clock in `web/src/app/components/TaskbarClock.tsx`
- Shared shell styling in `web/src/app/layout/AppShell.css`

## Method

1. Source review of live shell semantics against `docs/design/CARBON_CONFORMANCE_STANDARD.md` accessibility rules.
2. Keyboard and focus-path review for launcher open/close, launcher tab loop, and power-menu focus restore.
3. Accessible-name and live-region review for launcher trigger, close affordance, latency readout, and taskbar clock.
4. Deterministic validation:
   - `npm --prefix web test -- --runInBand src/app/layout/AppShell.test.tsx`
   - `npm --prefix web run build`

## Findings

| Surface | Keyboard/focus | Accessible name / semantics | Live status | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| App window close control | Pass | Pass | N/A | PASS | Carbon `Close` icon in `AppWindow.tsx`, existing `aria-label`, AppShell test/build pass |
| Floating launcher trigger and tile menu | Pass | Pass | N/A | PASS | Focus trap + restore in `ShellLauncherPanel.tsx`, `menu` / `menuitem` semantics, AppShell test pass |
| Launcher power menu | Pass | Pass | N/A | PASS | Focus trap + restore in `ShellLauncherPanel.tsx`, `menu` / `menuitem` semantics, AppShell test pass |
| Latency pressure shell readout | Pass | Pass | Pass | PASS | `aria-label` plus polite live-region wrapper in `LatencyPressureShellReadout.tsx` |
| Taskbar clock | Pass | Pass | Pass | PASS | Button labeling plus polite live-region wrapper in `TaskbarClock.tsx` |
| Visible focus treatments on live shell controls | Pass | Pass | N/A | PASS | `AppShell.css` focus-visible rules for launcher button, launcher cards, power-menu items, and window close |

## Remediation links

- Added shared launcher navigation rendering through `web/src/app/layout/NavigationItems.tsx` so the live menu item contract is centralized.
- Added `role="menuitem"` to live launcher links and launcher/power actions in `web/src/app/layout/NavigationItems.tsx` and `web/src/app/layout/ShellLauncherPanel.tsx`.
- Added deterministic focus-regression coverage in `web/src/app/layout/AppShell.test.tsx` for launcher focus entry and trigger restoration.
- No blocking shell accessibility regressions remain in this sweep.
