# Design Review: `/platforms/theme`

**Review Date**: 2026-04-11
**Route**: `/platforms/theme` → `PlatformWorkspacePage` → `StandaloneWorkspace(panel="theme")` → `ThemePage`
**Focus Area**: UX/Usability
**Key Files**: `web/src/app/pages/ThemePage.tsx`, `web/src/app/pages/ThemePage.css`

> **Note**: This review was conducted through static code analysis only (no X server available for browser rendering). Visual inspection via browser would provide additional insights into layout rendering, interactive behaviors, and actual appearance.

---

## Summary

The Theme page is a richly featured settings workspace covering theme selection, color token editing, plugin appearance, wallpaper, and accessibility/motion preferences. However the page has several significant UX/Usability problems: **two parallel controls for the same theme-selection action create immediate user confusion**, the mixed auto-save vs. explicit-save model is undiscoverable, and several interactive patterns break expected conventions (radio groups triggering file dialogs, unmaintained draft state, dead UI code). There are 18 issues identified: 3 critical, 7 high, 6 medium, 2 low.

---

## Issues

| # | Issue | Criticality | Location |
|---|-------|-------------|----------|
| 1 | **Dual theme-selection controls compete with each other.** A native `<select>` dropdown and a visual card catalog (`theme-page__catalog-grid`) both control `setTheme()`. The select shows a stale "Draft preview" entry that never updates to reflect catalog clicks, and the catalog shows no relationship to the select's current value. Users are presented with two sources of truth for the active theme. | 🔴 Critical | `ThemePage.tsx:753-816, 818-979` |
| 2 | **Uploading a wallpaper silently breaks the radio-group contract.** Clicking the "Uploaded image" radio option immediately fires `wallpaperUploadInputRef.current?.click()` (file picker opens) without first marking the option as selected or showing its configuration area. The user's `aria-checked` state never reaches `true` until _after_ a file is loaded. Users who cancel the dialog are left with no option selected. | 🔴 Critical | `ThemePage.tsx:1569-1573` |
| 3 | **Draft token overrides are silently discarded on theme switch.** Clicking any theme in the catalog or the `<select>` calls `setDraftDirty(false)` and overwrites `draftOverrides` without any confirmation prompt. A user who has made 10 token edits loses all of them with a single mis-click on a preset. No "Unsaved changes — continue?" guard exists anywhere. | 🔴 Critical | `ThemePage.tsx:759-766, 869-874` |
| 4 | **Mixed auto-save vs. explicit-save is hidden in a footnote.** Presets, fonts, category accents, and behavior preferences auto-save. Token overrides require "Save and apply custom theme". This split is documented only in a 1-line `theme-page__group-note` beneath the save button, well below the primary interaction area. Users will assume everything either auto-saves or nothing does, leading to lost token work. | 🟠 High | `ThemePage.tsx:1004-1007` |
| 5 | **"Save and apply" and "Reset draft" buttons have no disabled state.** Both buttons render and are clickable even when `!draftDirty` (no draft changes exist). "Save and apply" when no draft is dirty will save a duplicate of the current theme; "Reset draft" when nothing is drafted is a confusing no-op. Neither button passes a `disabled` prop tied to `draftDirty`. | 🟠 High | `ThemePage.tsx:997-1001` |
| 6 | **Native `<select>` element in a Carbon design-system UI.** `theme-page__dialog-select` uses a raw `<select>` with custom CSS. Carbon's `<Select>` component from `@carbon/react` is available in the codebase (imported elsewhere) and provides consistent styling, focus management, and accessibility labeling. The native element will render inconsistently across OS themes and breaks visual coherence. | 🟠 High | `ThemePage.tsx:752-815`, `ThemePage.css:146-154` |
| 7 | **Plugin source filter buttons show raw technical strings.** The filter row renders `lv2`, `juce`, `toobamp`, `hardware` as button labels. "toobamp" particularly is an internal identifier that will be opaque to users. "All sources" is properly labelled but peers are not. | 🟠 High | `ThemePage.tsx:1391-1399` |
| 8 | **SlotPalettePicker opens inline with no focus shift.** When a token slot is clicked, `SlotPalettePicker` renders below it inline. Focus stays on the triggering `slot-button` rather than moving into the picker. A keyboard user pressing Tab after opening a picker will advance past it to the next slot button instead of entering the color family grid. | 🟠 High | `ThemePage.tsx:1272-1280, 2023-2090` |
| 9 | **Collapsed single-column layout (< 82rem) has no sectional navigation.** At 82 rem, the three-column layout collapses to a single-column stack: Library → Preview → Options, each as a full-height fieldset. Users then scroll through one enormous page with no sticky tabs, accordion, or jump-links to navigate between Library, Preview, Color Scheme, Font, Token Studio, Appearance Assets, Personalization, and Behavior sections. | 🟠 High | `ThemePage.css:1227-1241` |
| 10 | **Category color pickers use native `<input type="color">` while token overrides use a custom palette picker.** Token overrides get a styled `SlotPalettePicker` constrained to the Carbon palette. Category accents get a raw browser color picker without any such constraint. This creates inconsistent UX and allows category colors that are off-palette and may break the design system. | 🟠 High | `ThemePage.tsx:1362-1369` |
| 11 | **`ThemeDeckPreview` component is fully dead code.** `ThemeDeckPreview` (defined at line 1943) is never called anywhere in `ThemePage`'s render tree. The component occupies ~73 lines of logic and CSS classes, adding maintenance surface for no user value. | 🟡 Medium | `ThemePage.tsx:1943-2015` |
| 12 | **`desktopThemeWorkspace` is hardcoded `null`.** Line 1741 sets `const desktopThemeWorkspace = null` and renders it in JSX on line 1745. This is a permanently empty placeholder that signals an incomplete feature stub and wastes render scope reasoning. | 🟡 Medium | `ThemePage.tsx:1741, 1745` |
| 13 | **"Preview target" options have unhelpful dynamic descriptions.** When a target is active, its description reads "Highlighted in the preview pane." When inactive: "Click to highlight this area in the preview." These descriptions add no new information — the active/inactive state is already communicated by the `aria-checked` and the visual selection style. The description slot could instead explain what is _in_ that area (e.g. "Shows window chrome, title bar gradient, and focus ring"). | 🟡 Medium | `ThemePage.tsx:1141-1168` |
| 14 | **Footer status bar has no action affordance.** The `theme-page__dialog-footer` (line 1732) shows live counts ("3 token edits", "2 appearance overrides") but these are plain `<span>` elements with no interactivity. Users cannot click "3 token edits" to jump to Token Studio or dismiss overrides from the footer. The status information is orphaned from the controls it describes. | 🟡 Medium | `ThemePage.tsx:1732-1737` |
| 15 | **Preset catalog renders all 60+ themes without virtualization.** `PRESET_THEME_GROUPS` spans 7 groups with 8–13 items each (~60 `<button>` elements). All are rendered eagerly. On lower-power devices (a realistic target for an audio processing appliance), this blocks the main thread during initial paint. `react-window` is already installed in the project. | 🟡 Medium | `ThemePage.tsx:856-893` |
| 16 | **`PaintBrush` icon used for "Page transition style" setting.** The motion-head for the page transition section (line 1665) uses the `PaintBrush` icon, which is semantically associated with visual styling/color, not motion. The `Accessibility` icon is correctly used for the "Reduce effects" row, but the transition row should use a motion/animation-related icon (e.g. Carbon's `Loop` or `Play` icon). | 🟡 Medium | `ThemePage.tsx:1665` |
| 17 | **Long token code values may overflow slot card.** `<code>` inside `.theme-page__slot-copy` uses `overflow-wrap: anywhere` but the slot card itself uses `grid-template-columns: auto minmax(0,1fr) auto` with a 1.5rem swatch and a Tag at the end. On narrow viewports or with long CSS variable values (e.g. `color-mix(in srgb, var(--cds-layer-01) 88%, #ffffff 12%)`), the code block can push the Tag out of view before wrapping. | ⚪ Low | `ThemePage.css:1037-1044, 1011-1021` |
| 18 | **`<fieldset>`/`<legend>` labels are low-contrast helper text.** Legends for each `theme-page__dialog-group` (e.g. "Theme selection", "Save as", "Color scheme") use `color: var(--cds-text-secondary)` at `0.75rem`. These serve as the accessible group label for the entire `<fieldset>`, but their low prominence makes them functionally invisible. Users relying on visual scanning to orient within the form will miss these group boundaries. | ⚪ Low | `ThemePage.css:109-114` |

---

## Criticality Legend

- 🔴 **Critical**: Breaks expected interaction model or causes silent data loss
- 🟠 **High**: Significantly degrades usability for a meaningful group of users
- 🟡 **Medium**: Noticeable friction that should be addressed in a backlog sprint
- ⚪ **Low**: Polish-level improvement

---

## Next Steps (Suggested Priority Order)

1. **🔴 Issue #3** — Add an `onBeforeUnload` / `useBlocker` guard (React Router v6 `unstable_useBlocker`) when `draftDirty && draftOverrideCount > 0` before any theme switch resets the draft.
2. **🔴 Issue #1** — Remove the native `<select>` dropdown (or demote it to a search/jump-to helper). The visual catalog should be the single source of truth. Use it as the primary control and remove the parallel selector.
3. **🔴 Issue #2** — Separate the "Uploaded image" radio option from the file input trigger. Select the option first, then reveal an "Upload image" `<Button>` within the selected option's expanded area.
4. **🟠 Issue #5** — Disable both "Save and apply" and "Reset draft" when `!draftDirty`.
5. **🟠 Issue #4** — Introduce a persistent `InlineNotification` or banner when `draftDirty`, making it clear that token edits are not yet saved. Merge with the footer status.
6. **🟠 Issue #6** — Replace native `<select>` with Carbon's `<Select>` or `<Dropdown>` from `@carbon/react`.
7. **🟠 Issue #7** — Map `PluginSourceFilter` values to display labels: `{ lv2: 'LV2', juce: 'JUCE', toobamp: 'Toob Amp', hardware: 'Hardware' }`.
8. **🟠 Issue #8** — After `SlotPalettePicker` renders, call `picker.querySelector('[role="radio"]')?.focus()` via a `useEffect` ref to shift focus into the color family grid.
9. **🟡 Issue #11 + #12** — Remove `ThemeDeckPreview` and `desktopThemeWorkspace` dead code.
10. **🟡 Issue #15** — Wrap the preset catalog list in a `react-window` `FixedSizeList` or switch to `react-virtualized-auto-sizer` (both already in `package.json`).
