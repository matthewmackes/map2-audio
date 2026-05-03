export const PLATFORM_LAYER_IDS = [
  'overview',
  'management',
  'network-discovery',
  'cluster-dashboard',
] as const

export type PlatformLayerId = (typeof PLATFORM_LAYER_IDS)[number]
export type PlatformView = 'stack' | 'layer'
export type PlatformHealth = 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown'
export type PlatformSeverity = 'info' | 'warning' | 'error' | 'critical'
export type PlatformTableValue = string | number | boolean | null

export interface PlatformSummaryMetric {
  id: string
  label: string
  value: string
  helper: string
  tone: PlatformHealth | 'info'
}

export interface PlatformGridItem {
  id: string
  title: string
  eyebrow: string
  metric: string
  helper: string
  status: PlatformHealth
  alertCount?: number
}

export interface PlatformTableColumn {
  key: string
  header: string
}

export interface PlatformTableRow {
  id: string
  [key: string]: PlatformTableValue
}

export interface PlatformNotification {
  id: string
  severity: PlatformSeverity
  title: string
  subtitle: string
}

export interface PlatformLayerMeta {
  id: PlatformLayerId
  label: string
  shortLabel: string
  description: string
  accent: string
}

export interface PlatformLayerData extends PlatformLayerMeta {
  health: PlatformHealth
  activityLevel: number
  alertCount: number
  isLoading: boolean
  error: string | null
  summaryMetrics: PlatformSummaryMetric[]
  gridItems: PlatformGridItem[]
  tableColumns: PlatformTableColumn[]
  tableRows: PlatformTableRow[]
  tableTitle: string
  tableDescription: string
  notifications: PlatformNotification[]
}

export interface PlatformAlert extends PlatformNotification {
  layerId: PlatformLayerId
}

export interface PlatformAnimationState {
  expandingLayer: PlatformLayerId | null
  collapsingLayer: PlatformLayerId | null
}

export const PLATFORM_LAYER_META: PlatformLayerMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'Cluster-wide health, activity, and deployment readiness in one board.',
    accent: 'var(--cds-support-warning)',
  },
  {
    id: 'management',
    label: 'Management',
    shortLabel: 'Mgmt',
    description: 'Platform operations, lifecycle posture, and service readiness for the selected node context.',
    accent: 'var(--cds-support-success)',
  },
  {
    id: 'network-discovery',
    label: 'Network Discovery',
    shortLabel: 'Discovery',
    description: 'Peer visibility, heartbeat readiness, and network reachability from collected cluster telemetry.',
    accent: 'var(--cds-support-error)',
  },
  {
    id: 'cluster-dashboard',
    label: 'Cluster Dashboard',
    shortLabel: 'Cluster',
    description: 'Node fleet posture, deployment mode, and operating headroom across the fabric.',
    accent: 'var(--cds-text-primary)',
  },
]

export function isPlatformLayerId(value: string | null | undefined): value is PlatformLayerId {
  return typeof value === 'string' && PLATFORM_LAYER_IDS.includes(value as PlatformLayerId)
}

// Nav reorg 2026-05-03 (second pass) — canonical platform layer
// hrefs live under `/node-ops/<id>` (was `/platforms/<id>`).
export function buildPlatformHref(layerId?: PlatformLayerId | null): string {
  return layerId ? `/node-ops/${encodeURIComponent(layerId)}` : '/node-ops/overview'
}

export function buildClusterDashboardHref(): string {
  return '/node-ops/cluster-dashboard'
}

export function makePlatformHealthRecord<T>(valueFactory: (layerId: PlatformLayerId) => T): Record<PlatformLayerId, T> {
  return PLATFORM_LAYER_IDS.reduce<Record<PlatformLayerId, T>>((acc, layerId) => {
    acc[layerId] = valueFactory(layerId)
    return acc
  }, {} as Record<PlatformLayerId, T>)
}
