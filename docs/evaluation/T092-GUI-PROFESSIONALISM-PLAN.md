# T092 — GUI Professionalism Overhaul

**Date:** 2026-03-10
**Status:** Plan — ready for execution
**Design reference:** IBM Carbon Design System (dark theme), IBM Design Language
**Goal:** Transform MAP2's interface from "ambitious engineer dashboard" to "professional audio control platform" — flat, corporate, semantically precise, operator-trusted

---

## Design philosophy

MAP2 must feel like QSC Q-SYS or Biamp Tesira viewed through a flat corporate lens. Not Material Design. Not Tailwind dashboard. Not creative portfolio. IBM Carbon Dark — purposeful, minimal, typographically precise, state-communicating.

**Core principles (IBM Design Language alignment):**

1. **Be essential** — Every pixel must earn its place. No decorative borders. No glow. No gradient on surfaces.
2. **Be flat** — Zero box-shadow on cards. Zero gradients on surfaces. Elevation via border-top accent or background shade only.
3. **2x Grid** — All spacing in multiples of 8px (the IBM mini unit). Margins, paddings, gaps: 8, 16, 24, 32, 48.
4. **IBM Plex** — Replace Space Grotesk and system fonts with IBM Plex Sans (body/UI) and IBM Plex Mono (data/readouts).
5. **Semantic color** — Color communicates state, not decoration. Interactive blue used exactly once per screen for the primary action.
6. **Type scale** — 6 strict levels. No freestyle font sizes.
7. **Productive spacing** — Dense but not cramped. Carbon "condensed" node spacing.

---

## Phase 0: Font & type scale foundation

### T092-sub00: Install IBM Plex fonts

**Files to modify:**
- `web/index.html` — add Google Fonts link
- `web/src/index.css` — update `--font-family` and all font-family declarations

**Exact steps:**

1. Open `web/index.html`. In the `<head>`, add this line before any CSS:
```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600;700&display=swap" rel="stylesheet">
```

2. Open `web/src/index.css`. Find every instance of the font-family declaration. Replace:
   - `'Space Grotesk'` → remove entirely (delete all references)
   - `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'Roboto', system-ui, sans-serif` → `'IBM Plex Sans', sans-serif`
   - Any monospace font stack (`'SFMono-Regular', 'JetBrains Mono', ...`) → `'IBM Plex Mono', monospace`

3. In the `:root` block of `web/src/index.css`, add these new CSS custom properties (add them after the existing `--transition-speed` line):
```css
/* --- IBM Type Scale (Carbon Productive) --- */
--type-display: 700 28px/36px 'IBM Plex Sans', sans-serif;
--type-heading: 600 20px/28px 'IBM Plex Sans', sans-serif;
--type-subheading: 500 16px/24px 'IBM Plex Sans', sans-serif;
--type-body: 400 14px/20px 'IBM Plex Sans', sans-serif;
--type-label: 500 12px/16px 'IBM Plex Sans', sans-serif;
--type-caption: 400 11px/16px 'IBM Plex Sans', sans-serif;
--type-mono: 400 13px/20px 'IBM Plex Mono', monospace;

/* --- IBM Spacing Scale (2x grid = 8px base) --- */
--spacing-01: 2px;
--spacing-02: 4px;
--spacing-03: 8px;
--spacing-04: 12px;
--spacing-05: 16px;
--spacing-06: 24px;
--spacing-07: 32px;
--spacing-08: 40px;
--spacing-09: 48px;
--spacing-10: 64px;
--spacing-11: 80px;
--spacing-12: 96px;
```

### T092-sub01: Apply type scale globally

**Files to modify:**
- `web/src/index.css` — update all heading, label, body text, and nav text rules

**Exact steps:**

1. Find all `h1` rules in `index.css`. Replace every font property block with:
```css
h1 { font: var(--type-display); color: var(--text-primary); margin: 0 0 var(--spacing-05) 0; }
```

2. Find all `h2` rules. Replace with:
```css
h2 { font: var(--type-heading); color: var(--text-primary); margin: 0 0 var(--spacing-04) 0; }
```

3. Find all `h3` rules. Replace with:
```css
h3 { font: var(--type-subheading); color: var(--text-primary); margin: 0 0 var(--spacing-03) 0; }
```

4. Find the `body` rule. Set:
```css
body { font: var(--type-body); color: var(--text-primary); background: var(--bg); margin: 0; -webkit-font-smoothing: antialiased; }
```

5. Find all `.nav-tab` label text styles. The current rules have `font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em`. Replace with:
```css
font: var(--type-label);
text-transform: none;
letter-spacing: 0;
```

6. Find all `.stat-card .stat-label` or stat label selectors. Set `font: var(--type-caption);`

7. Find all `.stat-card .stat-value` or stat value selectors. Set `font: var(--type-display); font-size: 24px;`

8. Find any hardcoded `font-size: 10px`, `font-size: 11px`, `font-size: 12px`, `font-size: 13px`, `font-size: 14px` in the file that is NOT inside a `@media` rule and is not the type scale definition itself. Replace each with the appropriate `var(--type-*)`:
   - 10px–11px → `font: var(--type-caption);`
   - 12px → `font: var(--type-label);`
   - 13px–14px → `font: var(--type-body);`
   - 16px → `font: var(--type-subheading);`
   - 20px → `font: var(--type-heading);`
   - 26px–28px → `font: var(--type-display);`

---

## Phase 1: Color token system overhaul

### T092-sub02: Redefine CSS custom property palette

**Files to modify:**
- `web/src/index.css` — `:root` block
- `web/src/app/theme/types.ts` — ThemeColors interface
- `web/src/app/theme/themes.ts` — all theme objects

**Rationale:** IBM Carbon Dark uses `$ui-background: #161616`, `$ui-01: #262626`, `$ui-02: #393939`. Surfaces are wider-spaced. Blue is `$interactive-01: #0f62fe`. Status colors are distinct. No glowing borders.

**Exact steps:**

1. In `web/src/index.css`, replace the entire `:root` color variable block with:

```css
:root {
  color-scheme: dark;

  /* --- Surfaces (IBM Carbon Gray 100 scale, wider spread) --- */
  --bg: #161616;
  --surface: #262626;
  --surface-2: #333333;
  --surface-3: #3d3d3d;
  --surface-overlay: #393939;

  /* --- Interactive (one blue, one job) --- */
  --interactive: #0f62fe;
  --interactive-hover: #0353e9;
  --interactive-active: #002d9c;
  --interactive-disabled: #525252;

  /* --- Legacy aliases for compat (map old names to new) --- */
  --primary: var(--interactive);
  --primary-strong: var(--interactive-active);
  --primary-hover: var(--interactive-hover);
  --accent: #78a9ff;
  --focus-ring: #0f62fe;

  /* --- Text (IBM Carbon token names) --- */
  --text-primary: #f4f4f4;
  --text-secondary: #c6c6c6;
  --text-tertiary: #8d8d8d;
  --text-accent: #78a9ff;
  --text-on-color: #ffffff;
  --text-disabled: #525252;

  /* Legacy text aliases */
  --muted: var(--text-secondary);
  --muted-2: var(--text-tertiary);

  /* --- Support / Status (IBM Carbon) --- */
  --support-success: #42be65;
  --support-error: #da1e28;
  --support-warning: #f1c21b;
  --support-info: #4589ff;

  /* Legacy status aliases */
  --success: var(--support-success);
  --danger: var(--support-error);
  --warning: var(--support-warning);

  /* --- Borders (flat, not glowing) --- */
  --border-subtle: #393939;
  --border-strong: #6f6f6f;
  --border-interactive: var(--interactive);
  --border-disabled: #393939;

  /* Legacy border alias */
  --border: var(--border-subtle);

  /* --- Backgrounds for state cards --- */
  --bg-empty: #1e1e1e;
  --bg-offline: rgba(218, 30, 40, 0.08);
  --bg-fault: rgba(218, 30, 40, 0.16);
  --bg-idle: var(--surface);
  --bg-active: rgba(15, 98, 254, 0.08);

  /* --- Shadows: FLAT — zero box-shadow by default --- */
  --shadow-strong: none;
  --shadow-soft: none;

  /* --- Focus --- */
  --focus-outline: 2px solid var(--interactive);
  --focus-inset: 1px solid var(--bg);
}
```

2. In `web/src/app/theme/types.ts`, replace the `ThemeColors` interface with:

```typescript
export interface ThemeColors {
  bg: string;
  surface: string;
  'surface-2': string;
  'surface-3': string;
  'surface-overlay': string;
  interactive: string;
  'interactive-hover': string;
  'interactive-active': string;
  'interactive-disabled': string;
  // Legacy aliases (kept for backward compat, map to interactive)
  primary: string;
  'primary-strong': string;
  accent: string;
  // Text
  'text-primary': string;
  'text-secondary': string;
  'text-tertiary': string;
  // Legacy text aliases
  muted: string;
  'muted-2': string;
  // Support / status
  'support-success': string;
  'support-error': string;
  'support-warning': string;
  'support-info': string;
  // Legacy status aliases
  success: string;
  danger: string;
  warning: string;
  // Borders
  border: string;
  'border-subtle': string;
  'border-strong': string;
  // State backgrounds
  'bg-empty': string;
  'bg-offline': string;
  'bg-fault': string;
  // Shadows (always 'none' in flat themes)
  'shadow-strong': string;
  'shadow-soft': string;
  'color-scheme': 'dark' | 'light';
}
```

3. In `web/src/app/theme/themes.ts`, update the `default` theme to match the new `:root` values above. All other themes must also be updated to include the new keys. For each theme, add these keys using the same pattern — derive `interactive`, `interactive-hover`, `interactive-active` from the theme's current `primary`; add `surface-overlay` between `surface-2` and `surface-3`; add `border-subtle`, `border-strong`; add support colors; add state backgrounds; set shadows to `'none'`.

4. In `web/src/app/theme/types.ts`, update the `ThemeWidgets` interface — change default `border-radius-*` to flat values:
```typescript
export interface ThemeWidgets {
  'border-radius-sm': string;  // default: '0px' (flat)
  'border-radius-md': string;  // default: '0px' (flat)
  'border-radius-lg': string;  // default: '4px' (slight for modals only)
  'border-width': string;
  'surface-gradient': string;  // always 'none'
  'glow-intensity': string;    // always '0'
  'transition-speed': string;
}
```

### T092-sub03: Update default theme widget values to flat

**Files to modify:**
- `web/src/app/theme/themes.ts` — `default` theme `widgets` block

**Exact steps:**

1. In the `default` theme object, replace the `widgets` block:
```typescript
widgets: {
  'border-radius-sm': '0px',
  'border-radius-md': '0px',
  'border-radius-lg': '4px',
  'border-width': '1px',
  'surface-gradient': 'none',
  'glow-intensity': '0',
  'transition-speed': '0.11s'
}
```

2. For all other themes, set `border-radius-sm` and `border-radius-md` to `'0px'`, `border-radius-lg` to `'4px'`, `surface-gradient` to `'none'`, `glow-intensity` to `'0'`. Keep each theme's unique color personality but enforce flat geometry.

---

## Phase 2: Card system overhaul

### T092-sub04: Rewrite `.card` to flat, borderless, state-aware

**Files to modify:**
- `web/src/index.css` — all `.card`, `.stat-card`, `.loader-card` rules

**Exact steps:**

1. Find the `.card` rule block. Replace entirely with:
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  padding: var(--spacing-05);
  box-shadow: none;
  transition: background var(--transition-speed) ease;
}
.card:hover {
  background: var(--surface-2);
}
```

2. Remove any rule that sets `border-color: var(--primary)` on `.card`. Cards must NOT have blue borders by default. Blue borders are reserved ONLY for `.card--selected` or `.card--active`:
```css
.card--selected,
.card.active {
  border-color: var(--interactive);
}
```

3. Add new state-variant card classes immediately after `.card`:
```css
.card--empty {
  background: var(--bg-empty);
  border-color: var(--border-subtle);
  border-style: dashed;
}
.card--empty .card-title,
.card--empty .stat-value {
  color: var(--text-tertiary);
}

.card--offline {
  background: var(--bg-offline);
  border-left: 3px solid var(--support-error);
}

.card--fault {
  background: var(--bg-fault);
  border-left: 3px solid var(--support-error);
}

.card--warning {
  background: rgba(241, 194, 27, 0.08);
  border-left: 3px solid var(--support-warning);
}

.card--success {
  background: rgba(66, 190, 101, 0.08);
  border-left: 3px solid var(--support-success);
}
```

4. Replace the `.stat-card` rule:
```css
.stat-card {
  background: var(--surface);
  padding: var(--spacing-05);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  box-shadow: none;
}
.stat-card .stat-label {
  font: var(--type-caption);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.32px;
  margin-bottom: var(--spacing-02);
}
.stat-card .stat-value {
  font: var(--type-display);
  color: var(--text-primary);
}
```

5. Replace the `.loader-card` rules. Remove all color-variant backgrounds (`.loader-card.nam`, `.loader-card.cabinet`, `.loader-card.reverb`). Replace with:
```css
.loader-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  padding: var(--spacing-05);
  gap: var(--spacing-04);
  box-shadow: none;
}
```

### T092-sub05: Remove all `box-shadow` from cards, panels, and surfaces

**Files to modify:**
- `web/src/index.css` — global search

**Exact steps:**

1. Search `web/src/index.css` for every occurrence of `box-shadow` that is NOT inside a `:focus` or focus-visible rule.
2. For each match:
   - If it is on a card, panel, container, or surface element: set to `box-shadow: none;`
   - If it is on a button `:focus` or `:focus-visible` rule: keep it (focus rings are allowed)
   - If it is on a dialog/modal: set to `box-shadow: none;`
   - If it is a CSS custom property definition (`--shadow-*`): already handled in Phase 1

3. Search all `.css` files in `web/src/` for `box-shadow` and apply the same rule:
```bash
grep -rn "box-shadow" web/src/ --include="*.css" | grep -v "focus" | grep -v ":root"
```
Set all non-focus box-shadows to `none`.

---

## Phase 3: Navigation overhaul

### T092-sub06: Restyle topbar to IBM Carbon header pattern

**Files to modify:**
- `web/src/index.css` — `.topbar-pro` and all nav-tab rules
- `web/src/app/layout/AppShell.tsx` — adjust class names if needed

**Exact steps:**

1. Find the `.topbar-pro` rule block. Replace with:
```css
.topbar-pro {
  position: sticky;
  top: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 var(--spacing-05);
  gap: 0;
}
```

Key changes: fixed 48px height (IBM Carbon header), no gradient, no glow, simple bottom border.

2. Find `.nav-tabs-left` and `.nav-tabs-right`. Replace with:
```css
.nav-tabs-left {
  display: flex;
  align-items: center;
  gap: 0;
  height: 100%;
}
.nav-tabs-right {
  display: flex;
  align-items: center;
  gap: 0;
  height: 100%;
  margin-left: auto;
}
```

3. Find the `.nav-tab` rule (the individual tab links). Replace with:
```css
.nav-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-03);
  height: 100%;
  padding: 0 var(--spacing-05);
  font: var(--type-label);
  color: var(--text-secondary);
  text-decoration: none;
  text-transform: none;
  letter-spacing: 0;
  border: none;
  border-bottom: 3px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: color 0.1s ease, border-color 0.1s ease, background 0.1s ease;
  white-space: nowrap;
}
.nav-tab:hover {
  color: var(--text-primary);
  background: var(--surface-2);
}
.nav-tab.active,
.nav-tab[aria-current="page"] {
  color: var(--text-primary);
  border-bottom-color: var(--interactive);
}
.nav-tab svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
```

This gives: full-height tabs, bottom-border indicator (not glow), readable 12px label, clear active state.

4. Find `.nav-active-title` (center title). Replace with:
```css
.nav-active-title {
  font: var(--type-subheading);
  color: var(--text-primary);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}
```

5. Remove any `text-shadow`, `box-shadow`, or `background: linear-gradient(...)` on the topbar or nav-tab elements.

### T092-sub07: Restyle mobile bottom tabbar

**Files to modify:**
- `web/src/index.css` — `.mobile-bottom-tabbar` rules
- `web/src/styles/mobile.css` — mobile overrides

**Exact steps:**

1. Find `.mobile-bottom-tabbar`. Replace with:
```css
.mobile-bottom-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 8000;
  display: none;
  grid-template-columns: repeat(5, 1fr);
  height: 48px;
  background: var(--surface);
  border-top: 1px solid var(--border-subtle);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
@media (max-width: 768px) {
  .mobile-bottom-tabbar { display: grid; }
}
```

2. Find `.mobile-tab-btn`. Replace with:
```css
.mobile-tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--spacing-02) 0;
  font: var(--type-caption);
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: none;
}
.mobile-tab-btn.active {
  color: var(--interactive);
}
.mobile-tab-btn svg {
  width: 20px;
  height: 20px;
}
```

---

## Phase 4: Button system

### T092-sub08: Rewrite button system to IBM Carbon pattern

**Files to modify:**
- `web/src/index.css` — `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.btn-danger` rules

**Exact steps:**

1. Find all `.btn` rules. Replace the entire button system with:

```css
/* --- Button system (IBM Carbon) --- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-03);
  height: 48px;
  padding: 0 64px 0 var(--spacing-05);
  font: var(--type-body);
  font-weight: 500;
  color: var(--text-on-color);
  background: var(--interactive);
  border: none;
  border-radius: 0;
  cursor: pointer;
  transition: background 0.1s ease;
  position: relative;
  white-space: nowrap;
}
.btn:hover { background: var(--interactive-hover); }
.btn:active { background: var(--interactive-active); }
.btn:disabled {
  background: var(--interactive-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
}
.btn:focus-visible {
  outline: var(--focus-outline);
  outline-offset: -2px;
}

.btn-secondary {
  background: var(--surface-2);
  color: var(--text-primary);
  border: 1px solid var(--interactive);
}
.btn-secondary:hover { background: var(--surface-3); }
.btn-secondary:active { background: var(--surface); }

.btn-ghost {
  background: transparent;
  color: var(--interactive);
  border: none;
  padding: 0 var(--spacing-05);
  height: 48px;
}
.btn-ghost:hover { background: var(--surface-2); }
.btn-ghost:active { background: var(--surface-3); }

.btn-danger {
  background: var(--support-error);
  color: var(--text-on-color);
}
.btn-danger:hover { background: #ba1b23; }
.btn-danger:active { background: #750e13; }

.btn-sm {
  height: 32px;
  padding: 0 var(--spacing-05);
  font: var(--type-label);
}

.btn-lg {
  height: 48px;
  padding: 0 var(--spacing-07);
  font: var(--type-subheading);
}

.btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
```

2. Remove the old `.btn-primary` rule (the base `.btn` is now primary by default, matching Carbon convention).

---

## Phase 5: Badge & pill system

### T092-sub09: Replace pills and badges with IBM Carbon tag pattern

**Files to modify:**
- `web/src/index.css` — `.pill`, `.badge`, maturity badge rules

**Exact steps:**

1. Replace `.pill` and `.badge` rules with:
```css
/* --- Tags (IBM Carbon) --- */
.tag, .pill, .badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-02);
  height: 24px;
  padding: 0 var(--spacing-03);
  font: var(--type-caption);
  font-weight: 500;
  border-radius: 0;
  border: none;
  white-space: nowrap;
}

/* Default: neutral */
.tag, .pill, .badge {
  background: var(--surface-3);
  color: var(--text-primary);
}

/* Status variants */
.tag--success, .pill.success, .badge.success {
  background: rgba(66, 190, 101, 0.16);
  color: var(--support-success);
}
.tag--error, .pill.danger, .badge.danger {
  background: rgba(218, 30, 40, 0.16);
  color: var(--support-error);
}
.tag--warning, .pill.warn, .badge.warn {
  background: rgba(241, 194, 27, 0.16);
  color: var(--support-warning);
}
.tag--info, .pill.info, .badge.info {
  background: rgba(69, 137, 255, 0.16);
  color: var(--support-info);
}

/* Maturity tags */
.maturity-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-02);
  height: 20px;
  padding: 0 var(--spacing-03);
  font: var(--type-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32px;
  border-radius: 0;
}
.maturity-tag--production     { background: rgba(66, 190, 101, 0.16); color: #42be65; }
.maturity-tag--waiver         { background: rgba(69, 137, 255, 0.16); color: #4589ff; }
.maturity-tag--beta           { background: rgba(241, 194, 27, 0.16); color: #f1c21b; }
.maturity-tag--experimental   { background: rgba(190, 132, 252, 0.16); color: #be95ff; }
.maturity-tag--hardware       { background: rgba(218, 30, 40, 0.16); color: #ff8389; }
```

2. Remove the old `border-radius: 999px` on any pill or badge. Flat rectangles only.

---

## Phase 6: Dialog / modal system

### T092-sub10: Restyle dialogs and modals to flat panels

**Files to modify:**
- `web/src/index.css` — `.dialog-backdrop`, `.dialog`, `.notification-panel` rules

**Exact steps:**

1. Replace `.dialog-backdrop`:
```css
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}
```
Remove `backdrop-filter: blur(6px)` — blur is not flat.

2. Replace `.dialog`:
```css
.dialog {
  width: min(520px, 90vw);
  max-height: 85vh;
  overflow-y: auto;
  background: var(--surface-overlay);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-05);
  border-bottom: 1px solid var(--border-subtle);
}
.dialog-header h2 {
  font: var(--type-heading);
  margin: 0;
}
.dialog-body {
  padding: var(--spacing-05);
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-03);
  padding: var(--spacing-05);
  border-top: 1px solid var(--border-subtle);
}
```

3. Replace `.notification-panel`:
```css
.notification-panel {
  position: fixed;
  bottom: var(--spacing-05);
  right: var(--spacing-05);
  width: min(400px, 90vw);
  background: var(--surface-overlay);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  z-index: 9500;
  box-shadow: none;
}
```

---

## Phase 7: Form inputs

### T092-sub11: Restyle inputs, selects, and comboboxes

**Files to modify:**
- `web/src/index.css` — `.input`, `.combobox`, `select`, `textarea` rules

**Exact steps:**

1. Replace all input rules:
```css
.input, input[type="text"], input[type="number"], input[type="search"],
.combobox, select, textarea {
  width: 100%;
  height: 40px;
  padding: 0 var(--spacing-05);
  font: var(--type-body);
  color: var(--text-primary);
  background: var(--surface);
  border: none;
  border-bottom: 1px solid var(--border-strong);
  border-radius: 0;
  outline: none;
  transition: border-color 0.1s ease;
}
.input:focus, input:focus, .combobox:focus, select:focus, textarea:focus {
  border-bottom-color: var(--interactive);
  box-shadow: inset 0 -1px 0 var(--interactive);
}
.input::placeholder { color: var(--text-tertiary); }
textarea { height: auto; min-height: 80px; padding: var(--spacing-04); border: 1px solid var(--border-strong); }
```

Carbon inputs have bottom-border only, no full-border rectangle.

---

## Phase 8: Content layout

### T092-sub12: Standardize page content area

**Files to modify:**
- `web/src/index.css` — `.app-content` rule

**Exact steps:**

1. Replace `.app-content`:
```css
.app-content {
  width: 100%;
  max-width: 1584px;
  margin: 0 auto;
  padding: var(--spacing-07) var(--spacing-05) var(--spacing-09);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-06);
}
.app-content--full {
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}
```

Max width goes from 1200px → 1584px (IBM Carbon's max grid width for 16-column).

### T092-sub13: Standardize page header pattern

**Files to modify:**
- `web/src/index.css` — add page header rules

**Exact steps:**

1. Add after the `.app-content` rules:
```css
.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--spacing-06);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: var(--spacing-06);
}
.page-header h1 {
  font: var(--type-display);
  margin: 0;
}
.page-header .page-description {
  font: var(--type-body);
  color: var(--text-secondary);
  margin: var(--spacing-02) 0 0 0;
}
.page-header .page-actions {
  display: flex;
  gap: var(--spacing-03);
  align-items: center;
}
```

---

## Phase 9: Data tables

### T092-sub14: Restyle tables to IBM Carbon data-table pattern

**Files to modify:**
- `web/src/index.css` — all `table`, `thead`, `tbody`, `tr`, `th`, `td` rules

**Exact steps:**

1. Replace all table rules:
```css
table {
  width: 100%;
  border-collapse: collapse;
  font: var(--type-body);
}
thead {
  background: var(--surface-2);
}
thead th {
  font: var(--type-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32px;
  color: var(--text-secondary);
  text-align: left;
  padding: var(--spacing-04) var(--spacing-05);
  border-bottom: 1px solid var(--border-strong);
}
tbody td {
  padding: var(--spacing-04) var(--spacing-05);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: middle;
}
tbody tr:hover {
  background: var(--surface-2);
}
```

---

## Phase 10: Focus and interaction states

### T092-sub15: Standardize focus-visible on all interactive elements

**Files to modify:**
- `web/src/index.css` — global focus rules

**Exact steps:**

1. Add a global focus rule at the top of `index.css` (after `:root`):
```css
/* --- Global focus treatment (IBM Carbon) --- */
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--interactive);
  outline-offset: -2px;
}
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--interactive);
  outline-offset: -2px;
}
```

2. Remove any per-component focus styling that conflicts (e.g., custom focus rings with `box-shadow` instead of `outline`). Let the global rule handle it.

---

## Phase 11: Glow and gradient removal

### T092-sub16: Remove all glow, gradient, and decorative effects

**Files to modify:**
- `web/src/index.css` — all occurrences
- All `.css` files in `web/src/`

**Exact steps:**

1. Search `web/src/index.css` for `text-shadow`. Set every occurrence to `text-shadow: none;` or remove the rule.

2. Search for `background: linear-gradient(` on surface elements (not animated flow indicators). Replace with flat `background: var(--surface)` or the appropriate surface variable.

3. Search for `filter: drop-shadow(` — remove from all UI chrome elements (icons, buttons, cards). Keep only on actual image content if needed.

4. Search for `backdrop-filter: blur(` — remove all occurrences. Replace with `background: rgba(0, 0, 0, 0.65)` or equivalent solid overlay.

5. Search for any `animation` or `@keyframes` on UI chrome elements (not data visualization). Keep: `shimmer` (skeleton loading), `spin` (loading spinner), and signal-flow animations. Remove: any "glow" or "pulse" keyframes on static UI elements.

6. Search for `border-color: var(--primary)` on non-selected, non-active elements. Replace with `border-color: var(--border-subtle)`.

---

## Phase 12: React Flow / Grid theming

### T092-sub17: Update React Flow CSS variables

**Files to modify:**
- `web/src/index.css` — `.react-flow` variable block

**Exact steps:**

1. Find the `.react-flow` custom property block. Replace with:
```css
.react-flow {
  --xy-background-color: var(--bg);
  --xy-node-border: var(--border-strong);
  --xy-node-background: var(--surface);
  --xy-edge-stroke: var(--border-strong);
  --xy-edge-stroke-width: 2px;
  --xy-edge-stroke-selected: var(--interactive);
  --xy-controls-button-background: var(--surface);
  --xy-controls-button-border: var(--border-subtle);
  --xy-minimap-background: var(--bg);
  --xy-minimap-mask: rgba(15, 98, 254, 0.15);
  --xy-minimap-node: var(--interactive);
}
```

---

## Phase 13: Empty state and placeholder treatment

### T092-sub18: Create consistent empty-state component styling

**Files to modify:**
- `web/src/index.css` — add new empty-state rules

**Exact steps:**

1. Add these rules after the card system:
```css
/* --- Empty states (IBM Carbon) --- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-09) var(--spacing-07);
  text-align: center;
}
.empty-state svg {
  width: 48px;
  height: 48px;
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-05);
}
.empty-state h3 {
  font: var(--type-heading);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-03);
}
.empty-state p {
  font: var(--type-body);
  color: var(--text-tertiary);
  max-width: 480px;
  margin-bottom: var(--spacing-06);
}
.empty-state .btn {
  /* Primary action in empty state */
}
```

---

## Phase 14: Advanced menu and maturity badge styling

### T092-sub19: Restyle the advanced menu dropdown

**Files to modify:**
- `web/src/index.css` — `.advanced-menu`, dropdown, and mega-menu styles

**Exact steps:**

1. Find the advanced menu / dropdown panel styles. Replace with a flat panel:
```css
.advanced-menu-panel {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--surface-overlay);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  box-shadow: none;
  z-index: 8500;
}
.advanced-menu-group-label {
  font: var(--type-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32px;
  color: var(--text-tertiary);
  padding: var(--spacing-04) var(--spacing-05) var(--spacing-02);
}
.advanced-menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-04);
  padding: var(--spacing-04) var(--spacing-05);
  font: var(--type-body);
  color: var(--text-secondary);
  text-decoration: none;
  border: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
}
.advanced-menu-item:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}
.advanced-menu-item .maturity-tag {
  margin-left: auto;
}
```

2. Ensure every advanced menu item renders a maturity tag. This is already handled by the navigation model; verify that `AppShell.tsx` renders the tag for each item in the advanced dropdown.

---

## Phase 15: Notification and toast system

### T092-sub20: Restyle notifications to inline banners

**Files to modify:**
- `web/src/index.css` — notification item rules

**Exact steps:**

1. Replace notification item rules:
```css
.notification-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-04);
  padding: var(--spacing-04) var(--spacing-05);
  border-bottom: 1px solid var(--border-subtle);
  font: var(--type-body);
}
.notification-item--success { border-left: 3px solid var(--support-success); }
.notification-item--error   { border-left: 3px solid var(--support-error); }
.notification-item--warning { border-left: 3px solid var(--support-warning); }
.notification-item--info    { border-left: 3px solid var(--support-info); }
.notification-item .notification-title {
  font: var(--type-label);
  font-weight: 600;
  color: var(--text-primary);
}
.notification-item .notification-body {
  font: var(--type-body);
  color: var(--text-secondary);
}
.notification-item .notification-time {
  font: var(--type-caption);
  color: var(--text-tertiary);
  margin-left: auto;
  white-space: nowrap;
}
```

---

## Phase 16: Loading and skeleton states

### T092-sub21: Standardize loading indicators

**Files to modify:**
- `web/src/index.css` — `.spinner`, skeleton classes

**Exact steps:**

1. Replace or add:
```css
.loading-bar {
  width: 100%;
  height: 2px;
  background: var(--surface-3);
  overflow: hidden;
}
.loading-bar::after {
  content: '';
  display: block;
  width: 40%;
  height: 100%;
  background: var(--interactive);
  animation: loading-slide 1.2s ease-in-out infinite;
}
@keyframes loading-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.skeleton {
  background: var(--surface-2);
  border-radius: 0;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

---

## Phase 17: Responsive updates

### T092-sub22: Update mobile breakpoint styles

**Files to modify:**
- `web/src/styles/mobile.css` — all mobile overrides

**Exact steps:**

1. Ensure mobile nav text uses `var(--type-label)` not hardcoded sizes.
2. Ensure bottom tabbar uses the new flat treatment from Phase 3.
3. Set mobile touch targets to minimum 48px (IBM Carbon mobile target).
4. Remove any mobile-specific `border-radius` overrides — everything is flat.
5. Ensure card padding on mobile is `var(--spacing-04)` (12px) to save space.

---

## Phase 18: Theme system update

### T092-sub23: Update all 10 themes with new token structure

**Files to modify:**
- `web/src/app/theme/themes.ts` — all theme objects

**Exact steps:**

For each of the 10 themes in `themes.ts`:

1. Add these new required keys to the `colors` object:
   - `'surface-overlay'`: a value between `surface-2` and `surface-3`
   - `'interactive'`: same as the theme's current `primary`
   - `'interactive-hover'`: a slightly darker version of `primary`
   - `'interactive-active'`: a significantly darker version of `primary`
   - `'interactive-disabled'`: `'#525252'`
   - `'text-primary'`: keep existing or set to `'#f4f4f4'`
   - `'text-secondary'`: keep existing `muted` value or set to `'#c6c6c6'`
   - `'text-tertiary'`: keep existing `muted-2` value or set to `'#8d8d8d'`
   - `'support-success'`: derive from existing `success`
   - `'support-error'`: derive from existing `danger`
   - `'support-warning'`: derive from existing `warning`
   - `'support-info'`: `'#4589ff'`
   - `'border-subtle'`: a value matching the theme's `surface-3`
   - `'border-strong'`: a lighter border value
   - `'bg-empty'`: slightly lighter than `bg`
   - `'bg-offline'`: `'rgba(218, 30, 40, 0.08)'`
   - `'bg-fault'`: `'rgba(218, 30, 40, 0.16)'`

2. Update `widgets` for all themes:
   - `'border-radius-sm'`: `'0px'`
   - `'border-radius-md'`: `'0px'`
   - `'border-radius-lg'`: `'4px'`
   - `'surface-gradient'`: `'none'`
   - `'glow-intensity'`: `'0'`

---

## Phase 19: Component-level CSS files

### T092-sub24: Audit and update all component CSS files

**Files to modify:** Every `.css` file in `web/src/app/components/` and `web/src/app/pages/`

**Exact steps:**

1. Run:
```bash
find web/src -name "*.css" -not -name "index.css" -not -name "mobile.css" -not -name "responsive.module.css"
```

2. For each file found:
   a. Replace any `border-radius` value > `4px` with `0` (except for progress bars, actual circular indicators, or avatar images)
   b. Replace any `box-shadow` with `none` (except focus rules)
   c. Replace any `background: linear-gradient(...)` on surfaces with flat `background: var(--surface-*)`
   d. Replace any hardcoded color values (#hex) with the nearest CSS variable
   e. Replace any hardcoded font-size with the appropriate `var(--type-*)` token
   f. Replace any hardcoded padding/margin with the nearest `var(--spacing-*)` token
   g. Remove `text-shadow` declarations
   h. Remove `backdrop-filter` declarations

**Do NOT modify:**
- `MPX1Panel.css` — the hardware emulation panel intentionally replicates physical hardware aesthetics and is exempt from the flat design mandate
- Any CSS that is specifically for canvas/WebGL/Three.js rendering
- Animation keyframes for data visualization (signal flow, metering)

---

## Phase 20: Validation and cleanup

### T092-sub25: Visual regression check

**Exact steps:**

1. Start the dev server: `cd web && npm run dev`
2. Open the following pages and verify the flat/corporate aesthetic:
   - `/` (Overview/home)
   - `/engine` (Audio Engine)
   - `/avb-routing` (AVB Routing)
   - `/host-machine` (Host Machine)
   - `/about` (Platform Guide)
   - `/juce-grid` (JUCE-GRID — beta)
   - `/mpx1` (MPX-1 Panel — exempted from flat)
   - `/tesira` (Tesira AVB)
3. For each page, verify:
   - No rounded corners on cards, buttons, badges, inputs, or dialogs (except `4px` on modal outer)
   - No box-shadows on any element
   - No blue borders on non-selected elements
   - All text uses IBM Plex Sans or IBM Plex Mono
   - All navigation labels are legible (12px+)
   - Cards clearly distinguish empty/offline/healthy states
   - Buttons are rectangular and have clear interactive/secondary/ghost hierarchy
   - Focus rings are 2px solid blue outline
   - No gradients on UI surfaces
   - No blur effects on overlays

### T092-sub26: Fix any remaining hardcoded styles

**Exact steps:**

1. Run a global search for remaining hardcoded values:
```bash
grep -rn "border-radius:" web/src/ --include="*.css" --include="*.tsx" | grep -v "0px\|0;\|var(--\|999px\|50%\|MPX1"
```
Fix any remaining non-zero, non-variable border-radius.

2. Search for remaining hardcoded colors:
```bash
grep -rn "#[0-9a-fA-F]\{6\}" web/src/ --include="*.css" | grep -v ":root\|var(\|MPX1\|keyframes"
```
Replace with appropriate CSS variables.

3. Search for remaining hardcoded font sizes:
```bash
grep -rn "font-size:" web/src/ --include="*.css" | grep -v "var(--\|MPX1\|:root"
```
Replace with `var(--type-*)` tokens.

---

## Execution order and dependencies

```
Phase 0  (fonts + type scale)     ← no dependencies, start here
Phase 1  (color tokens)           ← no dependencies, can parallel with Phase 0
Phase 2  (cards)                  ← depends on Phase 1
Phase 3  (navigation)             ← depends on Phase 0 + Phase 1
Phase 4  (buttons)                ← depends on Phase 1
Phase 5  (badges/pills)           ← depends on Phase 1
Phase 6  (dialogs)                ← depends on Phase 1
Phase 7  (forms)                  ← depends on Phase 1
Phase 8  (content layout)         ← depends on Phase 0
Phase 9  (tables)                 ← depends on Phase 0 + Phase 1
Phase 10 (focus states)           ← depends on Phase 1
Phase 11 (glow/gradient removal)  ← depends on Phase 1
Phase 12 (React Flow)             ← depends on Phase 1
Phase 13 (empty states)           ← depends on Phase 2
Phase 14 (advanced menu)          ← depends on Phase 3 + Phase 5
Phase 15 (notifications)          ← depends on Phase 1 + Phase 5
Phase 16 (loading/skeleton)       ← depends on Phase 1
Phase 17 (responsive)             ← depends on Phase 3
Phase 18 (theme system)           ← depends on Phase 1
Phase 19 (component CSS audit)    ← depends on ALL above phases
Phase 20 (validation)             ← depends on Phase 19
```

Phases 0 and 1 can run in parallel. Phases 2–12 can run in parallel after 0+1. Phases 13–18 have light dependencies. Phase 19 is the sweep. Phase 20 is validation.

---

## Summary of visual transformation

| Attribute | Before | After |
|-----------|--------|-------|
| Border radius | 6–24px rounded | 0px flat (4px modal only) |
| Box shadow | Multiple levels | None |
| Surface gradient | On some themes | None |
| Card borders | Blue on all cards | Subtle gray; blue only on selected |
| Fonts | Space Grotesk + system UI | IBM Plex Sans + IBM Plex Mono |
| Nav label size | 10px uppercase | 12px sentence case |
| Surface depth | #111→#1a1a→#222 (narrow) | #161616→#262626→#393939 (wide) |
| Primary blue | Everywhere (borders, nav, cards) | Interactive elements only |
| Empty state cards | Same as active cards | Dashed border, muted, distinct |
| Offline cards | Same as empty | Red left-border accent |
| Buttons | Rounded, blue outline | Flat rectangle, filled |
| Input fields | Full border rectangle | Bottom-border only |
| Focus style | Inconsistent | 2px solid blue outline, everywhere |
| Glow/blur | On topbar, cards, dialogs | None |
| Max content width | 1200px | 1584px |
| Topbar height | Variable | 48px fixed |
