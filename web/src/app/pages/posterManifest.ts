export interface PosterManifestEntry {
  route: string
  label: string
  slug: string
  temperature: 'warm' | 'cool' | 'neutral'
}

export const POSTER_MANIFEST: PosterManifestEntry[] = [
  { route: '/overview', label: 'System Overview', slug: 'system-overview', temperature: 'warm' },
  { route: '/engine', label: 'Audio Engine', slug: 'audio-engine', temperature: 'cool' },
  { route: '/avb-routing', label: 'AVB Routing', slug: 'avb-routing', temperature: 'cool' },
  { route: '/host-machine', label: 'Host Machine', slug: 'host-machine', temperature: 'warm' },
  { route: '/perform', label: 'Stage Mode', slug: 'stage-mode', temperature: 'warm' },
  { route: '/about', label: 'Platform Guide', slug: 'platform-guide', temperature: 'cool' },
  { route: '/expression', label: 'Expression', slug: 'expression', temperature: 'cool' },
  { route: '/presets', label: 'Presets', slug: 'presets', temperature: 'cool' },
  { route: '/plugins', label: 'LV2 Plugins', slug: 'lv2-plugins', temperature: 'cool' },
  { route: '/midi', label: 'MIDI', slug: 'midi', temperature: 'cool' },
  { route: '/midi-hub', label: 'MIDI Hub', slug: 'midi-hub', temperature: 'cool' },
  { route: '/mpx1', label: 'MPX1 Rack', slug: 'mpx1-rack', temperature: 'cool' },
  { route: '/tesira', label: 'Tesira AVB', slug: 'tesira-avb', temperature: 'neutral' },
  { route: '/cluster-dashboard', label: 'Cluster Dashboard', slug: 'cluster-dashboard', temperature: 'cool' },
  { route: '/multi-system', label: 'Multi-System', slug: 'multi-system', temperature: 'cool' },
  { route: '/library', label: 'IR & NAM Library', slug: 'ir-nam-library', temperature: 'cool' },
  { route: '/lcd', label: 'LCD Console', slug: 'lcd-console', temperature: 'warm' },
  { route: '/edirol-ua1000', label: 'Edirol UA-1000', slug: 'edirol-ua1000', temperature: 'cool' },
  { route: '/hotone-jogg', label: 'HoTone JoGG', slug: 'hotone-jogg', temperature: 'warm' },
  { route: '/hotone-jogg', label: 'Generic Interface', slug: 'generic-interface', temperature: 'neutral' },
  { route: '/midi-cluster', label: 'MIDI Cluster', slug: 'midi-cluster', temperature: 'cool' },
  { route: '/api-observatory', label: 'API Observatory', slug: 'api-observatory', temperature: 'cool' },
]

const MANIFEST_INDEX = new Map(
  POSTER_MANIFEST.map((entry) => [`${entry.route}::${entry.label}`, entry]),
)

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

  return {
    route,
    label,
    slug: 'generic-interface',
    temperature: 'neutral',
  }
}
