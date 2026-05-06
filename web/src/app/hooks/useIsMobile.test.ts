/**
 * Cycle 26 — useIsMobile current-state pin.
 *
 * The 2026-04-28 web audit (`docs/audits/20260428-web-audit.md`,
 * Fit-7) flagged that `useIsMobile()` always returns `false`,
 * making every caller's `if (isMobile)` branch dead code in
 * production.
 *
 * Two fix paths exist:
 *   (a) Implement the hook with `window.matchMedia` (mirrors the
 *       LOCAL `useIsMobile` in `pages/AudioEnginePage.tsx` line 138
 *       which DOES use matchMedia — this is the proven pattern).
 *   (b) Remove the conditional branches from every caller.
 *
 * Either fix is breaking — (a) lights up dead UI branches that have
 * never been exercised in production; (b) deletes UI features
 * intended for a future "mobile" rendering. The decision is operator-
 * driven, not autonomously settable.
 *
 * This test pins the current-stub behavior + the caller inventory
 * so that a future fix has a clear before-state and the audit gap
 * doesn't silently grow (e.g. by a new caller adopting the hook
 * unaware that the branch is dead).
 */

import { renderHook } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'

import { useIsMobile } from './useIsMobile'

const REPO_WEB_SRC = join(__dirname, '..', '..')

// Audit-confirmed callers of the shared `useIsMobile` hook from
// `web/src/app/hooks/useIsMobile.ts`. Pinned so a new caller forces
// a deliberate decision: either the hook gets a real implementation
// or the new caller removes its dead branch.
//
// `pages/AudioEnginePage.tsx` is intentionally NOT in this list:
// that file defines its own LOCAL `useIsMobile` (line 138) using
// `window.matchMedia`, which DOES work. The shared-hook callers are
// the ones with broken conditionals.
const PINNED_CALLERS = [
  'app/components/upload/UnifiedUploadDialog.tsx',
  'app/components/PluginCards/Base/PluginCardShell.tsx',
  'app/components/Devices/MPX1/MPX1MegaMenu.tsx',
  'app/components/Devices/EdirolUA1000/EdirolUA1000View.tsx',
  'app/components/ProductDetailDialog.tsx',
  'app/components/ShoppingSearchDialog.tsx',
  'app/pages/MeteringPage.tsx',
  'app/pages/SnapshotEditorPageContent.tsx',
] as const

describe('useIsMobile (audit Fit-7 current-state pin)', () => {
  it('always returns false (stub implementation)', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('every pinned caller still imports the shared hook', () => {
    const importRe = /from\s+['"][^'"]*\/hooks\/useIsMobile['"]/
    for (const rel of PINNED_CALLERS) {
      const path = join(REPO_WEB_SRC, rel)
      const text = readFileSync(path, 'utf-8')
      expect(importRe.test(text)).toBe(true)
    }
  })

  it('AudioEnginePage defines its own LOCAL useIsMobile (the working one)', () => {
    const path = join(REPO_WEB_SRC, 'app', 'pages', 'AudioEnginePage.tsx')
    const text = readFileSync(path, 'utf-8')
    expect(text).toMatch(/function\s+useIsMobile\s*\(/)
    expect(text).toMatch(/window\.matchMedia/)
  })

  // Audit drift guard: if a new file under `app/components/` or
  // `app/pages/` imports the shared hook, this test fails and
  // forces a deliberate update of PINNED_CALLERS (with a worklist
  // entry recording the decision).
  it('PINNED_CALLERS list reflects every importer of the shared hook', () => {
    // Pure file-walk: find every .tsx / .ts under app/{components,
    // pages} that imports the shared hook.
    const { readdirSync, statSync } = require('fs')
    const importRe = /from\s+['"][^'"]*\/hooks\/useIsMobile['"]/

    function walk(root: string, out: string[] = []): string[] {
      for (const entry of readdirSync(root)) {
        const full = join(root, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
          if (entry === 'node_modules' || entry === '__pycache__') continue
          walk(full, out)
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue
          out.push(full)
        }
      }
      return out
    }

    const found = new Set<string>()
    for (const sub of ['components', 'pages']) {
      const root = join(REPO_WEB_SRC, 'app', sub)
      for (const file of walk(root)) {
        const text = readFileSync(file, 'utf-8')
        if (importRe.test(text)) {
          found.add(file.slice(REPO_WEB_SRC.length + 1).replace(/\\/g, '/'))
        }
      }
    }

    const pinnedSet = new Set(PINNED_CALLERS)
    const unaudited = [...found].filter((p) => !pinnedSet.has(p)).sort()
    const stalePins = [...pinnedSet].filter((p) => !found.has(p)).sort()
    expect({ unaudited, stalePins }).toEqual({ unaudited: [], stalePins: [] })
  })
})
