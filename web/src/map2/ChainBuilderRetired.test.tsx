/**
 * T2477 cycle 23 — ChainBuilder retirement gone-state regression guard.
 *
 * Cycle 22 shipped the zero-external-references guard while
 * ChainBuilder still existed. Cycle 23 deletes the 22-file
 * directory + the barrel-export line in map2/index.ts. This test
 * pins the gone state:
 *   1. The directory does NOT exist.
 *   2. map2/index.ts does NOT carry the ChainBuilder re-export.
 *   3. No file under web/src/ imports from the retired path.
 *
 * If a future commit revives the directory or the re-export, this
 * test fails and forces a deliberate decision (revive intentionally
 * via worklist note, or remove the new addition).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB_SRC = join(__dirname, '..')

const RETIRED_DIR = join(REPO_WEB_SRC, 'map2', 'components', 'ChainBuilder')

const SCAN_ROOTS = ['app', 'map2']

const CHAINBUILDER_IMPORT =
  /from\s+['"][^'"]*\bChainBuilder(?:\b|\/)[^'"]*['"]/

function walkFiles(root: string, out: string[] = []): string[] {
  if (!existsSync(root)) return out
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === 'build' ||
        entry === '.git'
      ) {
        continue
      }
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

describe('T2477 cycle 23 — ChainBuilder retirement', () => {
  it('the ChainBuilder directory has been deleted', () => {
    expect(existsSync(RETIRED_DIR)).toBe(false)
  })

  it('map2/index.ts does NOT export from ChainBuilder', () => {
    const idx = join(REPO_WEB_SRC, 'map2', 'index.ts')
    const text = readFileSync(idx, 'utf-8')
    // Allow the retirement comment to mention ChainBuilder by name
    // but no `export * from './components/ChainBuilder'` line should
    // remain.
    expect(text).not.toMatch(/export\s+\*\s+from\s+['"][^'"]*ChainBuilder/)
  })

  it('no file under web/src/ imports from the retired ChainBuilder path', () => {
    const offenders: string[] = []
    for (const root of SCAN_ROOTS) {
      const rootPath = join(REPO_WEB_SRC, root)
      const files = walkFiles(rootPath)
      for (const file of files) {
        // This test file itself contains the regex pattern as a
        // string literal — exclude it from the scan.
        if (file === __filename) continue
        const text = readFileSync(file, 'utf-8')
        if (CHAINBUILDER_IMPORT.test(text)) {
          offenders.push(relative(REPO_WEB_SRC, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
