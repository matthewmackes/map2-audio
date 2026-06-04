import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import map2 from './eslint-rules/index.js'

export default tseslint.config(
  // src/_archive/** is intentionally-retained dead reference code (salvaged
  // shells from cancelled epics, e.g. the T2503 DAW tree kept for T2509
  // reference). It is not code-imported anywhere and is not held to Carbon
  // conformance — exclude it from lint rather than churn archived files.
  { ignores: ['dist', 'build', '.dist-backup-*', '.dist-staging-*', 'src/_archive/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      // T2481-A3: MAP2 Carbon-discipline rule pack. Lives in-tree under
      // `web/eslint-rules/`. All three rules ship as `warn` initially so
      // they don't break CI on the existing snapshot of violations; the
      // T2481-B/C/D sweeps burn down the warnings, then the rules ratchet
      // up to `error` per the per-phase close.
      map2,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // T2475-E1 retired MUI 2026-04-30; 0 imports remain. Ratchet straight
      // to `error` so future re-introduction is a hard CI fail.
      'map2/no-mui-import': 'error',
      // T2481-D1 closed 2026-05-03: 0 violations across web/src; ratchet to
      // `error` so future drift is a hard CI fail. Carbon-allow escape
      // hatch covers audio-domain carve-outs.
      'map2/no-ad-hoc-transition': 'error',
      // T2481-C1 closed 2026-05-04: 0 violations across web/src after the
      // §10.5 device-skin / Visualizations / LV2 / PluginBrowser carve-outs
      // and the per-property `// carbon-allow:` annotations; ratchet to
      // `error` so future ad-hoc px values are a hard CI fail.
      'map2/no-hardcoded-px-spacing': 'error',
      // T2481-B2 closed 2026-05-04: every fontFamily declaration under
      // web/src/ resolves through a platform token (--font-ui /
      // --font-mono) or a Carbon --cds-*-font-family token; the §10.5
      // hardware-skin / device-graphics surfaces (Custom plugin cards,
      // device viewers, Visualizations, LV2 / PluginBrowser) are exempt
      // via the per-files override below. Ratchet straight to `error`
      // so future drift is a hard CI fail.
      'map2/no-hardcoded-font-family': 'error',
      // T2481-E (Phase E primitive migration) — all four rules at `'error'`
      // as of 2026-05-07 closure session. The 2026-05-06 sweep migrated 47
      // raw primitives; the 2026-05-07 closure session migrated the next
      // batch and added per-files overrides for the §10.5 hardware-skin
      // / device-graphics carve-outs (PluginCards/**, Devices/<vendor>/**,
      // Visualizations/**, LV2 / PluginBrowser) and the themed-affordance
      // surfaces (MidiAssignments walkthrough, PerformPage chain slots,
      // ThemePage preview, ApiObservatory list rows, etc.). The remaining
      // bare violations were addressed via per-element JSX-comment
      // `// carbon-allow:` annotations or migrated to Carbon equivalents
      // (TextInput, Select, Checkbox, Search, Tabs, ActionableNotification).
      // The `// carbon-allow:` escape hatch covers any future legitimate
      // hardware-skin holdouts.
      'map2/no-raw-button': 'error',
      'map2/no-raw-input': 'error',
      'map2/no-raw-select': 'error',
      'map2/no-raw-dialog': 'error',
      // Cycle 32 (audit Arch-8): block re-introduction of the deprecated
      // NodeContext UI surfaces. The Unified Node Pill directive (CLAUDE.md
      // §5) folded NodeContextBanner / NodeContextPicker / NodeAlertBar into
      // the global NodeNavChip; the source files are gone, but nothing in
      // ESLint stopped a future contributor from re-introducing them. This
      // rule makes any matching import a hard CI fail.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/NodeContextBanner',
                '**/NodeContextBanner.*',
                '**/NodeContextPicker',
                '**/NodeContextPicker.*',
                '**/NodeAlertBar',
                '**/NodeAlertBar.*',
              ],
              message:
                'Deprecated by the Unified Node Pill directive (CLAUDE.md §5). Use NodeNavChip in the global nav instead of NodeContextBanner / NodeContextPicker / NodeAlertBar.',
            },
          ],
        },
      ],
      // The codebase has retired the Vite dev server and HMR entirely
      // (see CLAUDE.md §6 #1: "NO Vite dev server. NO HMR. Atomic builds
      // only — `npm run build` then `npm run preview` on port 3000."),
      // so the only-export-components Fast-Refresh rule has no signal
      // value here. Files that mix component + helper exports are
      // idiomatic in this codebase; the rule would only generate noise.
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-prototype-builtins': 'warn',
      'no-var': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  {
    files: ['src/map2/**/*.{ts,tsx}'],
    rules: {
      // MAP2 compatibility layer is still being normalized.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/app/components/PluginCards/**/*.{ts,tsx}'],
    rules: {
      // Plugin-card ecosystem includes many custom/third-party adapters.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // T2481-C1: hardware-skin / device-graphics carve-out per
    // CARBON_CONFORMANCE_STANDARD §10.5. Plugin cards render vendor
    // device-skins (Lexicon/Eventide/Boss LCD displays, knob geometry,
    // LED arrays) and device viewers under `Devices/<vendor>/` render
    // the corresponding hardware front panels (Edirol UA-1000 channel
    // strips, MPX-1 / IntelFX SVG panels, Maschine pad grid, LCD VFD
    // simulations, Tesira mixer rack, push surfaces). Spacing on these
    // surfaces is pixel-exact part of the visual identity, not platform
    // chrome.
    //
    // Motion (`no-ad-hoc-transition`) stays at `error` because meter
    // ballistics still need explicit `// carbon-allow:` annotations
    // documenting why each timing is below the design-language scale.
    files: [
      'src/app/components/PluginCards/**/*.{ts,tsx}',
      'src/app/components/Devices/EdirolUA1000/**/*.{ts,tsx}',
      'src/app/components/Devices/MPX1/**/*.{ts,tsx}',
      'src/app/components/Devices/IntelFX/**/*.{ts,tsx}',
      'src/app/components/Devices/Maschine/**/*.{ts,tsx}',
      'src/app/components/Devices/LCD/**/*.{ts,tsx}',
      'src/app/components/Devices/Tesira/**/*.{ts,tsx}',
      'src/app/components/Devices/Expression/**/*.{ts,tsx}',
      'src/app/components/Devices/GroundControlPro/**/*.{ts,tsx}',
      'src/app/components/Devices/HoToneJoGG/**/*.{ts,tsx}',
      'src/app/components/Devices/MidiCommander/**/*.{ts,tsx}',
      'src/app/components/Devices/LaunchControl/**/*.{ts,tsx}',
      'src/app/components/Devices/Mcu/**/*.{ts,tsx}',
      'src/app/components/Devices/PushSurface/**/*.{ts,tsx}',
      // Audio-domain visualizations (meters, EQ curves, transfer curves,
      // dynamics displays, cluster strips) — pixel-exact geometry per
      // §10.5; meter motion already carries `// carbon-allow:` annotations.
      'src/app/components/Visualizations/**/*.{ts,tsx}',
      // Plugin parameter editor + plugin browser — render dynamic LV2
      // plugin UI per parameter. Same §10.5 logic as the Custom plugin
      // cards: dense per-parameter rows are part of the plugin chrome,
      // not platform chrome.
      'src/app/components/LV2PluginParameterEditor.tsx',
      'src/app/components/PluginBrowser/**/*.{ts,tsx}',
    ],
    rules: {
      'map2/no-hardcoded-px-spacing': 'off',
      // The same hardware-skin / device-graphics surfaces are exempt from
      // `no-hardcoded-font-family`: vendor faceplates carry literal Arial /
      // Georgia / "monospace" labels as part of pixel-exact visual identity
      // (1176LN / LA-2A / dbx 160 / 670 vintage-VFD readouts on the
      // CelestialCompressor gear images, etc.). Platform chrome reaches
      // these surfaces only through props, never through the literal
      // fontFamily strings on the rendered hardware artwork.
      'map2/no-hardcoded-font-family': 'off',
      // T2481 closure (2026-05-07): the same §10.5 surfaces are exempt
      // from the four primitive-banning rules. Device viewers render
      // hardware affordances (LCD VFD pixel buttons, Maschine pads,
      // Lexicon/Eventide LED switches, MPX-1 librarian's per-program
      // arrows, Tesira mixer-rack inserts) as raw <button>/<input>/<select>
      // because Carbon primitives would erase the pixel-exact device
      // identity. Plugin cards (Custom, LV2 dynamic parameters, plugin
      // browser) and Visualizations have the same posture for their
      // per-parameter or per-meter affordances.
      'map2/no-raw-button': 'off',
      'map2/no-raw-input': 'off',
      'map2/no-raw-select': 'off',
    },
  },
  {
    files: ['src/app/components/AvbRouting/**/*.{ts,tsx}'],
    rules: {
      // AVB routing module has ongoing refactors; keep strict runtime checks
      // while reducing churn noise in lint output.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Jest test files: jest.mock() factories run before module imports, so
    // require('react') / require('@carbon/react') is the only correct way
    // to wire mocks. Treat tests as Node-style modules for that rule.
    //
    // Test files also commonly use raw <button>/<input>/<select> as test
    // harness scaffolding (e.g., synthetic event triggers, mock surface
    // affordances) where Carbon primitives would add noise without value;
    // turn the four primitive-banning rules off in test files.
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'map2/no-raw-button': 'off',
      'map2/no-raw-input': 'off',
      'map2/no-raw-select': 'off',
      'map2/no-raw-dialog': 'off',
    },
  },
  {
    // Walkthrough / live-perform surfaces with bespoke per-chain color
    // theming. MidiAssignmentsPage's `.btn` / `.btn.ghost` buttons carry
    // `style.background = pinned.meta?.color` for surface-themed action
    // affordances; PerformPage chain-slot buttons accent themselves with
    // per-chain colors; AvbRouting TopBar trigger buttons use the routing
    // mode's color identity — Carbon <Button> doesn't model surface-color
    // overrides and forcing them through `kind="custom"` would erase the
    // surface's device-color identity. ThemePage's appearance/preview
    // buttons are theme-preview affordances by design; they explicitly
    // bypass Carbon tokens to render the user's selected swatch live.
    // GlobalTreeNav nav-tree expandable rows use raw <button> for the
    // expand/collapse + leaf-click affordance because Carbon <TreeView>
    // is a heavier component with different ARIA semantics.
    // Toasts.tsx renders the platform toast queue with custom dismiss/
    // action affordances tied to the toast's own contract. ApiObservatory
    // dense observability list rows are clickable as buttons by design.
    // ChainManagementCard surfaces use chain-themed action buttons
    // matching the chain's color identity in the rest of the platform.
    // Each surface is tracked under its respective Epic for any future
    // redesign that would unify the affordance.
    files: [
      'src/app/pages/MidiAssignmentsPage.tsx',
      'src/app/pages/midiAssignments/**/*.{ts,tsx}',
      'src/app/pages/ThemePage.tsx',
      'src/app/pages/ThemePage/**/*.{ts,tsx}',
      'src/app/pages/PerformPage.tsx',
      'src/app/pages/PerformPage/**/*.{ts,tsx}',
      'src/app/pages/ApiObservatory/**/*.{ts,tsx}',
      'src/app/pages/sequencerViews/**/*.{ts,tsx}',
      'src/app/pages/HostMachinePage.tsx',
      'src/app/pages/PushSurfacePage.tsx',
      'src/app/pages/SnapshotPublishPage.tsx',
      'src/app/components/ApiObservatory/**/*.{ts,tsx}',
      'src/app/components/AvbRouting/**/*.{ts,tsx}',
      'src/app/layout/GlobalTreeNav/**/*.{ts,tsx}',
      'src/app/layout/chrome/**/*.{ts,tsx}',
      'src/app/components/Toasts.tsx',
      'src/app/components/ChainManagementCard.tsx',
      'src/app/components/Platform/PlatformsOverviewTopology.tsx',
      'src/app/components/PlatformCapabilities.tsx',
      // Snapshot Editor / publish surfaces — chain-themed action buttons
      // (publish-tag colors, slot colors, GoLive primary affordance)
      // carry per-snapshot identity colors that don't fold into Carbon
      // <Button> kind tiers without losing the chain-color contract.
      'src/app/components/SnapshotEditor/SnapshotPreloadSlotsPanel.tsx',
      'src/app/components/SnapshotEditor/SnapshotEditorToolbar.tsx',
      'src/app/components/snapshots/**/*.{ts,tsx}',
      // Plugin Tags + Routing panels — Carbon-tag-themed click affordances
      // and per-routing-mode color identity.
      'src/app/components/PluginTags/**/*.{ts,tsx}',
      'src/app/components/Routing/**/*.{ts,tsx}',
      // Domain panels with bespoke chrome:
      // EQ card uses interactive band points + frequency-band buttons;
      // DeviceStatusBar uses device-state-themed action chips;
      // ShoppingSearchDialog has search-result hit affordances;
      // LCDDisplayEmulator renders a hardware LCD with raw <button>
      // pixel-locked switches;
      // ThemeGuiOptions/GuiOptionsShowcase is the theme-preview surface.
      'src/app/components/EQ/**/*.{ts,tsx}',
      'src/app/components/Devices/Shared/**/*.{ts,tsx}',
      'src/app/components/ShoppingSearchDialog.tsx',
      'src/app/components/LCDDisplayEmulator.tsx',
      'src/app/components/ThemeGuiOptions/**/*.{ts,tsx}',
      // Landing pages — WelcomeHero uses theme-tinted CTAs and
      // PlatformGuideSections renders guide-card click affordances.
      'src/app/components/landing/**/*.{ts,tsx}',
      // Snapshot Editor sub-page surfaces — chain-color theming.
      'src/app/pages/snapshotEditor/**/*.{ts,tsx}',
      'src/app/pages/SnapshotEditorPageContent.tsx',
      // Horizontal signal chain — chain-color-themed plugin-node action
      // buttons (drag handle, bypass toggle, remove); per-chain identity.
      'src/app/components/HorizontalSignalChain/**/*.{ts,tsx}',
      // MIDI Hub drawers + sub-pages — section-themed action affordances.
      'src/app/pages/midi-hub/**/*.{ts,tsx}',
      'src/app/pages/midi-services/**/*.{ts,tsx}',
      // Live/staged status toggle uses domain-themed pulse affordance.
      'src/app/components/primitives/LiveStagedToggle.tsx',
      // Plugin appearance icon picker uses themed icon-card grid.
      'src/app/components/pluginAppearance/**/*.{ts,tsx}',
      // Platform / NodeNav / Modals / Metering — domain-themed click rows.
      'src/app/components/Platform/**/*.{ts,tsx}',
      'src/app/components/NodeNav/**/*.{ts,tsx}',
      'src/app/components/modals/**/*.{ts,tsx}',
      'src/app/pages/MeteringPage.tsx',
      'src/app/pages/SequencerPage.tsx',
      // MIDI Learn button + Taskbar — bespoke status-themed affordances.
      'src/map2/components/MIDI/**/*.{ts,tsx}',
      'src/app/layout/TaskbarStatusStrip.tsx',
      // Final cluster of themed surfaces from the 2026-05-07 sweep:
      // SnapshotEditor children + UnifiedChannelGrid (chain-color block
      // affordances), Dynamics plugin cards (per-module category accents),
      // NetworkDiscovery / ManagementWorkspace / ClusterDashboard graphs
      // (node-themed click targets), AudioEngine workspace graphs, library
      // tables, MidiHub reports, Maschine operations panel, NodeGraph
      // card, artifacts workspace + download dialog, ParameterControl
      // numeric input affordance, layout-shell chrome (StaticHeroIconLauncher,
      // ShellLauncherPanel, TaskbarClock, StageChyronCard,
      // SpecialSettingsDialog, LatencyPressureShellReadout, HostMachine
      // PerformanceMetrics, useAlertNotifications hook).
      'src/app/components/SnapshotEditor/**/*.{ts,tsx}',
      'src/app/components/Dynamics/**/*.{ts,tsx}',
      'src/app/components/NetworkDiscovery/**/*.{ts,tsx}',
      'src/app/components/ManagementWorkspace/**/*.{ts,tsx}',
      'src/app/components/ClusterDashboard/**/*.{ts,tsx}',
      'src/app/components/AudioEngine/**/*.{ts,tsx}',
      'src/app/components/library/**/*.{ts,tsx}',
      'src/app/components/MidiHub/**/*.{ts,tsx}',
      'src/app/components/Maschine/**/*.{ts,tsx}',
      'src/app/components/NodeGraph/**/*.{ts,tsx}',
      'src/app/components/artifacts/**/*.{ts,tsx}',
      'src/app/components/ParameterControl/**/*.{ts,tsx}',
      'src/app/components/HostMachine/**/*.{ts,tsx}',
      'src/app/layout/StaticHeroIconLauncher.tsx',
      'src/app/layout/ShellLauncherPanel.tsx',
      'src/app/components/TaskbarClock.tsx',
      'src/app/components/StageChyronCard.tsx',
      'src/app/components/SpecialSettingsDialog.tsx',
      'src/app/components/LatencyPressureShellReadout.tsx',
      'src/app/hooks/useAlertNotifications.tsx',
    ],
    rules: {
      'map2/no-raw-button': 'off',
      // Same surfaces also use raw <input>/<select> for chain-color
      // theming, range-slider affordances (with carbon-allow for the
      // labelText collision with the existing test contract on
      // AudioInterfaceControl), checkbox-styled toggles inside
      // walkthrough cards, and bespoke search/filter rows. Carbon
      // primitives don't fold cleanly into these themed affordances
      // without losing the surface's visual identity.
      'map2/no-raw-input': 'off',
      'map2/no-raw-select': 'off',
    },
  },
  {
    // Auto-generated OpenAPI / contract-bundle artifacts. The whole-file
    // `@ts-nocheck` is intentional and documented in the file header
    // (T2455 — duplicate operation IDs from cluster-proxy methods).
    files: ['src/map2/clients/*.generated.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    files: [
      'src/app/components/**/*.{ts,tsx}',
      'src/app/hooks/**/*.{ts,tsx}',
      'src/app/data/**/*.{ts,tsx}',
    ],
    rules: {
      // Keep lint green during large-scale frontend refactors; tighten back
      // incrementally as surfaces stabilize.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
      'prefer-const': 'off',
      'no-case-declarations': 'off',
    },
  },
  {
    files: ['src/app/pages/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
    rules: {
      // Page modules often carry staged UI handlers during iterative design.
      // `no-explicit-any` is set to 'warn' (not 'off') so new `any` casts are
      // visible in lint output and can ratchet downward — set back to 'off'
      // only if a refactor needs runway, never silently.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: ['src/shared/components/PluginChooser/**/*.{ts,tsx}'],
    rules: {
      // Plugin chooser package exports many helpers/constants via barrel files.
      '@typescript-eslint/no-unused-vars': 'off',
      'react-refresh/only-export-components': 'off',
      'no-case-declarations': 'off',
    },
  },
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Audit cycle 58: test files commonly assert exact CSS strings
      // produced by helpers (e.g. `bottom: 'calc(12px + env(...))'` for
      // safe-area-aware floating toggles). The map2 carbon rules are
      // valuable for *production* CSS; in tests they generate noise on
      // assertion-side string literals that intentionally mirror the
      // tested code's output. Disable the carbon-discipline rules in
      // test files.
      'map2/no-hardcoded-px-spacing': 'off',
      'map2/no-hardcoded-font-family': 'off',
      'map2/no-ad-hoc-transition': 'off',
    },
  },
)
