/**
 * Stub mobile-viewport detector.
 *
 * @deprecated This hook ALWAYS returns `false`. The 2026-04-28 web
 * audit (Fit-7 in `docs/audits/20260428-web-audit.md`) flagged it as
 * dead code in callers. Two fix paths exist:
 *
 *   (a) Implement with `window.matchMedia` (the working pattern is
 *       in `pages/AudioEnginePage.tsx:138`, a LOCAL same-named hook
 *       that is NOT this stub).
 *   (b) Remove every caller's `if (isMobile)` branch.
 *
 * Either choice is breaking; the decision is operator-driven.
 * Until then, callers' mobile branches are dead code in production.
 *
 * Pinned in `useIsMobile.test.ts` — a new caller of THIS hook will
 * fail the audit-drift guard there and force a deliberate update.
 */
export function useIsMobile(): boolean {
  return false
}
