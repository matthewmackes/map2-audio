/**
 * Cycle 65 — regression guard for cycle 64's home-page theme fix.
 *
 * The home page's 1,048-line CSS reads every visible surface
 * (background, panel, line, text) from the `--map2x-*` design tokens
 * defined in WelcomeHero.css. Cycle 64 re-bound each color token to a
 * Carbon `--cds-*` equivalent with the original hardcoded hex value
 * preserved as the var() fallback. This pins that binding so a future
 * refactor can't accidentally re-introduce hardcoded dark colors and
 * break theme switching on the home page again.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const WELCOME_HERO_CSS_PATH = join(__dirname, 'WelcomeHero.css')

describe('WelcomeHero.css --map2x-* theme binding (cycle 65)', () => {
  const css = readFileSync(WELCOME_HERO_CSS_PATH, 'utf-8')

  // Find the .map2x { ... } token-definition block. We deliberately
  // stop at the first nested rule (the next `}` at brace depth 0)
  // so we only inspect the canonical token declarations, not any
  // descendant `.map2x .foo { ... }` rules below.
  function extractMap2xRoot(css: string): string {
    const match = css.match(/\n\.map2x\s*{([^]*?)\n}\n/)
    if (!match) {
      throw new Error('Could not find .map2x root rule block in WelcomeHero.css')
    }
    return match[1]
  }

  const map2xRoot = extractMap2xRoot(css)

  // The 14 color tokens that must follow the active theme. If a
  // future contributor adds a new color token to .map2x, add it here
  // alongside the Carbon token it should bind to.
  const COLOR_TOKEN_BINDINGS: Array<{ map2x: string; cds: string }> = [
    { map2x: 'map2x-bg-0', cds: 'cds-background' },
    { map2x: 'map2x-bg-1', cds: 'cds-layer-01' },
    { map2x: 'map2x-bg-2', cds: 'cds-layer-02' },
    { map2x: 'map2x-bg-3', cds: 'cds-layer-03' },
    { map2x: 'map2x-panel', cds: 'cds-layer-01' },
    { map2x: 'map2x-panel-2', cds: 'cds-layer-02' },
    { map2x: 'map2x-line', cds: 'cds-border-subtle' },
    { map2x: 'map2x-line-2', cds: 'cds-border-subtle-01' },
    { map2x: 'map2x-line-3', cds: 'cds-border-strong' },
    { map2x: 'map2x-text-hi', cds: 'cds-text-primary' },
    { map2x: 'map2x-text', cds: 'cds-text-secondary' },
    { map2x: 'map2x-text-mid', cds: 'cds-text-helper' },
    { map2x: 'map2x-text-low', cds: 'cds-text-placeholder' },
    { map2x: 'map2x-text-dim', cds: 'cds-text-disabled' },
  ]

  it.each(COLOR_TOKEN_BINDINGS)(
    'binds --$map2x to var(--$cds, ...) in the .map2x root rule',
    ({ map2x, cds }) => {
      const pattern = new RegExp(
        `--${map2x}:\\s*var\\(--${cds}(\\s*,\\s*[^)]*)?\\)`,
      )
      expect(map2xRoot).toMatch(pattern)
    },
  )

  it('does not declare any --map2x-bg-*, --map2x-panel*, --map2x-line*, --map2x-text-* token without a var() reference', () => {
    // Block: `--map2x-bg-0: #07090d;` (bare hex; defeats theme).
    // Allow: `--map2x-bg-0: var(--cds-background, #07090d);` (themed
    // with hardcoded fallback).
    const colorTokenLines = map2xRoot
      .split('\n')
      .filter((line) =>
        /^\s*--map2x-(bg|panel|line|text)(-[a-z0-9]+)*:/.test(line),
      )
    const offenders = colorTokenLines.filter((line) => !/var\(/.test(line))
    expect(offenders).toEqual([])
  })
})
