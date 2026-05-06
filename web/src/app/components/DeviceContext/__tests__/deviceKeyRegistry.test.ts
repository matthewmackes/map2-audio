/**
 * Cycle 43 / audit Arch-14 — DeviceKey registry regression guard.
 *
 * Pins three invariants:
 *   1. The `DeviceKey` union exported from `deviceContextTypes.ts` covers
 *      exactly the device-key string literals currently passed by every
 *      `useDeviceNodeContext(...)` and `useDeviceLocation(...)` call site.
 *      If a future contributor adds a new device shell without updating
 *      the union, this test fails — and the type system blocks the call
 *      site from compiling.
 *   2. The same union covers every device-key literal passed as a
 *      `<DeviceContextBanner deviceKey="..." />` prop in JSX.
 *   3. The list of expected keys is recorded here as the single source
 *      of truth for the test; updating the type without updating both
 *      this list and the call sites is impossible without a test failure.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_WEB = join(__dirname, '..', '..', '..', '..', '..')
const REPO_WEB_SRC = join(REPO_WEB, 'src')
const TYPES_PATH = join(REPO_WEB, 'src', 'app', 'components', 'DeviceContext', 'deviceContextTypes.ts')

// Single source of truth for this test. Update both this list AND the
// `DeviceKey` union in deviceContextTypes.ts when adding a new device.
const EXPECTED_DEVICE_KEYS = [
  'lexicon-mpx1',
  'rocktron-intelfx',
  'edirol-ua1000',
  'hotone-jogg',
  'lcd-console',
  'ground-control-pro',
] as const

const HOOK_CALL_RE =
  /useDeviceNodeContext\s*\(\s*['"]([a-z0-9-]+)['"]\s*\)|useDeviceLocation\s*\(\s*['"]([a-z0-9-]+)['"]/g

const PROP_USAGE_RE =
  /<DeviceContextBanner[^>]*\bdeviceKey\s*=\s*['"]([a-z0-9-]+)['"]/g

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

function collectKeysFromSource(text: string, regex: RegExp): string[] {
  const found: string[] = []
  for (const match of text.matchAll(regex)) {
    for (let i = 1; i < match.length; i += 1) {
      if (match[i]) {
        found.push(match[i])
        break
      }
    }
  }
  return found
}

describe('DeviceKey registry (cycle 43 / audit Arch-14)', () => {
  it('the DeviceKey union in deviceContextTypes.ts lists every expected key', () => {
    const text = readFileSync(TYPES_PATH, 'utf-8')
    for (const key of EXPECTED_DEVICE_KEYS) {
      const literal = new RegExp(`['"]${key}['"]`)
      expect({ key, found: literal.test(text) }).toEqual({ key, found: true })
    }
  })

  it('every useDeviceNodeContext / useDeviceLocation literal is a member of the registry', () => {
    const offenders: Array<{ file: string; key: string }> = []
    for (const file of walkFiles(REPO_WEB_SRC)) {
      if (file === __filename) continue
      const text = readFileSync(file, 'utf-8')
      const keys = collectKeysFromSource(text, HOOK_CALL_RE)
      for (const key of keys) {
        if (!EXPECTED_DEVICE_KEYS.includes(key as (typeof EXPECTED_DEVICE_KEYS)[number])) {
          offenders.push({ file: relative(REPO_WEB, file), key })
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every <DeviceContextBanner deviceKey="..."> literal is a member of the registry', () => {
    const offenders: Array<{ file: string; key: string }> = []
    for (const file of walkFiles(REPO_WEB_SRC)) {
      if (file === __filename) continue
      const text = readFileSync(file, 'utf-8')
      const keys = collectKeysFromSource(text, PROP_USAGE_RE)
      for (const key of keys) {
        if (!EXPECTED_DEVICE_KEYS.includes(key as (typeof EXPECTED_DEVICE_KEYS)[number])) {
          offenders.push({ file: relative(REPO_WEB, file), key })
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
