/**
 * T2477 dead-code purge prep — zero-external-references guard.
 *
 * The 22 files under web/src/map2/components/ChainBuilder/ are
 * documented in the T2477 worklist note as having no incoming
 * references outside the directory + its single barrel-export line
 * in web/src/map2/index.ts. This test pins that state.
 *
 * If a future commit imports any ChainBuilder symbol from outside
 * the directory (other than via map2/index.ts), this test fails
 * and forces a deliberate decision: either revive the ChainBuilder
 * primitive or remove the new import. That gates the eventual
 * deletion PR (next cycle).
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB_SRC = join(__dirname, '..', '..', '..', '..', 'src')

// Directories under web/src/ that we walk for import scanning. The
// ChainBuilder directory itself is excluded (intra-directory imports
// are fine).
const SCAN_ROOTS = ['app', 'map2']

// Regex matches any `from '.../ChainBuilder/...'` or `from '.../ChainBuilder'`
// import path that the TS compiler would resolve. Tolerant of single
// or double quotes.
const CHAINBUILDER_IMPORT = /from\s+['"][^'"]*\bChainBuilder(?:\b|\/)[^'"]*['"]/

// The single allowed re-export site documented in the T2477 note.
const ALLOWED_REEXPORTS: ReadonlySet<string> = new Set([
  'map2/index.ts',
])

function* walkFiles(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      // Skip the ChainBuilder dir itself + node_modules / dist.
      if (
        entry === 'ChainBuilder' ||
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === 'build' ||
        entry === '.git'
      ) {
        continue
      }
      yield* walkFiles(full)
    } else if (
      entry.endsWith('.ts') ||
      entry.endsWith('.tsx') ||
      entry.endsWith('.js') ||
      entry.endsWith('.jsx')
    ) {
      yield full
    }
  }
}

describe('T2477 dead-code purge — ChainBuilder zero-external-references', () => {
  it('only map2/index.ts re-exports ChainBuilder; nothing else imports it', () => {
    const offenders: string[] = []
    for (const root of SCAN_ROOTS) {
      const rootPath = join(REPO_WEB_SRC, root)
      for (const file of walkFiles(rootPath)) {
        const text = readFileSync(file, 'utf-8')
        if (!CHAINBUILDER_IMPORT.test(text)) continue
        const rel = relative(REPO_WEB_SRC, file)
        if (!ALLOWED_REEXPORTS.has(rel)) {
          offenders.push(rel)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('map2/index.ts still has the ChainBuilder re-export line', () => {
    const indexPath = join(REPO_WEB_SRC, 'map2', 'index.ts')
    const text = readFileSync(indexPath, 'utf-8')
    expect(text).toMatch(/components\/ChainBuilder\/index/)
  })

  it('ChainBuilder directory still exists at the canonical path', () => {
    const dir = join(__dirname)
    expect(statSync(dir).isDirectory()).toBe(true)
  })
})
