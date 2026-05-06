/**
 * Cycle 32 (audit Arch-8) — regression guard.
 *
 * The Unified Node Pill directive (CLAUDE.md §5) deprecated three
 * components in favor of the global `NodeNavChip`:
 *   - NodeContextBanner
 *   - NodeContextPicker
 *   - NodeAlertBar
 *
 * The component files were deleted in earlier work, but nothing in
 * ESLint stopped a future contributor from re-introducing them.
 * Cycle 32 added a `no-restricted-imports` rule to `eslint.config.js`
 * that makes any matching import a hard CI fail.
 *
 * This test pins three independent invariants:
 *   1. The deprecated component files do not exist on disk.
 *   2. No file under `web/src/` imports any of the deprecated paths.
 *   3. The `eslint.config.js` rule is wired and lists the three patterns
 *      with `error` severity.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB = join(__dirname, '..', '..', '..')
const REPO_WEB_SRC = join(REPO_WEB, 'src')
const ESLINT_CONFIG_PATH = join(REPO_WEB, 'eslint.config.js')

const DEPRECATED_NAMES = ['NodeContextBanner', 'NodeContextPicker', 'NodeAlertBar'] as const

const DEPRECATED_IMPORT_RE =
  /from\s+['"][^'"]*\/(?:NodeContextBanner|NodeContextPicker|NodeAlertBar)(?:\.[A-Za-z0-9_-]+)?['"]/

function walkFiles(root: string, out: string[] = []): string[] {
  if (!existsSync(root)) return out
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
      walkFiles(full, out)
    } else if (
      entry.endsWith('.ts') ||
      entry.endsWith('.tsx') ||
      entry.endsWith('.js') ||
      entry.endsWith('.jsx')
    ) {
      out.push(full)
    }
  }
  return out
}

describe('NodeContext deprecated-component ban (cycle 32 / audit Arch-8)', () => {
  it('no source file under web/src/ defines the deprecated components', () => {
    const offenders: string[] = []
    for (const file of walkFiles(REPO_WEB_SRC)) {
      const base = file.split('/').pop() ?? ''
      for (const name of DEPRECATED_NAMES) {
        if (
          base === `${name}.tsx` ||
          base === `${name}.ts` ||
          base === `${name}.jsx` ||
          base === `${name}.js`
        ) {
          offenders.push(relative(REPO_WEB, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('no file under web/src/ imports any of the deprecated paths', () => {
    const offenders: string[] = []
    for (const file of walkFiles(REPO_WEB_SRC)) {
      if (file === __filename) continue
      const text = readFileSync(file, 'utf-8')
      if (DEPRECATED_IMPORT_RE.test(text)) {
        offenders.push(relative(REPO_WEB, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('eslint.config.js wires no-restricted-imports for all three components at error severity', () => {
    const text = readFileSync(ESLINT_CONFIG_PATH, 'utf-8')

    expect(text).toMatch(/'no-restricted-imports'\s*:\s*\[\s*'error'/)

    for (const name of DEPRECATED_NAMES) {
      const literal = new RegExp(`['"]\\*\\*/${name}['"]`)
      const wildcard = new RegExp(`['"]\\*\\*/${name}\\.\\*['"]`)
      expect(text).toMatch(literal)
      expect(text).toMatch(wildcard)
    }

    expect(text).toMatch(/Unified Node Pill directive/)
  })
})
