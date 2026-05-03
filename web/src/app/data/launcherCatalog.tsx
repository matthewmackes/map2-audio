import type { ComponentType } from 'react'
import {
  advancedMenuItems,
  allRouteNavigationItems,
  canonicalizeNavigationRoute,
  findPinnableNavigationItem,
  type HardwareInterfaceMenuItem,
  type NavigationHomeSection,
  type NavigationMaturityState,
  type NavigationRenderKind,
  type ShellNavigationItem,
} from './advancedMenuItems'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'
import { platformPinnedItems, type PlatformPinnedNavItem } from './platformMenuItems'

export type LandingTileSize = 'small' | 'medium' | 'large'
export type LauncherDirectory = 'core' | 'labs' | 'platforms' | 'nav-only'
export type LauncherCatalogCategory = 'Audio Interface' | 'Human Interface' | 'Platform'
export type LauncherStorefrontCollection = 'featured' | 'platform-essentials' | 'recently-added'
// Nav reorg 2026-05-03 (second pass) — required home launcher is
// now `/node-ops` (was `/workspace`). The `/workspace` value stays
// resolvable via the LegacyWorkspaceRedirect in App.tsx, so any
// stale persisted home tile pointing at the old path still works.
export const REQUIRED_HOME_LAUNCHER_ROUTE = '/node-ops'
export const WORKSPACE_CATALOG_REFERENCE_DOC = 'WORKSPACE_CATALOG_STOREFRONT_REFERENCE.md'

export interface LandingTilePlacement {
  route: string
  size: LandingTileSize
}

export interface LauncherCatalogTechnicalSpec {
  label: string
  value: string
}

export interface LauncherCatalogDocumentLink {
  label: string
  name: string
}

export interface LauncherCatalogTreeChild {
  route: string
  label: string
}

interface LauncherCatalogCoreItem {
  route: string
  label: string
  heroTitle: string
  shortLabel?: string
  icon: ComponentType<any>
  description: string
  category: LauncherCatalogCategory
  color: string
  maturity: NavigationMaturityState
  directory: LauncherDirectory
  homeSection?: NavigationHomeSection | 'Platform'
  kind: NavigationRenderKind | 'link'
  deviceType?: string
  landingEligible: boolean
  navEligible: boolean
}

export interface LauncherCatalogItem extends LauncherCatalogCoreItem {
  storefrontCollections: LauncherStorefrontCollection[]
  featureBullets: string[]
  technicalSpecs: LauncherCatalogTechnicalSpec[]
  availabilityNote: string
  documentLinks: LauncherCatalogDocumentLink[]
  treeChildren?: LauncherCatalogTreeChild[]
}

export interface LauncherRoutePresentation extends LauncherCatalogCoreItem {
  treeChildren?: LauncherCatalogTreeChild[]
}

type RouteLauncherSource = ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem
type StorefrontOverride = Partial<Pick<
  LauncherCatalogItem,
  'storefrontCollections' | 'featureBullets' | 'technicalSpecs' | 'availabilityNote' | 'documentLinks' | 'treeChildren'
>>

const AUDIO_INTERFACE_DEVICE_TYPES = new Set(['edirol-ua1000', 'hotone-jogg', 'generic-interface'])
const HUMAN_INTERFACE_DEVICE_TYPES = new Set(['ableton-push', 'ground-control-pro', 'maschine-mk1', 'mackie-mcu-pro'])
const WORKSPACE_CATALOG_EXCLUDED_ROUTE_SET = new Set([
  '/juce-grid',
  '/midi-hub',
  // T2490 — AVB Services has its own dedicated /avb/* shell + tree
  // section; keep it out of the generic workspace catalog tiles.
  '/avb',
  '/hardware-interfaces',
  '/labs/push-surface',
  '/ground-control-pro',
  '/maschine',
  '/mcu',
  // Nav reorg 2026-05-03 (second pass) — node-ops sub-pages are not
  // standalone catalog tiles; they're sections inside the Node Ops
  // hub. Both the new canonical `/node-ops/*` paths and the legacy
  // `/platforms/*` paths are excluded so neither shape leaks tiles.
  '/platforms/workspace-catalog',
  '/platforms/audio-engine',
  '/platforms/management',
  '/platforms/avb-routing',
  '/platforms/network-discovery',
  '/platforms/cluster-dashboard',
  '/platforms/adoption',
  '/platforms/host-machine',
  '/platforms/theme',
  '/platforms/about',
  '/node-ops/audio-engine',
  '/node-ops/management',
  '/node-ops/network-discovery',
  '/node-ops/cluster-dashboard',
  '/node-ops/adoption',
  '/node-ops/theme',
  HOST_MACHINE_ROUTE,
  '/about',
])
// Nav reorg 2026-05-03 (second pass) — `/workspace` is no longer
// the canonical Node Ops base; `/node-ops` is. Keep both keys in
// FEATURED/ESSENTIALS for one transition cycle so anything that
// looks up by either path resolves correctly.
const FEATURED_ROUTE_SET = new Set([
  '/node-ops',
  '/workspace',
  '/tesira',
  '/perform',
])
const PLATFORM_ESSENTIALS_ROUTE_SET = new Set([
  '/node-ops',
  '/workspace',
])
const RECENTLY_ADDED_ROUTE_SET = new Set([
])

const HOME_ONLY_LAUNCHERS: LauncherCatalogCoreItem[] = []

// Nav reorg 2026-05-03 (second pass) — extracted as a const so the
// legacy `/workspace` and the canonical `/node-ops` keys can share
// the same override object below without duplication.
const NODE_OPS_STOREFRONT_OVERRIDE: StorefrontOverride = {
  storefrontCollections: ['featured', 'platform-essentials'],
  featureBullets: [
    'Unified node-ops hub for platform posture, audio engine telemetry, network discovery, cluster dashboard, and operator midpoint.',
    'Connects operators to the canonical `/node-ops/*` sections from one Carbon shell instead of legacy route roots.',
    'Designed as the flagship starting surface for cluster-aware MAP2 deployments.',
  ],
  technicalSpecs: [
    { label: 'Primary audience', value: 'Operators and prospective platform evaluators' },
    { label: 'Surface mode', value: 'Node Ops hub shell with section-level routed content' },
    { label: 'Home placement', value: 'Required first launcher tile' },
    { label: 'Launch path', value: '/node-ops' },
  ],
  availabilityNote: 'Always available as the canonical node-ops destination, even when individual sections have limited readiness.',
  documentLinks: [
    { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
    { label: 'Operator navigation model', name: 'OPERATOR_NAVIGATION_MODEL.md' },
    { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
  ],
}

const LAUNCHER_STOREFRONT_OVERRIDES: Record<string, StorefrontOverride> = {
  // Canonical Node Ops key (used by all post-reorg launcher lookups).
  '/node-ops': {
    ...NODE_OPS_STOREFRONT_OVERRIDE,
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'Operator navigation model', name: 'OPERATOR_NAVIGATION_MODEL.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
    // Nav reorg 2026-05-03 (second pass) — Node Ops is now a true
    // canonical group: every child page lives one level below the
    // group and uses the new `/node-ops/*` URL space (no more
    // `/workspace/platforms/` middle segment). Audio Artifacts has
    // been promoted back to its own top-level service group (under
    // `/artifacts`); About has been removed from the Node Ops tree
    // because it's already a top-level Platform Guide entry; AVB
    // Routing is on its own /avb shell; Device Manager moved to
    // Hardware nav (URL stays under /node-ops/management); Theme
    // moved to Settings nav (URL stays under /node-ops/theme); Chains
    // is its own top-level leaf. What remains here is just the platform
    // infrastructure operators consume from the Node Ops parent.
    treeChildren: [
      { route: '/node-ops/overview', label: 'Overview' },
      { route: '/node-ops/audio-engine', label: 'Audio Engine' },
      { route: '/node-ops/network-discovery', label: 'Network Discovery' },
      { route: '/node-ops/cluster-dashboard', label: 'Cluster Dashboard' },
      { route: '/node-ops/midpoint', label: 'Midpoint' },
      { route: '/node-ops/adoption', label: 'Adoption' },
    ],
  },
  // Nav reorg 2026-05-03 (second pass) — Audio Artifacts promoted
  // back to its own top-level service group at the canonical
  // `/artifacts` URL (was `/workspace/artifacts`). The legacy
  // `/workspace/artifacts` storefront key is retained as an alias
  // below pointing at the same overrides so any inbound launcher
  // tile still resolves.
  '/artifacts': {
    featureBullets: [
      'Unified library for plugins, NAM captures, IRs, SoundFonts, and native JUCE processors.',
      'Presents node-aware asset coverage and remediation from a single Carbon-managed inventory.',
      'Reduces the sprawl of separate plugin and content tools into one commercial-grade browser.',
    ],
    technicalSpecs: [
      { label: 'Library scope', value: 'Plugins, presets, NAM, IR, SoundFont, and native processors' },
      { label: 'Node awareness', value: 'Local and cluster-aware inventory' },
      { label: 'Launch path', value: '/artifacts' },
      { label: 'Home placement', value: 'Eligible' },
    ],
    availabilityNote: 'Available without payment or catalog checkout; inventory visibility follows the selected node and installed asset set.',
    treeChildren: [
      { route: '/artifacts', label: 'Overview' },
      { route: '/artifacts?category=lv2-plugins', label: 'LV2 Plugins' },
      { route: '/artifacts?category=nam-models', label: 'NAM Models' },
      { route: '/artifacts?category=cabinet-irs', label: 'Cabinet IRs' },
      { route: '/artifacts?category=reverb-irs', label: 'Reverb IRs' },
      { route: '/artifacts?category=soundfonts', label: 'SoundFonts' },
      { route: '/artifacts?category=native-juce', label: 'Native JUCE' },
      { route: '/artifacts?category=snapshots', label: 'Snapshots' },
      { route: '/artifacts/discover', label: 'Discover' },
    ],
  },
  '/tesira': {
    storefrontCollections: ['featured'],
    featureBullets: [
      'Brings Biamp Tesira fleet views, DSP surfaces, AVB context, and device diagnostics into MAP2.',
      'Turns infrastructure-heavy AVB operations into a discoverable product surface for prospects.',
      'Pairs device-level pages with platform-level routing and fleet visibility.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Fleet views, AVB context, and DSP operations' },
      { label: 'Integration domain', value: 'Biamp Tesira AVB' },
      { label: 'Launch path', value: '/tesira' },
      { label: 'Home placement', value: 'Catalog only' },
    ],
    availabilityNote: 'Available even before Tesira hardware is online; live control depth depends on detected devices and integration reachability.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'AVB capabilities and use cases', name: 'MAP2_AVB_Capabilities_and_Usecases_2026-02-14.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
  },
  '/snapshot-editor': {
    // Nav reorg 2026-05-03 — Snapshot Editor is a flat top-level
    // entry. Its prior pseudo-children (Control Panel, Platform Guide)
    // were navigation crutches from the old shortcut-row layout and
    // had no semantic relationship to snapshot editing. Removed so the
    // tree node renders as a leaf.
    treeChildren: [],
  },
  '/brain': {
    // T2442: Brain Overview tabs (Performance / Console / Step / Split) are now
    // first-class `?section=` values, alongside the other Brain sections.
    treeChildren: [
      { route: '/brain?section=performance', label: 'Performance' },
      { route: '/brain?section=console', label: 'Console' },
      { route: '/brain?section=step', label: 'Step' },
      { route: '/brain?section=split', label: 'Split' },
      { route: '/brain?section=perform', label: 'Perform' },
      { route: '/brain?section=layers', label: 'Layers' },
      { route: '/brain?section=sequence', label: 'Sequence' },
      { route: '/brain?section=routing', label: 'Routing' },
      { route: '/brain?section=inputs', label: 'Inputs' },
      { route: '/brain?section=library', label: 'Library' },
      { route: '/brain?section=diagnostics', label: 'Diagnostics' },
      { route: '/brain?section=session_media', label: 'Session Media' },
      { route: '/brain?section=practice_coach', label: 'Practice Coach' },
    ],
  },
  '/avb': {
    // T2490 — AVB Services tree section. Sibling of MIDI Advanced;
    // sits above Node Ops in the global navigation tree. The 6
    // sub-routes match the AvbServicesTabs in the /avb/* shell.
    treeChildren: [
      { route: '/avb/overview', label: 'Overview' },
      { route: '/avb/connections', label: 'Connections' },
      { route: '/avb/bindings', label: 'Bindings' },
      { route: '/avb/devices', label: 'Devices' },
      { route: '/avb/routing', label: 'Routing' },
      { route: '/avb/network', label: 'Network' },
    ],
  },
  '/midi-hub': {
    // T2491 (2026-05-02 cleanup) — re-pointed all 7 existing children
    // from the legacy /midi-hub/* paths to the canonical /midi/* mount
    // that T2482-T2486 unified to. The '/midi-hub' object key stays
    // because GlobalTreeNav.tsx uses it as the parent node id; only
    // the children's `route` fields move to the canonical surface.
    // Added 3 previously-invisible siblings: Devices (T2485 unified
    // device-pack mount), Bindings (T2483 canonical binding authority
    // surface), and Routing (T2484 cluster matrix region). Operators
    // clicking any of these now land on the canonical /midi/* surface,
    // not the legacy MidiHub*Page bodies.
    treeChildren: [
      { route: '/midi/connections', label: 'Connections' },
      { route: '/midi/devices', label: 'Devices' },
      { route: '/midi/bindings', label: 'Bindings' },
      { route: '/midi/routing', label: 'Routing' },
      { route: '/midi/presets', label: 'Presets' },
      { route: '/midi/transport', label: 'Transport' },
      { route: '/midi/events', label: 'Events' },
      { route: '/midi/processing', label: 'Processing' },
      { route: '/midi/network', label: 'Network' },
      { route: '/midi/lab', label: 'Lab' },
    ],
  },
  '/mpx1': {
    // T2491 cleanup — children re-pointed to the canonical
    // /midi/devices/lexicon-mpx1/* mount (T2485-4). The '/mpx1'
    // storefront-override key remains for backward compatibility with
    // any /mpx1 launcher tile.
    treeChildren: [
      { route: '/midi/devices/lexicon-mpx1/panel', label: 'Panel' },
      { route: '/midi/devices/lexicon-mpx1/editor', label: 'Editor' },
      { route: '/midi/devices/lexicon-mpx1/midi-map', label: 'MIDI Map' },
      { route: '/midi/devices/lexicon-mpx1/matrix', label: 'Matrix' },
      { route: '/midi/devices/lexicon-mpx1/library', label: 'Library' },
      { route: '/midi/devices/lexicon-mpx1/perform', label: 'Perform' },
      { route: '/midi/devices/lexicon-mpx1/diag', label: 'Diagnostics' },
      { route: '/midi/devices/lexicon-mpx1/flow', label: 'Signal Flow' },
    ],
  },
  '/intelfx': {
    // T2491 cleanup — children re-pointed to the canonical
    // /midi/devices/rocktron-intelfx/* mount (T2485-5).
    treeChildren: [
      { route: '/midi/devices/rocktron-intelfx/panel', label: 'Panel' },
      { route: '/midi/devices/rocktron-intelfx/editor', label: 'Editor' },
      { route: '/midi/devices/rocktron-intelfx/midi-map', label: 'MIDI Map' },
      { route: '/midi/devices/rocktron-intelfx/library', label: 'Library' },
      { route: '/midi/devices/rocktron-intelfx/perform', label: 'Perform' },
      { route: '/midi/devices/rocktron-intelfx/diag', label: 'Diagnostics' },
      { route: '/midi/devices/rocktron-intelfx/flow', label: 'Signal Flow' },
    ],
  },
  '/settings': {
    // Nav reorg 2026-05-03 (second pass) — Settings is a virtual
    // top-level group for operator/UI preferences. Theme is its sole
    // child; the underlying route is `/node-ops/theme` (a node-ops
    // standalone panel). The Settings group does not have its own
    // canonical URL; clicking the Settings parent in the tree opens
    // the first child.
    treeChildren: [
      { route: '/node-ops/theme', label: 'Theme' },
    ],
  },
  '/lcd': {
    featureBullets: [
      'Presents an external display and hardware-panel workflow as part of the MAP2 storefront story.',
      'Makes readiness limits explicit without hiding the product concept from prospects.',
      'Uses customer-facing status language when hardware is not currently present.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'External display and hardware-panel surface' },
      { label: 'Launch path', value: '/lcd' },
      { label: 'Availability model', value: 'Hardware dependent' },
      { label: 'Category', value: 'Human Interface' },
    ],
    availabilityNote: 'Hardware Not Detected until the dedicated LCD path and qualification evidence are present on the current host.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'Polling standards reference', name: 'POLLING_STANDARDS.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
  },
  // Nav reorg 2026-05-03 (second pass) — legacy `/workspace` key
  // shares the canonical Node Ops override so any storefront tile or
  // launcher lookup that still arrives via the old route resolves
  // identically. The `/workspace/artifacts` legacy key shares the
  // canonical `/artifacts` override for the same reason.
  '/workspace': NODE_OPS_STOREFRONT_OVERRIDE,
}

function routeItemKey(item: ShellNavigationItem | HardwareInterfaceMenuItem): string {
  return `${item.to}::${item.label}`
}

const labsLauncherKeySet = new Set(advancedMenuItems.map((item) => routeItemKey(item)))

function isLabsCatalogRoute(item: ShellNavigationItem | HardwareInterfaceMenuItem): boolean {
  return (
    labsLauncherKeySet.has(routeItemKey(item))
    || item.maturity === 'experimental'
    || (item.maturity === 'hardware-blocked' && item.kind !== 'hardware-submenu')
  )
}

function resolveLauncherCatalogCategory(
  item: RouteLauncherSource,
  route: string,
): LauncherCatalogCategory {
  const deviceType = 'deviceType' in item ? item.deviceType : undefined
  const homeSection = 'homeSection' in item ? item.homeSection : 'Platform'

  if (route === '/hardware-interfaces' || (deviceType && AUDIO_INTERFACE_DEVICE_TYPES.has(deviceType))) {
    return 'Audio Interface'
  }

  if (homeSection === 'MIDI' || route === '/lcd' || (deviceType && HUMAN_INTERFACE_DEVICE_TYPES.has(deviceType))) {
    return 'Human Interface'
  }

  return 'Platform'
}

export function getLauncherCatalogMaturityLabel(maturity: LauncherCatalogItem['maturity']): string {
  switch (maturity) {
    case 'qualified-with-waiver':
      return 'Qualified With Waiver'
    case 'hardware-blocked':
      return 'Hardware Not Detected'
    case 'production':
      return 'Production'
    case 'beta':
      return 'Beta'
    case 'experimental':
      return 'Experimental'
    default:
      return 'Beta'
  }
}

function buildDefaultStorefrontCollections(route: string): LauncherStorefrontCollection[] {
  const collections: LauncherStorefrontCollection[] = []

  if (FEATURED_ROUTE_SET.has(route)) {
    collections.push('featured')
  }
  if (PLATFORM_ESSENTIALS_ROUTE_SET.has(route)) {
    collections.push('platform-essentials')
  }
  if (RECENTLY_ADDED_ROUTE_SET.has(route)) {
    collections.push('recently-added')
  }

  return collections
}

export function compareLauncherCatalogItems(left: LauncherCatalogItem, right: LauncherCatalogItem): number {
  const leftWeight
    = (left.storefrontCollections.includes('featured') ? 0 : 10)
    + (left.storefrontCollections.includes('platform-essentials') ? 0 : 5)
    + (left.storefrontCollections.includes('recently-added') ? 0 : 2)
  const rightWeight
    = (right.storefrontCollections.includes('featured') ? 0 : 10)
    + (right.storefrontCollections.includes('platform-essentials') ? 0 : 5)
    + (right.storefrontCollections.includes('recently-added') ? 0 : 2)

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight
  }

  const categoryCompare = left.category.localeCompare(right.category)
  if (categoryCompare !== 0) {
    return categoryCompare
  }

  return left.heroTitle.localeCompare(right.heroTitle)
}

function buildDefaultFeatureBullets(item: LauncherCatalogCoreItem): string[] {
  if (item.category === 'Audio Interface') {
    return [
      'Surfaces device-aware connection status and hardware-specific controls.',
      'Keeps interface workflows in the same MAP2 catalog as higher-level operational workspaces.',
      'Communicates readiness clearly before operators commit to the route.',
    ]
  }

  if (item.category === 'Human Interface') {
    return [
      'Packages performer and controller workflows into a dedicated MAP2 surface.',
      'Balances hardware awareness with direct route access from the catalog.',
      'Shows how MAP2 extends beyond infrastructure into tactile control experiences.',
    ]
  }

  return [
    'Presents a platform-level MAP2 workflow through a unified Carbon surface.',
    'Keeps launch and placement controls available without exposing checkout or community features.',
    'Pairs operational depth with documentation-linked product framing for evaluation.',
  ]
}

function buildDefaultTechnicalSpecs(item: LauncherCatalogCoreItem): LauncherCatalogTechnicalSpec[] {
  const specs: LauncherCatalogTechnicalSpec[] = [
    { label: 'Launch path', value: item.route },
    { label: 'Category', value: item.category },
    { label: 'Home tile', value: item.landingEligible ? 'Eligible' : 'Catalog only' },
    { label: 'Shell nav', value: item.navEligible ? 'Pinnable' : 'Not pinnable' },
  ]

  if (item.deviceType) {
    specs.splice(1, 0, { label: 'Device profile', value: item.deviceType })
  }

  return specs
}

function buildDefaultAvailabilityNote(item: LauncherCatalogCoreItem): string {
  if (item.maturity === 'hardware-blocked') {
    return 'Hardware Not Detected until the required device, environment, or qualification path is present on the current MAP2 host.'
  }

  if (item.category === 'Audio Interface') {
    return 'Availability follows detected hardware on the active host profile; the route still provides status context when hardware is offline.'
  }

  if (item.category === 'Human Interface') {
    return 'Available as part of the MAP2 experience, with deeper controls reflecting the current controller or peripheral state.'
  }

  return 'Available as a routed MAP2 workspace with live depth determined by the current platform state, connected nodes, and detected services.'
}

function buildDefaultDocumentLinks(item: LauncherCatalogCoreItem): LauncherCatalogDocumentLink[] {
  const docs: LauncherCatalogDocumentLink[] = [
    { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
    { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
  ]

  if (item.route.startsWith('/platforms/')) {
    docs.splice(1, 0, { label: 'Operator navigation model', name: 'OPERATOR_NAVIGATION_MODEL.md' })
  }

  return docs
}

function dedupeDocumentLinks(links: LauncherCatalogDocumentLink[]): LauncherCatalogDocumentLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (!link.name || seen.has(link.name)) {
      return false
    }

    seen.add(link.name)
    return true
  })
}

function enrichLauncherCatalogItem(item: LauncherCatalogCoreItem): LauncherCatalogItem {
  const override = LAUNCHER_STOREFRONT_OVERRIDES[item.route]

  return {
    ...item,
    storefrontCollections: override?.storefrontCollections ?? buildDefaultStorefrontCollections(item.route),
    featureBullets: override?.featureBullets ?? buildDefaultFeatureBullets(item),
    technicalSpecs: override?.technicalSpecs ?? buildDefaultTechnicalSpecs(item),
    availabilityNote: override?.availabilityNote ?? buildDefaultAvailabilityNote(item),
    documentLinks: dedupeDocumentLinks([
      ...buildDefaultDocumentLinks(item),
      ...(override?.documentLinks ?? []),
    ]),
    treeChildren: override?.treeChildren,
  }
}

function toLauncherCatalogItem(
  item: RouteLauncherSource,
  directory: LauncherDirectory,
): LauncherCatalogCoreItem {
  const route = canonicalizeNavigationRoute(item.to)

  return {
    route,
    label: item.label,
    heroTitle: item.label,
    shortLabel: item.shortLabel,
    icon: item.icon,
    description: item.description,
    category: resolveLauncherCatalogCategory(item, route),
    color: item.color,
    maturity: item.maturity,
    directory,
    homeSection: 'homeSection' in item ? item.homeSection : 'Platform',
    kind: item.kind,
    deviceType: 'deviceType' in item ? item.deviceType : undefined,
    landingEligible: item.kind !== 'hardware-submenu' && route !== '/',
    navEligible: item.pinnable,
  }
}

function buildLauncherCatalog(): LauncherCatalogItem[] {
  const byRoute = new Map<string, LauncherCatalogItem>()

  for (const item of platformPinnedItems) {
    const launcher = enrichLauncherCatalogItem(toLauncherCatalogItem(item, 'platforms'))
    if (launcher.route === REQUIRED_HOME_LAUNCHER_ROUTE) {
      continue
    }
    if (WORKSPACE_CATALOG_EXCLUDED_ROUTE_SET.has(launcher.route)) {
      continue
    }
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of allRouteNavigationItems) {
    const directory = isLabsCatalogRoute(item) ? 'labs' : 'core'
    const launcher = enrichLauncherCatalogItem(toLauncherCatalogItem(item, directory))
    if (WORKSPACE_CATALOG_EXCLUDED_ROUTE_SET.has(launcher.route)) {
      continue
    }
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of HOME_ONLY_LAUNCHERS) {
    if (WORKSPACE_CATALOG_EXCLUDED_ROUTE_SET.has(item.route)) {
      continue
    }
    if (!byRoute.has(item.route)) {
      byRoute.set(item.route, enrichLauncherCatalogItem(item))
    }
  }

  const navOnlyItem = findPinnableNavigationItem('/hardware-interfaces')
  if (navOnlyItem && !WORKSPACE_CATALOG_EXCLUDED_ROUTE_SET.has('/hardware-interfaces')) {
    byRoute.set('/hardware-interfaces', enrichLauncherCatalogItem({
      ...toLauncherCatalogItem(navOnlyItem, 'nav-only'),
      landingEligible: false,
      navEligible: true,
    }))
  }

  return Array.from(byRoute.values())
}

export const launcherCatalogItems = buildLauncherCatalog()
export const launcherCatalogDisplayItems = [...launcherCatalogItems].sort(compareLauncherCatalogItems)

export const launcherCatalogByRoute = new Map(
  launcherCatalogItems.map((item) => [item.route, item] as const),
)

const launcherRoutePresentationByRoute = new Map<string, LauncherRoutePresentation>()

for (const item of platformPinnedItems) {
  const routePresentation = toLauncherCatalogItem(item, 'platforms')
  launcherRoutePresentationByRoute.set(routePresentation.route, {
    ...routePresentation,
    treeChildren: LAUNCHER_STOREFRONT_OVERRIDES[routePresentation.route]?.treeChildren,
  })
}

for (const item of allRouteNavigationItems) {
  const routePresentation = toLauncherCatalogItem(item, isLabsCatalogRoute(item) ? 'labs' : 'core')
  if (!launcherRoutePresentationByRoute.has(routePresentation.route)) {
    launcherRoutePresentationByRoute.set(routePresentation.route, {
      ...routePresentation,
      treeChildren: LAUNCHER_STOREFRONT_OVERRIDES[routePresentation.route]?.treeChildren,
    })
  }
}

for (const item of HOME_ONLY_LAUNCHERS) {
  if (!launcherRoutePresentationByRoute.has(item.route)) {
    launcherRoutePresentationByRoute.set(item.route, {
      ...item,
      treeChildren: LAUNCHER_STOREFRONT_OVERRIDES[item.route]?.treeChildren,
    })
  }
}

export function getLauncherCatalogItem(route: string | null | undefined): LauncherCatalogItem | null {
  if (!route) {
    return null
  }

  const normalizedRoute = canonicalizeNavigationRoute(route.trim())
  return launcherCatalogByRoute.get(normalizedRoute) ?? null
}

export function getLauncherRoutePresentation(route: string | null | undefined): LauncherRoutePresentation | null {
  if (!route) {
    return null
  }

  const normalizedRoute = canonicalizeNavigationRoute(route.trim())
  const launcherItem = launcherCatalogByRoute.get(normalizedRoute)
  if (launcherItem) {
    return launcherItem
  }

  return launcherRoutePresentationByRoute.get(normalizedRoute) ?? null
}

export function getLauncherCatalogTreeChildren(route: string | null | undefined): LauncherCatalogTreeChild[] {
  if (!route) {
    return []
  }

  const normalizedRoute = canonicalizeNavigationRoute(route.trim())
  return LAUNCHER_STOREFRONT_OVERRIDES[normalizedRoute]?.treeChildren ?? launcherCatalogByRoute.get(normalizedRoute)?.treeChildren ?? []
}

export function isLandingTileSize(value: string | null | undefined): value is LandingTileSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

export function normalizeLandingTiles(
  tiles: Array<LandingTilePlacement | { route?: string | null; size?: string | null }> | null | undefined,
): LandingTilePlacement[] {
  if (!tiles || tiles.length === 0) {
    return []
  }

  const normalized: LandingTilePlacement[] = []
  const seen = new Set<string>()

  for (const rawTile of tiles) {
    const rawRoute = typeof rawTile?.route === 'string' ? rawTile.route.trim() : ''
    const route = canonicalizeNavigationRoute(rawRoute)
    const rawSize = typeof rawTile?.size === 'string' ? rawTile.size.trim().toLowerCase() : 'medium'
    const size = isLandingTileSize(rawSize) ? rawSize : null
    const launcher = getLauncherCatalogItem(route)

    if (!launcher || !launcher.landingEligible || !size || seen.has(route)) {
      continue
    }

    seen.add(route)
    normalized.push({ route, size })
  }

  return normalized
}

export function prioritizeRequiredHomeLauncher(tiles: LandingTilePlacement[]): LandingTilePlacement[] {
  const requiredIndex = tiles.findIndex((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)
  if (requiredIndex <= 0) {
    return tiles
  }

  const nextTiles = [...tiles]
  const [requiredTile] = nextTiles.splice(requiredIndex, 1)
  nextTiles.unshift(requiredTile)
  return nextTiles
}

export function ensureRequiredHomeLauncher(
  tiles: LandingTilePlacement[],
  size: LandingTileSize = 'medium',
): LandingTilePlacement[] {
  if (tiles.some((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)) {
    return tiles
  }

  const launcher = getLauncherCatalogItem(REQUIRED_HOME_LAUNCHER_ROUTE)
  if (!launcher || !launcher.landingEligible) {
    return tiles
  }

  return [{ route: REQUIRED_HOME_LAUNCHER_ROUTE, size }, ...tiles]
}
