/**
 * T2473 cycle 7 — sibling-hook inventory regression guard.
 *
 * This file is the canonical record of which sibling hooks have been
 * extracted from SnapshotEditorPageContent.tsx as of cycle 7, and
 * asserts that every NEW hook added to the directory either:
 *   1. has a paired .test.tsx that lives next to it, OR
 *   2. is in the explicit UNTESTED_HOOKS allowlist (with a TODO).
 *
 * The inventory list also pins the minimum extraction count — if a
 * future commit deletes a sibling hook, this test fails and forces
 * a deliberate decision (re-inline the logic, rename, or drop the
 * test pin). The intent is to make the "did this hook get a test?"
 * gate impossible to forget.
 *
 * To add a new hook: drop a useSnapshotEditor*.ts file in this
 * directory and either ship a paired useSnapshotEditor*.test.tsx OR
 * add the file (without the .ts suffix) to UNTESTED_HOOKS with a
 * comment naming the follow-up slice.
 */

import { readdirSync } from 'fs'
import { join } from 'path'

const HOOKS_DIR = __dirname

// Hooks that don't have a paired test yet. Each entry should carry a
// follow-up note explaining why. New entries here require a code-
// review checkpoint — the goal is to drive this list down to empty.
const UNTESTED_HOOKS: ReadonlyArray<{ name: string; reason: string }> = [
  // T2473 cycle 21 — UNTESTED_HOOKS now empty. Every sibling hook
  // in pages/snapshotEditor/ has a paired .test.tsx. Future
  // contributions must add a paired test or this list will grow
  // again (and the next session can decide whether it's a paired-
  // test gap or a deliberate test-deferral).
]

// Pinned minimum count. Bump this when shipping a new hook.
const MIN_HOOK_COUNT = 30

function listSnapshotEditorHookFiles(): {
  hooks: string[]
  tests: string[]
} {
  const all = readdirSync(HOOKS_DIR)
  const hooks: string[] = []
  const tests: string[] = []
  for (const entry of all) {
    if (!entry.startsWith('useSnapshotEditor')) continue
    if (entry.endsWith('.test.tsx') || entry.endsWith('.test.ts')) {
      tests.push(entry.replace(/\.test\.(tsx|ts)$/, ''))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      hooks.push(entry.replace(/\.(ts|tsx)$/, ''))
    }
  }
  return { hooks, tests }
}

describe('SnapshotEditor sibling-hook inventory (T2473 regression guard)', () => {
  it('directory holds at least the pinned minimum number of sibling hooks', () => {
    const { hooks } = listSnapshotEditorHookFiles()
    expect(hooks.length).toBeGreaterThanOrEqual(MIN_HOOK_COUNT)
  })

  it('every sibling hook has a paired .test.tsx OR is in the UNTESTED_HOOKS allowlist', () => {
    const { hooks, tests } = listSnapshotEditorHookFiles()
    const testedSet = new Set(tests)
    const allowed = new Set(UNTESTED_HOOKS.map((u) => u.name))

    const missing: string[] = []
    for (const hook of hooks) {
      if (!testedSet.has(hook) && !allowed.has(hook)) {
        missing.push(hook)
      }
    }

    expect(missing).toEqual([])
  })

  it('UNTESTED_HOOKS allowlist only references hooks that actually exist', () => {
    const { hooks } = listSnapshotEditorHookFiles()
    const hookSet = new Set(hooks)
    const stale = UNTESTED_HOOKS.filter((u) => !hookSet.has(u.name))
    expect(stale.map((u) => u.name)).toEqual([])
  })

  it('the cycle-1-to-6 extraction set is present (T2473 hook anchors)', () => {
    const { hooks } = listSnapshotEditorHookFiles()
    const hookSet = new Set(hooks)
    // Anchors: each one corresponds to a published slice in the
    // T2473 worklist entry. If a hook in this list disappears, the
    // monolith partition has regressed.
    const anchors = [
      'useSnapshotEditorPluginBrowserData',           // slice 12
      'useSnapshotEditorAudioInterfaceStatus',        // slice 13
      'useSnapshotEditorActiveChannelStatusRail',     // slice 14
      'useSnapshotEditorRoutingInspectorContent',     // slice 15
      'useSnapshotEditorClipTimestamps',              // slice 16
      'useSnapshotEditorUiPresentation',              // slice 17
    ]
    for (const anchor of anchors) {
      expect(hookSet.has(anchor)).toBe(true)
    }
  })
})
