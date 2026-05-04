import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

export interface PosterManifestEntry {
  route: string
  label: string
  slug: string
  temperature: 'warm' | 'cool' | 'neutral'
}

// Nav reorg 2026-05-03 (second pass) — manifest routes rewritten
// to canonical post-reorg URLs (/node-ops, /node-ops/*, /artifacts,
// /about) so poster art lookups match the actual visited paths.
export const POSTER_MANIFEST: PosterManifestEntry[] = [
  { route: '/node-ops', label: 'Node Ops', slug: 'workspaces', temperature: 'warm' },
  { route: '/node-ops/audio-engine', label: 'Audio Engine', slug: 'audio-engine', temperature: 'cool' },
  { route: HOST_MACHINE_ROUTE, label: 'Host Machine', slug: 'host-machine', temperature: 'warm' },
  { route: '/perform', label: 'Stage Mode', slug: 'stage-mode', temperature: 'warm' },
  { route: '/expression', label: 'Expression', slug: 'expression', temperature: 'cool' },
  { route: '/artifacts', label: 'LV2 Plugins', slug: 'lv2-plugins', temperature: 'cool' },
  // T2482 loop 10 / iter 94 — "MIDI Hub" → "MIDI Services" rename.
  { route: '/midi', label: 'MIDI Services', slug: 'midi-services', temperature: 'cool' },
  { route: '/mpx1', label: 'MPX1 Rack', slug: 'mpx1-rack', temperature: 'cool' },
  { route: '/tesira', label: 'Tesira AVB', slug: 'tesira-avb', temperature: 'neutral' },
  { route: '/artifacts/discover', label: 'IR & NAM Library', slug: 'ir-nam-library', temperature: 'cool' },
  { route: '/lcd', label: 'LCD Console', slug: 'lcd-console', temperature: 'warm' },
  { route: '/edirol-ua1000', label: 'Edirol UA-1000', slug: 'edirol-ua1000', temperature: 'cool' },
  { route: '/hotone-jogg', label: 'HoTone JoGG', slug: 'hotone-jogg', temperature: 'warm' },
  { route: '/hotone-jogg', label: 'Generic Interface', slug: 'generic-interface', temperature: 'neutral' },
]

const MANIFEST_INDEX = new Map(
  POSTER_MANIFEST.map((entry) => [`${entry.route}::${entry.label}`, entry]),
)

function getRoutePathname(route: string): string {
  try {
    return new URL(route, 'https://map2.local').pathname
  } catch {
    return route
  }
}

export function resolvePoster(route: string, label: string): PosterManifestEntry {
  const key = `${route}::${label}`
  const exact = MANIFEST_INDEX.get(key)
  if (exact) {
    return exact
  }

  const fallbackByRoute = POSTER_MANIFEST.find((entry) => entry.route === route)
  if (fallbackByRoute) {
    return fallbackByRoute
  }

  const pathname = getRoutePathname(route)
  const fallbackByPathname = POSTER_MANIFEST.find((entry) => getRoutePathname(entry.route) === pathname)
  if (fallbackByPathname) {
    return fallbackByPathname
  }

  return {
    route,
    label,
    slug: 'generic-interface',
    temperature: 'neutral',
  }
}
