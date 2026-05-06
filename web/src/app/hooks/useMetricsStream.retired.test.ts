/**
 * Cycle 29 — useMetricsStream retirement regression guard.
 *
 * Audit Fit-2 (`docs/audits/20260428-web-audit.md`) flagged
 * `useMetricsStream` as a pointless wrapper. Investigation showed
 * neither it nor its inner `useSystemMetricsWebSocket` had any
 * non-test consumers — the entire 170-LoC file was dead. Cycle 29
 * deleted it.
 *
 * This test pins the gone state.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB_SRC = join(__dirname, '..', '..')
const SCAN_ROOTS = ['app', 'map2']

const RETIRED_FILE = join(REPO_WEB_SRC, 'app', 'hooks', 'useMetricsStream.ts')
const IMPORT_RE = /from\s+['"][^'"]*\/hooks\/useMetricsStream['"]/

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

describe('useMetricsStream retirement (cycle 29)', () => {
  it('the hook file has been deleted', () => {
    expect(existsSync(RETIRED_FILE)).toBe(false)
  })

  it('no file imports the retired hook', () => {
    const offenders: string[] = []
    for (const root of SCAN_ROOTS) {
      for (const file of walkFiles(join(REPO_WEB_SRC, root))) {
        if (file === __filename) continue
        const text = readFileSync(file, 'utf-8')
        if (IMPORT_RE.test(text)) {
          offenders.push(relative(REPO_WEB_SRC, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
