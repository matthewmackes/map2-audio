# Carbon Drift Audit

Date: 2026-03-11 23:14 EDT
Canonical task: T114-subC
Scope: Detect package/tooling drift, non-Carbon UI systems, custom styling drift, hard-coded design values, and iconography inconsistency.

## 1. Snapshot Findings

- `@carbon/react` is not currently present in `web/package.json`.
- Carbon packages present are currently limited to `@carbon/colors` and `@carbon/icons-react`.
- MUI stack is active and broad (`@mui/material`, `@mui/icons-material`, `@mui/styles`).
- Mixed icon stack is active (`@mui/icons-material`, `@phosphor-icons/react`, limited Carbon icons).
- Custom style assets are broad (`47` CSS files in `web/src`).
- Hard-coded colors/spacings are widespread across app, map2, and pipedal surfaces.

## 2. Drift Matrix (Detection Output)

| Issue | Severity | Evidence | Migration path |
| --- | --- | --- | --- |
| Missing Carbon React runtime (`@carbon/react`) | Critical | `web/package.json` has no `@carbon/react` dependency | **Replace**: add `@carbon/react` and migrate new/touched surfaces to Carbon components first |
| Legacy MUI stack dominates UI controls | Critical | `web/package.json` includes `@mui/material`, `@mui/icons-material`, `@mui/styles`; active usage in pages/components | **Replace + phase**: introduce Carbon primitives, then migrate route-by-route |
| Mixed icon libraries (MUI + Phosphor + Carbon) | High | File-count snapshot: Carbon icons `1`, MUI icons `44`, Phosphor `148` | **Replace**: converge on Carbon/IBM iconography and define explicit exception list |
| Hard-coded color/token values across many files | Critical | High-occurrence files include `web/src/app/pages/LCDPage.tsx`, `web/src/app/pages/AboutPage.tsx`, `web/src/app/pages/LV2PluginsPage.tsx`, `web/src/app/pages/ApiObservatoryPage.css`, `web/src/app/components/ThemeCreatorDialog.tsx` | **Replace**: map values to Carbon tokens/themes; remove literal palette usage |
| Route-scoped bespoke themes override global system | High | `web/src/app/pages/TesiraPage.tsx`, `web/src/app/pages/AvbRoutingPage.tsx` define custom `createTheme()` with per-component overrides | **Wrap then replace**: create Carbon theme/layer bridge then migrate route theme overrides to tokens |
| Custom CSS surface area is large and ungoverned | High | `47` CSS files in `web/src`, including route-level and plugin-card specific CSS | **Retain selectively**: keep layout-specific CSS, replace visual tokens/typography/spacing with Carbon tokens |
| Typography baseline conflicts with Carbon rule | High | `web/package.json` includes `@fontsource/roboto`; `web/public/fonts/Roboto-*.woff2` assets present | **Replace**: adopt IBM Plex and Carbon type tokens as default product typography |
| Parallel legacy UI systems expand conformance scope | Medium | `web/src/map2/components` (`31` files), `web/src/pipedal` (`163` files) | **Phase + classify**: tag each surface as active, legacy-readonly, or migration-required |
| Custom icon components and asset icons bypass token sizing | Medium | `web/src/app/components/icons/fontaudio/*`, extensive `web/public/img/*` icon assets | **Wrap**: standardize icon wrapper sizing/aria and retire or map custom icons where possible |
| Table/form/dialog patterns rely on MUI conventions | High | Representative files: `web/src/app/components/library/InstalledAssetsTable.tsx`, `web/src/app/components/MidiHub/MidiPatchbay.tsx`, `web/src/app/components/PasswordDialog.tsx` | **Replace**: map to Carbon DataTable/Form/Dialog patterns and migrate shared primitives first |
| Accessibility semantics likely inconsistent for decorative icons | Medium | Widespread icon imports with mixed libraries and many icon-heavy controls | **Audit + replace**: enforce decorative `aria-hidden`, add accessible names for meaningful icons |

## 3. Affected File Domains

Primary frontend domains with highest drift risk:

- `web/src/app/pages/*`
- `web/src/app/components/*`
- `web/src/map2/components/*`
- `web/src/pipedal/*`
- `web/src/index.css`, `web/src/styles/mobile.css`, `web/src/styles/responsive.module.css`

Backend contract domains most coupled to UI changes:

- `app/routes/midi_hub.py`
- `app/routes/tesira.py`
- `app/routes/mpx1.py`
- `app/routes/intelfx.py`
- `app/routes/engine.py`

## 4. Recommended Immediate Migration Order

1. Add and baseline `@carbon/react` in `web`.
2. Build shared Carbon-aligned primitives (button/link/input/table/dialog/notification/icon wrapper).
3. Migrate shell-level layout and navigation (`AppShell`, home/navigation catalog, route wrappers).
4. Migrate highest-traffic pages first (`/`, `/overview`, `/engine`, `/presets`, `/plugins`).
5. Migrate specialist route shells (`/tesira/*`, `/mpx1/*`, `/intelfx/*`) after primitive alignment.
6. Triage legacy surfaces (`map2`, `pipedal`) for retain/freeze/migrate decisions.

## 5. Command Trace (Used for this audit)

- Dependency scan: `rg -n '"@mui/material"|"@mui/icons-material"|"@mui/styles"|"@phosphor-icons/react"|"@ariakit/react"|"@carbon/react"|"@carbon/icons-react"|"@carbon/colors"|"@fontsource/roboto"' web/package.json`
- CSS inventory: `find web/src -type f \( -name '*.css' -o -name '*.scss' \)`
- Hard-coded style hotspot scan: `rg -n '#[0-9A-Fa-f]{3,8}\b|rgba?\(' web/src/app web/src/map2 web/src/pipedal`
- Icon import distribution scan: `rg -n "from '@carbon/icons-react'|from '@mui/icons-material'|from '@phosphor-icons/react'" web/src`
- Theme override scan: `rg -n "createTheme\(|ThemeProvider|Mui[A-Za-z]+: \{|styleOverrides" web/src`

