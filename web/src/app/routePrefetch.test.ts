import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPrefetchPrefixesForTests } from './routePrefetch'

// Routes that intentionally have no prefetch rule:
//   - Pure <Navigate>/redirect routes (no chunk to warm).
//   - Wildcard fallbacks.
//   - Routes whose chunk is already in the App shell graph and not worth
//     a separate prefetch.
//   - Legacy aliases handled by route-level redirects.
//
// If you add a new heavy route, the right answer is almost always
// "add it to PREFETCH_RULES in routePrefetch.ts," not "add it here."
const ROUTES_WITHOUT_PREFETCH = new Set<string>([
  '/',
  '/platform',
  '/about',
  '/theme',
  '/plugins',
  '/library',
  '/audio-artifacts',
  '/artifacts',
  '/midi',
  '/midi-hub-2',
  '/physical-surfaces',
  '/outboard-hardware',
  '/dsp',
  '/cpu-performance',
  '/edirol-ua1000',
  '/hotone-jogg',
  '/lcd',
  '/mpx1',
  '/intelfx',
  '/engine',
  '/maschine/midi-map',
  '/midi-assignments',
  '/legacy',
  '/artifacts/discover',
  '/grid-3d',
  '/tesira/*',
  '*',
  // T2503 DAW retirement: /daw and /daw/* redirect to /artifacts.
  '/daw',
  '/daw/*',
  // T2515: /tascam-us144mkii is a canonical-redirect alias to /devices/tascam-us144mkii.
  '/tascam-us144mkii',
  // T2504/T2509: /multitrack-recorder is a redirect-only legacy alias to /artifacts.
  '/multitrack-recorder',
  '/multitrack-recorder/*',
])

function loadAppRoutes(): string[] {
  const appPath = resolve(__dirname, 'App.tsx')
  const source = readFileSync(appPath, 'utf8')
  const matches = source.matchAll(/<Route\s+[^>]*path=["']([^"']+)["']/g)
  const paths = new Set<string>()
  for (const match of matches) {
    const path = match[1]
    // Only top-level routes participate — relative sub-routes (e.g. "panel"
    // under <Route path="/devices/mpx1/*">) share their parent's chunk and
    // are warmed transitively when the shell is prefetched.
    if (!path.startsWith('/')) continue
    paths.add(path)
  }
  return Array.from(paths)
}

function normalizeRoutePath(path: string): string {
  // Strip trailing wildcards and dynamic segments before matching against
  // prefix rules (the rules use the static prefix portion of the URL).
  return path.replace(/\/\*$/, '').replace(/\/:[^/]+/g, '')
}

function matchesAnyPrefix(path: string, prefixes: readonly string[]): boolean {
  if (path === '') return false
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

describe('routePrefetch coverage', () => {
  const prefixes = getPrefetchPrefixesForTests()

  it('covers every non-redirect route declared in App.tsx', () => {
    const declaredRoutes = loadAppRoutes()
    const uncoveredRoutes: string[] = []

    for (const rawPath of declaredRoutes) {
      if (ROUTES_WITHOUT_PREFETCH.has(rawPath)) continue
      const normalized = normalizeRoutePath(rawPath)
      if (normalized === '') continue
      if (ROUTES_WITHOUT_PREFETCH.has(normalized)) continue
      if (!matchesAnyPrefix(normalized, prefixes)) {
        uncoveredRoutes.push(rawPath)
      }
    }

    if (uncoveredRoutes.length > 0) {
      throw new Error(
        `Add a PREFETCH_RULES entry in routePrefetch.ts (or whitelist in this test) for:\n  - ${uncoveredRoutes.join('\n  - ')}`,
      )
    }
  })

  it('lists every prefetch prefix as a unique non-empty string', () => {
    expect(prefixes.length).toBeGreaterThan(0)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    for (const prefix of prefixes) {
      expect(prefix).toMatch(/^\/[a-z0-9/-]*$/)
    }
  })
})
