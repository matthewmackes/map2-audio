/**
 * Cycle 51 / follow-up to cycle 49 home-page theme regression.
 *
 * `web/index.html` previously carried inline `!important` style rules
 * (`.juce-grid-page__flow-card-header { background: #000 !important }`,
 * `.numeric-input__control { background: #000 !important }`) that
 * trumped the themed values those surfaces compute. Hard-pin their
 * absence so they can't sneak back in.
 *
 * The single permitted body background line (`background: #161616;`
 * without `!important`) is allowed because it only paints the first
 * frame before main.tsx + Carbon CSS load; the regular index.css body
 * rule sets `background: var(--bg)` and overrides it as soon as the
 * React tree mounts.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const REPO_WEB = join(__dirname, '..', '..', '..')
const INDEX_HTML_PATH = join(REPO_WEB, 'index.html')

describe('web/index.html theme-token discipline (cycle 51)', () => {
  const html = readFileSync(INDEX_HTML_PATH, 'utf-8')

  it('does not carry !important hardcoded colors that would defeat theme switching', () => {
    // Match `something: #hex !important` shapes anywhere in the inline
    // <style> block. We intentionally allow the no-!important
    // `background: #161616` first-frame rule.
    const offenders = html.match(/[a-z-]+:\s*#[0-9a-fA-F]{3,6}[^;{}]*!important/g) ?? []
    expect(offenders).toEqual([])
  })

  it('declares color-scheme as "dark light" so OS chrome tracks both modes', () => {
    expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="dark\s+light"\s*\/?>/)
  })

  it('keeps the (intentional) no-!important first-frame body background fallback', () => {
    // The body { background: #161616 } line is the only hardcoded color
    // we keep — it prevents a white flash before Carbon CSS loads. We
    // assert it's there (so future cleanups don't accidentally remove
    // the flash guard) AND that it doesn't carry !important.
    expect(html).toMatch(/body\s*{[^}]*background:\s*#161616[^}]*}/)
    expect(html).not.toMatch(/body\s*{[^}]*background:\s*#161616[^}]*!important/)
  })
})
