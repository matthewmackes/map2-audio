# Carbon Integrated Home Conformance

Date: 2026-03-22
Task IDs: T269, T269-subA, T269-subB, T269-subC
Contributor: Codex
Status: Complete

## Scope

This record covers the integrated MAP2 home route family:

- `/`
- `/platforms/:workspace`
- `/labs`
- `/artifacts`
- `/artifacts/discover`

## Carbon References

- UI shell header: https://carbondesignsystem.com/components/UI-shell-header/usage/
- Tile: https://carbondesignsystem.com/components/tile/usage/
- Data table: https://carbondesignsystem.com/components/data-table/usage/
- Modal: https://carbondesignsystem.com/components/modal/usage/
- Dialog pattern: https://carbondesignsystem.com/patterns/dialog-pattern/
- 2x Grid: https://carbondesignsystem.com/elements/2x-grid/usage/
- Themes: https://carbondesignsystem.com/elements/themes/overview/

## Route Matrix

| Route | Carbon pattern applied | Result |
| --- | --- | --- |
| `/` | Product overview, grid-aligned tile workspace, restrained brand treatment | Canonical MAP2 integrated home with direct entry to Platforms, Audio Artifacts, Audio Grid, MIDI Hub, and Labs |
| `/platforms/:workspace` | Route-native workspace in the integrated shell | Replaces the former persistent platform modal host with deep-linkable Carbon shell content |
| `/labs` | Route-native catalog surface in the integrated shell | Replaces the Labs section of the former modal host with a first-class routed workspace |
| `/artifacts` | Side navigation + data table + inline context tiles | Replaces the former separate purple subsystem and fixed overlay drawers |
| `/artifacts/discover` | Embedded discovery workspace inside the routed shell | Replaces the former large discovery modal with route-native content |

## Conformance Summary

### 1. Component selection

- Carbon components are the primary UI primitives for the integrated route family: `Layer`, `SideNav`, `SideNavLink`, `Tile`, `DataTable`, `Pagination`, `Select`, `Tag`, `OverflowMenu`, `Modal`, and `ToastNotification`.
- The Audio Artifacts empty-state scan affordance now uses Carbon overflow menu items instead of a bespoke toggle menu.
- Platforms and Labs no longer depend on a long-lived modal host for normal operation.

### 2. Typography and tokens

- The integrated routes now rely on Carbon text, border, layer, icon, and interactive tokens instead of the prior custom purple accent palette.
- The Audio Artifacts library and discovery workspaces no longer use parallel hard-coded color values.
- Product copy remains sentence case and action labels are explicit.

### 3. Theme, layering, and grid

- The integrated route family remains within the Carbon productive shell and theme stack already established by the application.
- Home, Platforms, Labs, and Artifacts all render inside the same routed shell contract instead of mixing hero, modal, and standalone subsystem patterns.
- Audio Artifacts now uses inline layered context regions instead of fixed-position drawers.

### 4. Pattern conformance

- Upload and delete confirmation remain short-lived Carbon modals.
- Artifact discovery is now a routed embedded workspace, which aligns with Carbon dialog guidance for longer, browse-heavy workflows.
- Platform and Labs workspaces are routed content rather than modal content.

### 5. Accessibility and responsive behavior

- Focusable navigation is explicit on all touched surfaces: workspace tiles, shell links, artifact sidenav links, table actions, sync queue controls, and route return actions.
- The Audio Artifacts mobile layout now swaps the left sidenav for a Carbon `Select` and stacks the context column below the table area.
- Decorative icons in touched surfaces remain `aria-hidden`, and meaningful controls keep accessible labels via Carbon button/icon-description APIs.

### 6. AI and branding

- No new AI-labelled surfaces were introduced in this route family, so the Carbon for AI checklist items are not applicable to T269.
- MAP2 branding remains restrained and does not add restricted IBM brand marks.

## Validation Evidence

### Commands

- `npm --prefix web run typecheck`
- `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx web/src/app/App.platformRoute.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/pages/HomePage.test.tsx`
- `npm --prefix web run build`

### Screenshot evidence

- `docs/design/evidence/t269-home-desktop.png`
- `docs/design/evidence/t269-platforms-desktop.png`
- `docs/design/evidence/t269-labs-desktop.png`
- `docs/design/evidence/t269-artifacts-desktop.png`
- `docs/design/evidence/t269-artifacts-discover-desktop.png`
- `docs/design/evidence/t269-artifacts-mobile.png`

## Exceptions

None recorded for T269. The touched integrated-home surfaces now follow the Carbon shell, routing, table, tile, modal, and discovery pattern expectations defined by `docs/design/CARBON_CONFORMANCE_STANDARD.md`.
