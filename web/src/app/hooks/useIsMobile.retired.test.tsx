/**
 * Cycle 28 — useIsMobile retirement regression guard.
 *
 * Cycles 26-27 pinned the audit-Fit-7 gap. Cycle 28 takes the
 * audit's "fix path B" — remove every caller's `if (isMobile)`
 * branch — because the hook always returned `false` in production,
 * making each branch dead code with zero observable behavior.
 *
 * This test pins the gone state:
 *   1. The hook file does NOT exist.
 *   2. No file under web/src/ imports `from '.../hooks/useIsMobile'`.
 *
 * The local same-named hook in pages/AudioEnginePage.tsx (line 138,
 * uses window.matchMedia) is a separate file-internal hook and is
 * NOT affected by this retirement.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB_SRC = join(__dirname, '..', '..')

const RETIRED_FILES = [
  'app/hooks/useIsMobile.ts',
  'app/hooks/useIsMobile.test.ts',
]

const SCAN_ROOTS = ['app', 'map2']

const SHARED_HOOK_IMPORT = /from\s+['"][^'"]*\/hooks\/useIsMobile['"]/

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

describe('useIsMobile retirement (cycle 28)', () => {
  it('the hook + its old paired test are deleted', () => {
    for (const rel of RETIRED_FILES) {
      const full = join(REPO_WEB_SRC, rel)
      expect(existsSync(full)).toBe(false)
    }
  })

  it('no file imports the retired shared hook', () => {
    const offenders: string[] = []
    for (const root of SCAN_ROOTS) {
      const rootPath = join(REPO_WEB_SRC, root)
      for (const file of walkFiles(rootPath)) {
        if (file === __filename) continue
        const text = readFileSync(file, 'utf-8')
        if (SHARED_HOOK_IMPORT.test(text)) {
          offenders.push(relative(REPO_WEB_SRC, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('AudioEnginePage still defines its own LOCAL useIsMobile (the working one)', () => {
    const path = join(REPO_WEB_SRC, 'app', 'pages', 'AudioEnginePage.tsx')
    const text = readFileSync(path, 'utf-8')
    expect(text).toMatch(/function\s+useIsMobile\s*\(/)
    expect(text).toMatch(/window\.matchMedia/)
  })
})
