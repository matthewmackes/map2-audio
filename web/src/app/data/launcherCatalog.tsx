import type { ComponentType } from 'react'
import { SettingsAdjust, Waveform } from '@carbon/icons-react'

import { FxDrums } from '../components/icons/effectIcons'
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
import { platformPinnedItems, type PlatformPinnedNavItem } from './platformMenuItems'

export type LandingTileSize = 'small' | 'medium' | 'large'
export type LauncherDirectory = 'core' | 'labs' | 'platforms' | 'nav-only'
export type LauncherCatalogCategory = 'Audio Interface' | 'Human Interface' | 'Platform'
export type LauncherStorefrontCollection = 'featured' | 'platform-essentials' | 'recently-added'
export const REQUIRED_HOME_LAUNCHER_ROUTE = '/platforms/overview'
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
}

type RouteLauncherSource = ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem
type StorefrontOverride = Partial<Pick<
  LauncherCatalogItem,
  'storefrontCollections' | 'featureBullets' | 'technicalSpecs' | 'availabilityNote' | 'documentLinks'
>>

const AUDIO_INTERFACE_DEVICE_TYPES = new Set(['edirol-ua1000', 'hotone-jogg', 'generic-interface'])
const HUMAN_INTERFACE_DEVICE_TYPES = new Set(['ableton-push', 'ground-control-pro', 'maschine-mk1'])
const FEATURED_ROUTE_SET = new Set([
  '/platforms/overview',
  '/juce-grid',
  '/artifacts',
  '/midi-hub',
  '/tesira',
  '/perform',
])
const PLATFORM_ESSENTIALS_ROUTE_SET = new Set([
  '/platforms/overview',
  '/platforms/audio-engine',
  '/platforms/management',
  '/platforms/avb-routing',
  '/platforms/network-discovery',
  '/platforms/cluster-dashboard',
  '/platforms/adoption',
])
const RECENTLY_ADDED_ROUTE_SET = new Set([
  '/platforms/workspace-catalog',
  '/platforms/adoption',
  '/platforms/cluster-dashboard',
  '/platforms/network-discovery',
  '/platforms/theme',
  '/platforms/about',
])

const HOME_ONLY_LAUNCHERS: LauncherCatalogCoreItem[] = [
  {
    route: '/drums',
    label: 'Drum Machine',
    heroTitle: 'Drum Machine',
    shortLabel: 'Drums',
    icon: ({ size = 20 }: { size?: number }) => <FxDrums width={size} height={size} />,
    description: 'Program patterns, kits, mixer state, and performance-ready sequencing from the dedicated drum-machine workspace.',
    category: 'Platform',
    color: 'var(--cds-support-info)',
    maturity: 'beta',
    directory: 'core',
    homeSection: 'Audio Grid',
    kind: 'link',
    landingEligible: true,
    navEligible: false,
  },
  {
    route: '/synth-forge',
    label: 'SynthForge',
    heroTitle: 'SynthForge',
    shortLabel: 'SynthForge',
    icon: Waveform,
    description: 'Open the flagship sampler and synthesis workstation for SoundFonts, patch design, performance control, and live play.',
    category: 'Platform',
    color: 'var(--cds-link-primary)',
    maturity: 'beta',
    directory: 'core',
    homeSection: 'Audio Grid',
    kind: 'link',
    landingEligible: true,
    navEligible: false,
  },
  {
    route: '/platforms/workspace-catalog',
    label: 'Workspace Catalog',
    heroTitle: 'Workspace Catalog',
    shortLabel: 'Catalog',
    icon: SettingsAdjust,
    description: 'Browse MAP2 workspaces through a Carbon storefront while keeping launcher placement and route controls one click away.',
    category: 'Platform',
    color: 'var(--cds-link-primary)',
    maturity: 'beta',
    directory: 'core',
    homeSection: 'System',
    kind: 'link',
    landingEligible: true,
    navEligible: false,
  },
]

const LAUNCHER_STOREFRONT_OVERRIDES: Record<string, StorefrontOverride> = {
  '/drums': {
    featureBullets: [
      'Puts kits, patterns, transport, mixer, and MIDI editing inside one dedicated drum-performance route.',
      'Keeps the drum-machine surface first-class even when operators are not working through the Audio Grid plugin modal.',
      'Supports direct launch from the catalog for songwriting, rehearsal, and rhythm-programming workflows.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Pattern sequencing, kit editing, transport, and drum-performance control' },
      { label: 'Workspace mode', value: 'Standalone Drum Machine route' },
      { label: 'Launch path', value: '/drums' },
      { label: 'Home placement', value: 'Eligible' },
    ],
    availabilityNote: 'Available as a dedicated routed workspace; live depth follows the current drum-engine state and loaded kits on the active host.',
  },
  '/synth-forge': {
    featureBullets: [
      'Delivers the full five-tab SynthForge workstation for SoundFont loading, patching, play control, and engine inspection.',
      'Promotes the flagship sampler and synthesis surface into the catalog without requiring entry through the Audio Grid plugin modal.',
      'Keeps direct launch available for instrument design, auditioning, and live performance workflows.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'SoundFont loading, patch design, play control, and engine tuning' },
      { label: 'Workspace mode', value: 'Standalone SynthForge workstation route' },
      { label: 'Launch path', value: '/synth-forge' },
      { label: 'Home placement', value: 'Eligible' },
    ],
    availabilityNote: 'Available as a routed instrument workspace; exact backend depth reflects the current sampler engine state and loaded content.',
  },
  '/platforms/overview': {
    storefrontCollections: ['featured', 'platform-essentials'],
    featureBullets: [
      'Supervisory platform entry point with node, alert, and operational posture visibility.',
      'Connects operators to management, AVB, discovery, and utility workspaces from one Carbon shell.',
      'Designed as the flagship starting surface for cluster-aware MAP2 deployments.',
    ],
    technicalSpecs: [
      { label: 'Primary audience', value: 'Operators and prospective platform evaluators' },
      { label: 'Surface mode', value: 'Routed Platforms overview workspace' },
      { label: 'Home placement', value: 'Required first launcher tile' },
      { label: 'Shell behavior', value: 'Utility-independent supervisory landing surface' },
    ],
    availabilityNote: 'Always available as the default Platforms destination, even when downstream workspaces have limited readiness.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'Operator navigation model', name: 'OPERATOR_NAVIGATION_MODEL.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
  },
  '/juce-grid': {
    storefrontCollections: ['featured', 'platform-essentials'],
    featureBullets: [
      'Build signal flow, routing, snapshots, and live control mappings from one editing surface.',
      'Unifies recallable rig state and performance control into the MAP2 snapshot-first workflow.',
      'Positions the JUCE engine as a polished operator tool rather than a low-level patch bay.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Routing, snapshots, and live-performance editing' },
      { label: 'Control model', value: 'Snapshot-first Carbon editor' },
      { label: 'Launch path', value: '/juce-grid' },
      { label: 'Shell nav', value: 'Pinned by default' },
    ],
    availabilityNote: 'Available whenever the JUCE workflow is enabled on the current host profile; runtime state remains visible in-app.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'Audio state authority architecture', name: 'architecture/AUDIO_STATE_AUTHORITY_ETCD_BIG_BANG.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
  },
  '/artifacts': {
    storefrontCollections: ['featured'],
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
  },
  '/midi-hub': {
    storefrontCollections: ['featured'],
    featureBullets: [
      'Centralizes routing, command workflows, scripts, presets, clocking, and diagnostics.',
      'Frames MIDI operations as a polished control product rather than a loose collection of utilities.',
      'Supports deeper controller orchestration while still offering one-click entry from the catalog.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Controller setup, routing, presets, and diagnostics' },
      { label: 'Category', value: 'Human Interface' },
      { label: 'Launch path', value: '/midi-hub' },
      { label: 'Shell nav', value: 'Pinnable' },
    ],
    availabilityNote: 'Available as a routed MAP2 workspace; downstream hardware status remains visible inside the MIDI surface.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'External operator field study', name: 'fit-for-purpose-evidence/t102-field-study-protocol.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
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
  '/platforms/workspace-catalog': {
    storefrontCollections: ['recently-added'],
    featureBullets: [
      'Curates MAP2 workspaces as a customer-facing storefront without adding commerce workflows.',
      'Preserves launch, Home placement, and shell pin controls for operational teams.',
      'Links each workspace to documentation references and readiness notes from the same surface.',
    ],
    technicalSpecs: [
      { label: 'Presentation model', value: 'Carbon digital storefront' },
      { label: 'Management controls', value: 'Launch, configure, landing placement, nav pinning' },
      { label: 'Launch path', value: '/platforms/workspace-catalog' },
      { label: 'Shell nav', value: 'Utility workspace only' },
    ],
    availabilityNote: 'Always available as an informational storefront and launcher-management utility inside Platforms.',
    documentLinks: [
      { label: 'Storefront brief', name: WORKSPACE_CATALOG_REFERENCE_DOC },
      { label: 'Operator navigation model', name: 'OPERATOR_NAVIGATION_MODEL.md' },
      { label: 'Subsystem maturity matrix', name: 'subsystem-maturity-matrix.md' },
    ],
  },
  '/platforms/audio-engine': {
    storefrontCollections: ['platform-essentials'],
    featureBullets: [
      'Highlights runtime posture, latency visibility, and engine-state inspection in one workspace.',
      'Makes the low-latency engine story legible to prospects without exposing implementation clutter.',
      'Keeps audio-state visibility routed through the same Platforms shell as the broader operational story.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Runtime, latency, and engine-state inspection' },
      { label: 'Audience', value: 'Engine operators and technical evaluators' },
      { label: 'Launch path', value: '/platforms/audio-engine' },
      { label: 'Shell nav', value: 'Pinnable' },
    ],
    availabilityNote: 'Available whenever the host exposes MAP2 engine telemetry; exact controls reflect current runtime readiness.',
  },
  '/platforms/management': {
    storefrontCollections: ['platform-essentials'],
    featureBullets: [
      'Surfaces node operations, readiness, and lifecycle management from the same routed platform shell.',
      'Packages operational depth into a polished management workspace instead of a disconnected admin page.',
      'Supports customer evaluation of cluster stewardship and host control depth.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Node operations and platform management' },
      { label: 'Launch path', value: '/platforms/management' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Home placement', value: 'Eligible' },
    ],
    availabilityNote: 'Available whenever MAP2 node operations are reachable; individual actions reflect current host permissions and health.',
  },
  '/platforms/avb-routing': {
    storefrontCollections: ['platform-essentials'],
    featureBullets: [
      'Presents AVB routing, transport posture, and related controls through a unified platform lens.',
      'Connects infrastructure evaluation to practical MAP2 operator workflows.',
      'Complements Tesira and cluster surfaces with route-focused operational context.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'AVB routing and transport context' },
      { label: 'Launch path', value: '/platforms/avb-routing' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Category', value: 'Platform' },
    ],
    availabilityNote: 'Available as a routed workspace; route depth depends on discovered AVB endpoints and live transport state.',
  },
  '/platforms/network-discovery': {
    storefrontCollections: ['platform-essentials', 'recently-added'],
    featureBullets: [
      'Frames discovery and connectivity posture as a first-class MAP2 product capability.',
      'Brings network visibility into the same Carbon workflow as node and audio operations.',
      'Supports customer evaluation of cluster readiness without leaving the platform shell.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Discovery, connectivity posture, and node context' },
      { label: 'Launch path', value: '/platforms/network-discovery' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Collection status', value: 'Recently added utility-forward workspace' },
    ],
    availabilityNote: 'Available when cluster telemetry is present; discovery detail follows existing MAP2-collected node-health signals.',
  },
  '/platforms/cluster-dashboard': {
    storefrontCollections: ['platform-essentials', 'recently-added'],
    featureBullets: [
      'Turns cluster reporting, health, and posture into a commercial-grade dashboard experience.',
      'Lets prospects evaluate how MAP2 scales from one host to many without a separate admin product.',
      'Complements overview and management with deeper cluster-centric visibility.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Cluster posture and reporting' },
      { label: 'Launch path', value: '/platforms/cluster-dashboard' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Category', value: 'Platform' },
    ],
    availabilityNote: 'Available whenever MAP2 can resolve cluster state; metrics depth scales with the current deployment topology.',
  },
  '/platforms/adoption': {
    storefrontCollections: ['platform-essentials', 'recently-added'],
    featureBullets: [
      'Shows how unmanaged or blocked nodes are brought into the MAP2 estate through a dedicated workflow.',
      'Demonstrates that platform onboarding is part of the product story, not a back-office script.',
      'Pairs adoption posture with the broader Platforms navigation and remediation model.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Node onboarding and remediation' },
      { label: 'Launch path', value: '/platforms/adoption' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Collection status', value: 'Recently added and platform-essential' },
    ],
    availabilityNote: 'Available when node inventory exists; exact adoption actions depend on current discovery and trust posture.',
  },
  '/platforms/theme': {
    storefrontCollections: ['recently-added'],
    featureBullets: [
      'Exposes Carbon theme direction, typography, and appearance control from a dedicated platform workspace.',
      'Makes product visual customization part of the customer-facing MAP2 story.',
      'Keeps appearance changes inside the same routed shell as operational tooling.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Theme presets, typography, and appearance' },
      { label: 'Launch path', value: '/platforms/theme' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Category', value: 'Platform' },
    ],
    availabilityNote: 'Available as a utility workspace without requiring any separate entitlement or external designer workflow.',
  },
  '/platforms/about': {
    storefrontCollections: ['recently-added'],
    featureBullets: [
      'Provides platform guide context, version framing, and document-library entry points.',
      'Helps prospects move from visual interest into supporting platform documentation.',
      'Keeps operational help and product explanation in a single routed experience.',
    ],
    technicalSpecs: [
      { label: 'Primary workflow', value: 'Guide, version context, and docs library' },
      { label: 'Launch path', value: '/platforms/about' },
      { label: 'Shell nav', value: 'Pinnable' },
      { label: 'Category', value: 'Platform' },
    ],
    availabilityNote: 'Always available as the documentation-oriented utility workspace inside Platforms.',
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
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of allRouteNavigationItems) {
    const directory = isLabsCatalogRoute(item) ? 'labs' : 'core'
    const launcher = enrichLauncherCatalogItem(toLauncherCatalogItem(item, directory))
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of HOME_ONLY_LAUNCHERS) {
    if (!byRoute.has(item.route)) {
      byRoute.set(item.route, enrichLauncherCatalogItem(item))
    }
  }

  const navOnlyItem = findPinnableNavigationItem('/hardware-interfaces')
  if (navOnlyItem) {
    byRoute.set('/hardware-interfaces', enrichLauncherCatalogItem({
      ...toLauncherCatalogItem(navOnlyItem, 'nav-only'),
      landingEligible: false,
      navEligible: true,
    }))
  }

  return Array.from(byRoute.values())
}

export const launcherCatalogItems = buildLauncherCatalog()

export const launcherCatalogByRoute = new Map(
  launcherCatalogItems.map((item) => [item.route, item] as const),
)

export function getLauncherCatalogItem(route: string | null | undefined): LauncherCatalogItem | null {
  if (!route) {
    return null
  }

  const normalizedRoute = canonicalizeNavigationRoute(route.trim())
  return launcherCatalogByRoute.get(normalizedRoute) ?? null
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
