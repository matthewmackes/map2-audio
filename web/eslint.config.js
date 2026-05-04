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
      'map2/no-mui-import': 'warn',
      'map2/no-ad-hoc-transition': 'warn',
      'map2/no-hardcoded-px-spacing': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
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
    },
  },
)
