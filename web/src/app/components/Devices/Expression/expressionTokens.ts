/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 * Design-token references used across the Expression sub-components.
 */

export const expressionTokens = {
  colors: {
    active: 'var(--support-success)',
    border: 'var(--border)',
    borderSubtle: 'var(--border)',
    curve: 'var(--primary-strong)',
    error: 'var(--support-danger)',
    liveIndicator: 'var(--accent)',
    panelSecondary: 'var(--surface-2)',
    primary: 'var(--primary)',
    textMuted: 'var(--muted-2)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textTertiary: 'var(--text-tertiary)',
    warning: 'var(--support-warning)',
  },
  typography: {
    fontFamily: {
      ui: 'var(--font-ui)',
    },
  },
} as const
