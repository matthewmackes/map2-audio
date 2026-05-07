import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import map2 from './eslint-rules/index.js'

export default tseslint.config(
  { ignores: ['dist', 'build', '.dist-backup-*', '.dist-staging-*'] },
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
      // T2481-E (Phase E primitive migration) — initial activation at
      // `warn` so the existing violation snapshot surfaces without
      // breaking CI. The `no-raw-dialog` rule was already at 0 violations
      // on the initial 2026-05-06 snapshot (modal sweep had been completed
      // by prior work); ratcheted straight to `error` to prevent
      // regression. The other three rules ratchet to `error` under
      // T2481-E-lint after their respective sweeps close. The
      // `// carbon-allow:` escape hatch covers §10.5 hardware-skin /
      // device-graphics surfaces that legitimately need a raw primitive.
      'map2/no-raw-button': 'warn',
      'map2/no-raw-input': 'warn',
      'map2/no-raw-select': 'warn',
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
      'src/app/components/PluginCards/Custom/**/*.{ts,tsx}',
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
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
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
