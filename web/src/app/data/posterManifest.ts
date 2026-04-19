export interface PosterManifestEntry {
  route: string
  label: string
  slug: string
  temperature: 'warm' | 'cool' | 'neutral'
}

export const POSTER_MANIFEST: PosterManifestEntry[] = [
  { route: '/workspace', label: 'Workspaces', slug: 'workspaces', temperature: 'warm' },
  { route: '/platforms/audio-engine', label: 'Audio Engine', slug: 'audio-engine', temperature: 'cool' },
  { route: '/platforms/host-machine', label: 'Host Machine', slug: 'host-machine', temperature: 'warm' },
  { route: '/perform', label: 'Stage Mode', slug: 'stage-mode', temperature: 'warm' },
  { route: '/platforms/about', label: 'Platform Guide', slug: 'platform-guide', temperature: 'cool' },
  { route: '/expression', label: 'Expression', slug: 'expression', temperature: 'cool' },
  { route: '/workspace/artifacts', label: 'LV2 Plugins', slug: 'lv2-plugins', temperature: 'cool' },
  { route: '/midi-hub', label: 'MIDI Hub', slug: 'midi-hub', temperature: 'cool' },
  { route: '/mpx1', label: 'MPX1 Rack', slug: 'mpx1-rack', temperature: 'cool' },
  { route: '/tesira', label: 'Tesira AVB', slug: 'tesira-avb', temperature: 'neutral' },
  { route: '/workspace/artifacts/discover', label: 'IR & NAM Library', slug: 'ir-nam-library', temperature: 'cool' },
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
