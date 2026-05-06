/**
 * Cycle 63 — regression guards for the home-page theme fixes shipped in
 * cycles 49, 54, 62.
 *
 * These tests pin three invariants that the prior theme work depended
 * on. They read AppShell.css as a string (jsdom can't reliably resolve
 * Carbon CSS variables for full computed-style assertions, but file-
 * content matching catches the kinds of regressions we've actually
 * seen: stale class-name selectors and tokenization drift).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const APPSHELL_CSS_PATH = join(__dirname, 'AppShell.css')

describe('AppShell.css theme-token discipline (cycle 63 regression guards)', () => {
  const css = readFileSync(APPSHELL_CSS_PATH, 'utf-8')

  // Cycle 62: the home-page theme regression was caused by a stale
  // `.hp-root` selector that never matched anywhere in the tree (the
  // home root is `.hp2-root`). Pin the corrected selector + guard
  // against the broken one drifting back in.
  it('uses the current `.hp2-root` class in :has() selectors, not the old `.hp-root`', () => {
    expect(css).toMatch(/:has\(\.hp2-root\)/)
    // The bare `.hp-root` token (without the `2`) should not appear —
    // if a future refactor renames `.hp2-root` again, this assertion
    // forces the AppShell.css selector to be updated in the same commit.
    expect(css).not.toMatch(/:has\(\.hp-root\)/)
  })

  // Cycle 54: the brand watermark color must use --cds-text-secondary
  // (theme-aware) rather than --cds-text-on-color (always white,
  // invisible on light themes). Pin it across every rule that
  // assigns `color` to .platform-brand-backdrop__mark.
  it('renders the brand watermark color via --cds-text-secondary, not --cds-text-on-color', () => {
    // Pull every rule block whose selector starts with
    // `.platform-brand-backdrop__mark` so we don't trip on the
    // themed-workspace opacity-only override at line ~84.
    const markRules = [...css.matchAll(/[^\n,{}]*\.platform-brand-backdrop__mark\b[^{]*{[^}]*}/g)].map((m) => m[0])
    expect(markRules.length).toBeGreaterThan(0)
    const ruleWithColor = markRules.find((rule) => /\bcolor\s*:/.test(rule))
    expect(ruleWithColor).toBeDefined()
    if (ruleWithColor) {
      expect(ruleWithColor).toMatch(/color:\s*var\(--cds-text-secondary/)
      expect(ruleWithColor).not.toMatch(/color:\s*var\(--cds-text-on-color/)
    }
  })

  // Cycle 49 + general theme discipline: AppShell.css should never
  // hardcode #161616 (the cds--g100 background) on a base
  // `.app-shell` rule. Theme tokens (var(--bg) / var(--cds-background))
  // are the only way to keep all themes working.
  it('does not hardcode #161616 as a base .app-shell background', () => {
    // Allowed: #161616 as a *fallback* in `var(--cds-background, #161616)`.
    // Blocked: bare `background: #161616;` outside of comments.
    // Strip block comments first so the explanatory note doesn't trip
    // the matcher.
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // Match `background[-color]: #161616` not preceded by a `var(`
    // (i.e. not as a fallback inside var()).
    const offenders = noComments.match(/background[a-z-]*:\s*#161616(?![a-fA-F0-9])/g) ?? []
    expect(offenders).toEqual([])
  })
})
