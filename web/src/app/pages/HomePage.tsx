import { useCallback, useEffect, useMemo, useState } from 'react'
import { HeroDotGrid } from '../components/HeroDotGrid/HeroDotGrid'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Pin, PinFilled } from '@carbon/icons-react'
import { ApiActivityOverlay } from '../components/ApiActivityOverlay/ApiActivityOverlay'
import {
  Map2BrandMark,
  MAP2_PLATFORM_VERSION,
  MAP2_PLATFORM_NAME,
  MAP2_PRIMARY_LABEL,
} from '../components/branding/map2Branding'
import { resolveHomeCardProfile } from '../data/homeCardProfiles'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import {
  allPinnableNavigationItems,
  homeNavigationTabSections,
  MAX_PINNED_NAV_ITEMS,
  navigationMaturityMeta,
  normalizePinnedRoutes,
  type AdvancedMenuItem,
  type HardwareInterfaceMenuItem,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { isBlockedAdvancedMenuItem } from '../layout/advancedMenuState'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './HomePage.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type HomeNavigationItem = ShellNavigationItem | HardwareInterfaceMenuItem

interface ClusterTile {
  id: string
  hostname: string
  ip: string
  status: 'online' | 'degraded' | 'offline' | 'updating' | 'maintenance'
  role: string
  healthScore: number
  cpuRam: string
  audioDevices: string[]
  version: string
  lastSeenSeconds: number
  isLocal: boolean
}

interface HostMachineInfoResponse {
  hostname?: string
  cpu_cores?: number
  total_memory_mb?: number
}

interface NetworkInterfaceStatus {
  enabled?: boolean
  connected?: boolean
  ip_address?: string | null
}

interface NetworkStatusResponse {
  hostname?: string
  ethernet?: NetworkInterfaceStatus[]
  wifi?: NetworkInterfaceStatus[]
}

interface ClusterHardwareNode {
  node_id?: string
  hostname?: string
  audio_interfaces?: unknown[]
  usb_audio_devices?: unknown[]
  status?: string
  last_updated?: string
}

interface ClusterDevicesResponse {
  nodes?: Record<string, ClusterHardwareNode>
}

interface PeerInfoResponse {
  node_id?: string
  node_mode?: string
  host?: string
  last_seen?: string | null
  latency_ms?: number | null
}

interface PeersResponse {
  local_node_id?: string
  peers?: PeerInfoResponse[]
}

interface DiscoveredNodeCapabilities {
  cpu_cores?: number
  memory_gb?: number
  audio_interfaces?: string[]
}

interface DiscoveredNodeResponse {
  node_id?: string
  hostname?: string
  addresses?: string[]
  role?: string
  health_score?: number
  last_seen?: string | null
  capabilities?: DiscoveredNodeCapabilities
}

interface ClusterDiscoveredResponse {
  nodes?: DiscoveredNodeResponse[]
}

interface DeploymentModeResponse {
  mode?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scopedHomeApiPath(url: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return url
  const normalized = url.startsWith('/api/') ? url.slice(5) : url.replace(/^\//, '')
  return `/api/node/${encodeURIComponent(nodeId)}/proxy/${normalized}`
}

async function fetchJsonOrNull<T>(url: string, nodeId?: string | null): Promise<T | null> {
  try {
    const response = await fetch(scopedHomeApiPath(url, nodeId))
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function resolvePinnedRoutes(routes: string[] | null | undefined): string[] {
  const requested = normalizePinnedRoutes(routes)
  return allPinnableNavigationItems
    .filter((item) => item.to !== '/' && requested.includes(item.to))
    .map((item) => item.to)
    .slice(0, MAX_PINNED_NAV_ITEMS)
}

function isBlockedHomeItem(item: HomeNavigationItem): boolean {
  return 'includeInAdvancedMenu' in item
    ? isBlockedAdvancedMenuItem(item as AdvancedMenuItem)
    : false
}

function parseLastSeenSeconds(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000))
}

function resolveString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => resolveString(value)).filter((value): value is string => Boolean(value)))]
}

function roundNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric)
}

function roundMemoryGbFromMb(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.max(1, Math.round(numeric / 1024))
}

function formatCpuRam(cpuCores: unknown, memoryGb: unknown): string {
  const cpuCount = roundNumber(cpuCores)
  const memory = roundNumber(memoryGb)
  const cpuLabel = cpuCount != null && cpuCount > 0 ? `${cpuCount} cores` : 'CPU unknown'
  const memoryLabel = memory != null && memory > 0 ? `${memory} GB` : 'RAM unknown'
  return `${cpuLabel} · ${memoryLabel}`
}

function normalizeAudioDevices(
  hardwareNode: ClusterHardwareNode | null | undefined,
  fallbackInterfaces: unknown[] = [],
): string[] {
  const interfaceNames = Array.isArray(hardwareNode?.audio_interfaces)
    ? hardwareNode.audio_interfaces.map((value) => resolveString(value)).filter((value): value is string => Boolean(value))
    : []
  const usbNames = Array.isArray(hardwareNode?.usb_audio_devices)
    ? hardwareNode.usb_audio_devices
        .map((device) => {
          if (typeof device === 'string') return resolveString(device)
          if (!device || typeof device !== 'object') return null
          if ('name' in device) return resolveString((device as { name?: unknown }).name)
          if ('product' in device) return resolveString((device as { product?: unknown }).product)
          return null
        })
        .filter((value): value is string => Boolean(value))
    : []
  const discoveredNames = Array.isArray(fallbackInterfaces)
    ? fallbackInterfaces.map((value) => resolveString(value)).filter((value): value is string => Boolean(value))
    : []

  const merged = uniqueStrings([...interfaceNames, ...usbNames, ...discoveredNames])
  return merged.length > 0 ? merged : ['Audio device unavailable']
}

function resolveLocalNodeId(
  peers: PeersResponse | null,
  devices: ClusterDevicesResponse | null,
  hostnames: string[],
): string {
  const peerNodeId = resolveString(peers?.local_node_id)
  if (peerNodeId) return peerNodeId

  const nodeEntries = Object.entries(devices?.nodes ?? {})
  const hostnameSet = new Set(hostnames.map((value) => value.toLowerCase()))
  const matchedByHostname = nodeEntries.find(([, node]) => {
    const hostname = resolveString(node.hostname)
    return hostname ? hostnameSet.has(hostname.toLowerCase()) : false
  })
  if (matchedByHostname) return matchedByHostname[0]

  if (nodeEntries.length === 1) return nodeEntries[0][0]

  return hostnames[0] ?? 'local-node'
}

function inferRoleFromNodeId(nodeId: string | null | undefined): string | null {
  const normalized = resolveString(nodeId)?.toUpperCase() ?? null
  if (!normalized) return null

  for (const role of ['MANAGEMENT-NODE', 'AUDIO-NODE', 'STANDBY-NODE']) {
    if (normalized.startsWith(role)) return role
  }

  return null
}

function resolveRole(
  nodeId: string | null | undefined,
  role: string | null | undefined,
  deploymentMode: string | null | undefined,
): string {
  const explicitRole = resolveString(role)?.toUpperCase()
  if (explicitRole) return explicitRole

  const nodeRole = inferRoleFromNodeId(nodeId)
  if (nodeRole) return nodeRole

  switch (resolveString(deploymentMode)?.toUpperCase()) {
    case 'AUDIO-NODE':
      return 'AUDIO-NODE'
    case 'ALL-IN-ONE':
    case 'CONTROL-NODE':
    case 'FRONTEND-ONLY':
      return 'MANAGEMENT-NODE'
    default:
      return 'NODE'
  }
}

function resolvePrimaryAddress(node: DiscoveredNodeResponse | null | undefined): string | null {
  if (!Array.isArray(node?.addresses)) return null

  const address = node.addresses.find((value) => {
    const resolved = resolveString(value)
    return resolved != null && resolved !== '::1' && !resolved.startsWith('127.')
  })
  return address ? resolveString(address) : null
}

function resolveLocalIp(
  network: NetworkStatusResponse | null,
  discoveredNode: DiscoveredNodeResponse | null | undefined,
): string {
  const interfaces = [...(network?.ethernet ?? []), ...(network?.wifi ?? [])]
  const connectedInterface = interfaces.find((item) => item.connected && resolveString(item.ip_address))
  if (connectedInterface?.ip_address) return connectedInterface.ip_address

  const enabledInterface = interfaces.find((item) => item.enabled && resolveString(item.ip_address))
  if (enabledInterface?.ip_address) return enabledInterface.ip_address

  const discoveredAddress = resolvePrimaryAddress(discoveredNode)
  if (discoveredAddress) return discoveredAddress

  const browserHostname = resolveString(window.location.hostname)
  if (browserHostname && browserHostname !== 'localhost' && browserHostname !== '127.0.0.1') {
    return browserHostname
  }

  return 'IP unavailable'
}

function resolveLocalStatus(
  hostInfo: HostMachineInfoResponse | null,
  network: NetworkStatusResponse | null,
  audioDevices: string[],
): ClusterTile['status'] {
  if (!hostInfo && !network && audioDevices[0] === 'Audio device unavailable') return 'offline'
  if (audioDevices[0] === 'Audio device unavailable') return 'degraded'
  return 'online'
}

function resolveLocalHealthScore(
  status: ClusterTile['status'],
  discoveredHealth: unknown,
): number {
  const discoveredScore = roundNumber(discoveredHealth)
  if (discoveredScore != null) return Math.max(0, Math.min(100, discoveredScore))
  if (status === 'online') return 96
  if (status === 'degraded') return 72
  return 25
}

function statusDotClass(status: ClusterTile['status']): string {
  return `hp-hero__node-dot hp-hero__node-dot--${status}`
}

function clusterDotClass(status: ClusterTile['status']): string {
  const colors: Record<ClusterTile['status'], string> = {
    online: '#24a148',
    degraded: '#f1c21b',
    offline: '#da1e28',
    updating: '#4589ff',
    maintenance: '#525252',
  }
  return colors[status] ?? '#525252'
}

// ── Main Component ────────────────────────────────────────────────────────────

export function HomePage() {
  const { localNode, topology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.home)
  const location = useLocation()
  const navigate = useNavigate()
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()

  const pinnedRoutes = useMemo(
    () => resolvePinnedRoutes(specialSettings?.pinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(true)

  const [tiles, setTiles] = useState<ClusterTile[]>([])
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tilesError, setTilesError] = useState<string | null>(null)
  const [clusterName, setClusterName] = useState('Local Node')
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadTiles = useCallback(async () => {
    setTilesLoading(true)
    setTilesError(null)
    try {
      const [hostInfo, networkStatus, devices, peers, discovered, deploymentMode] = await Promise.all([
        fetchJsonOrNull<HostMachineInfoResponse>('/api/system/host-machine-info', apiNodeId),
        fetchJsonOrNull<NetworkStatusResponse>('/api/network/status', apiNodeId),
        fetchJsonOrNull<ClusterDevicesResponse>('/api/cluster/health/extended/devices', apiNodeId),
        fetchJsonOrNull<PeersResponse>('/api/peers', apiNodeId),
        fetchJsonOrNull<ClusterDiscoveredResponse>('/api/cluster/discovered', apiNodeId),
        fetchJsonOrNull<DeploymentModeResponse>('/api/deployment/mode', apiNodeId),
      ])

      const discoveredNodes = Array.isArray(discovered?.nodes) ? discovered.nodes : []
      const hostnames = uniqueStrings([
        hostInfo?.hostname,
        networkStatus?.hostname,
        window.location.hostname,
      ])
      const localNodeId = resolveLocalNodeId(peers, devices, hostnames)
      const localDevices =
        devices?.nodes?.[localNodeId] ??
        Object.values(devices?.nodes ?? {}).find((node) => {
          const hostname = resolveString(node.hostname)
          return hostname ? hostnames.some((candidate) => candidate.toLowerCase() === hostname.toLowerCase()) : false
        }) ??
        null
      const localDiscoveredNode =
        discoveredNodes.find((node) => resolveString(node.node_id) === localNodeId) ??
        discoveredNodes.find((node) => {
          const discoveredHostname = resolveString(node.hostname)
          return discoveredHostname
            ? hostnames.some((candidate) => candidate.toLowerCase() === discoveredHostname.toLowerCase())
            : false
        }) ??
        null
      const localAudioDevices = normalizeAudioDevices(
        localDevices,
        localDiscoveredNode?.capabilities?.audio_interfaces,
      )
      const localStatus = resolveLocalStatus(hostInfo, networkStatus, localAudioDevices)
      const localHostname =
        resolveString(hostInfo?.hostname) ??
        resolveString(networkStatus?.hostname) ??
        resolveString(localDevices?.hostname) ??
        resolveString(window.location.hostname) ??
        'localhost'
      const localCpuCores =
        hostInfo?.cpu_cores ?? localDiscoveredNode?.capabilities?.cpu_cores ?? null
      const localMemoryGb =
        roundMemoryGbFromMb(hostInfo?.total_memory_mb) ??
        roundNumber(localDiscoveredNode?.capabilities?.memory_gb) ??
        null

      setClusterName(localHostname)

      const tileList: ClusterTile[] = [
        {
          id: localNodeId,
          hostname: localHostname,
          ip: resolveLocalIp(networkStatus, localDiscoveredNode),
          status: localStatus,
          role: resolveRole(localNodeId, localDiscoveredNode?.role, deploymentMode?.mode),
          healthScore: resolveLocalHealthScore(localStatus, localDiscoveredNode?.health_score),
          cpuRam: formatCpuRam(localCpuCores, localMemoryGb),
          audioDevices: localAudioDevices,
          version: MAP2_PLATFORM_VERSION,
          lastSeenSeconds: 0,
          isLocal: true,
        },
      ]

      const discoveredByNodeId = new Map(
        discoveredNodes
          .map((node) => [resolveString(node.node_id), node] as const)
          .filter((entry): entry is [string, DiscoveredNodeResponse] => Boolean(entry[0])),
      )
      const renderedPeerIds = new Set<string>()
      const peerList = Array.isArray(peers?.peers) ? peers.peers : []

      peerList.forEach((peer) => {
          const nodeId = resolveString(peer.node_id) ?? `peer-${tileList.length + 1}`
          if (nodeId === localNodeId || renderedPeerIds.has(nodeId)) return

          const discoveredPeer = discoveredByNodeId.get(nodeId)
          const peerDevices = devices?.nodes?.[nodeId] ?? null
          const peerAudio = normalizeAudioDevices(
            peerDevices,
            discoveredPeer?.capabilities?.audio_interfaces,
          )
          const latency = typeof peer.latency_ms === 'number' ? peer.latency_ms : null
          const status: ClusterTile['status'] =
            latency == null ? (discoveredPeer ? 'online' : 'offline') : latency > 180 ? 'degraded' : 'online'

          tileList.push({
            id: nodeId,
            hostname:
              resolveString(discoveredPeer?.hostname) ??
              resolveString(peer.host) ??
              nodeId,
            ip:
              resolveString(peer.host) ??
              resolvePrimaryAddress(discoveredPeer) ??
              'IP unavailable',
            status,
            role: resolveRole(nodeId, peer.node_mode ?? discoveredPeer?.role, null),
            healthScore:
              resolveLocalHealthScore(status, discoveredPeer?.health_score),
            cpuRam: formatCpuRam(
              discoveredPeer?.capabilities?.cpu_cores,
              discoveredPeer?.capabilities?.memory_gb,
            ),
            audioDevices: peerAudio,
            version: 'Version unknown',
            lastSeenSeconds: parseLastSeenSeconds(
              resolveString(peer.last_seen) ?? resolveString(discoveredPeer?.last_seen),
            ),
            isLocal: false,
          })
          renderedPeerIds.add(nodeId)
      })

      discoveredNodes.forEach((node) => {
        const nodeId = resolveString(node.node_id)
        if (!nodeId || nodeId === localNodeId || renderedPeerIds.has(nodeId)) return

        const peerDevices = devices?.nodes?.[nodeId] ?? null
        tileList.push({
          id: nodeId,
          hostname: resolveString(node.hostname) ?? nodeId,
          ip: resolvePrimaryAddress(node) ?? 'IP unavailable',
          status: 'online',
          role: resolveRole(nodeId, node.role, null),
          healthScore: resolveLocalHealthScore('online', node.health_score),
          cpuRam: formatCpuRam(node.capabilities?.cpu_cores, node.capabilities?.memory_gb),
          audioDevices: normalizeAudioDevices(peerDevices, node.capabilities?.audio_interfaces),
          version: 'Version unknown',
          lastSeenSeconds: parseLastSeenSeconds(resolveString(node.last_seen)),
          isLocal: false,
        })
      })

      if (!hostInfo && !networkStatus && tileList.length === 0) {
        throw new Error('Cluster status unavailable')
      }

      setTiles(tileList)
    } catch (err) {
      setTilesError(err instanceof Error ? err.message : 'Cluster status unavailable')
    } finally {
      setTilesLoading(false)
    }
  }, [apiNodeId])

  useEffect(() => {
    void loadTiles()
    const timer = window.setInterval(() => void loadTiles(), 10_000)
    return () => window.clearInterval(timer)
  }, [loadTiles])

  // ── Pin toggling ────────────────────────────────────────────────────────────

  const handleTogglePin = async (item: HomeNavigationItem, checked: boolean) => {
    if (!item.pinnable) return
    if (!checked) {
      await updateSpecialSettings({ pinnedRoutes: pinnedRoutes.filter((r) => r !== item.to) })
      return
    }
    if (!pinnedRouteSet.has(item.to) && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS) return
    const candidateSet = new Set([...pinnedRoutes, item.to])
    const nextRoutes = allPinnableNavigationItems
      .filter((c) => c.to !== '/' && candidateSet.has(c.to))
      .map((c) => c.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)
    await updateSpecialSettings({ pinnedRoutes: nextRoutes })
  }

  const openPlatformWindow = useCallback((params: { layer?: string; panel?: string }) => {
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.delete('layer')
    nextSearch.delete('panel')
    if (params.layer) nextSearch.set('layer', params.layer)
    if (params.panel) nextSearch.set('panel', params.panel)

    navigate({
      pathname: location.pathname,
      search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
    })
  }, [location.pathname, location.search, navigate])

  const openHomeItem = useCallback((item: HomeNavigationItem) => {
    if (item.to === '/platform') {
      openPlatformWindow({ layer: 'overview' })
      return
    }

    navigate(item.to)
  }, [navigate, openPlatformWindow])

  // ── Visible sections (non-empty only) ──────────────────────────────────────

  const visibleSections = useMemo(
    () => homeNavigationTabSections.filter((s) => s.items.length > 0),
    [],
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="hp-root">
      {/* ══════════════════════════════════════════════════════════
          HERO — full-bleed neon grid artwork + scanline effects
          ══════════════════════════════════════════════════════════ */}
      <header className="hp-hero">
        {/* Brand mark artwork — lowest layer, dot grid draws over it */}
        <div className="hp-hero__img" aria-hidden="true">
          <Map2BrandMark className="hp-hero__brand-mark" />
        </div>

        {/* Dot-grid — second layer, sits above brand mark */}
        <HeroDotGrid />

        {/* Vignette overlay */}
        <div className="hp-hero__vignette" aria-hidden="true" />

        {/* Bottom fade to page bg */}
        <div className="hp-hero__bottom-fade" aria-hidden="true" />

        {/* Combined controls bar — context picker + node pills in one row */}
        <div className="hp-hero__controls" aria-label="Node context and cluster status">
          {tilesLoading && (
            <>
              <span className="hp-hero__node hp-hero__node--skeleton" aria-hidden="true" />
              <span className="hp-hero__node hp-hero__node--skeleton" aria-hidden="true" />
            </>
          )}

          {!tilesLoading &&
            !tilesError &&
            tiles.map((tile) => (
              <button
                key={`hero-node-${tile.id}`}
                type="button"
                className="hp-hero__node"
                onClick={() => openPlatformWindow({ layer: 'cluster-dashboard' })}
                title={`${tile.hostname} · ${tile.status}`}
              >
                <span
                  className={statusDotClass(tile.status)}
                  style={{ background: clusterDotClass(tile.status) }}
                  aria-label={tile.status}
                />
                <span className="hp-hero__node-name">{tile.hostname}</span>
                <span className="hp-hero__node-score">{tile.healthScore}%</span>
              </button>
            ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            CARD OVERLAY — wireframe cards float over hero artwork
            ══════════════════════════════════════════════════════════ */}
        <div className="hp-hero__card-overlay" aria-label="Navigation cards">
          {visibleSections.map((section) => (
            <section key={section.title} className="hp-group" aria-label={`${section.title} interfaces`}>
              {/* ── Group heading (hidden in overlay via CSS) ── */}
              <div className="hp-group__heading">
                <h2 className="hp-group__title">{section.title}</h2>
                <span className="hp-group__count">{section.items.length}</span>
              </div>

              {/* ── 4-up card grid ── */}
              <div className="hp-card-grid" role="list" aria-label={`${section.title} navigation cards`}>
                {section.items.map((item) => {
                const cardId = `${item.to}-${item.label}`
                const isBlocked = isBlockedHomeItem(item)
                const isPinned = pinnedRouteSet.has(item.to)
                const limitReached = !isPinned && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS
                const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
                const maturityMeta = navigationMaturityMeta[item.maturity]
                const profile = resolveHomeCardProfile(item)
                const isExpanded = expandedCardId === cardId
                const Icon = item.icon

                return (
                  <article
                    key={cardId}
                    role="listitem"
                    className={`hp-card${isBlocked ? ' is-blocked' : ''}${item.to === '/juce-grid' ? ' hp-card--wide' : ''}`}
                    onClick={() => {
                      if (!isBlocked) openHomeItem(item)
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isBlocked) {
                        e.preventDefault()
                        openHomeItem(item)
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Open ${item.label}`}
                  >
                    {item.pinnable ? (
                      <button
                        type="button"
                        className={`hp-card__pin-btn${isPinned ? ' is-pinned' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!pinDisabled) void handleTogglePin(item, !isPinned)
                        }}
                        title={
                          limitReached
                            ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned`
                            : isPinned
                              ? 'Unpin from navigation'
                              : 'Pin to navigation'
                        }
                        aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                        aria-pressed={isPinned}
                        disabled={pinDisabled}
                      >
                        {isPinned ? <PinFilled size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
                      </button>
                    ) : null}

                    {/* Icon */}
                    <Icon className="hp-card__icon" aria-hidden />

                    {/* Maturity badge */}
                    <span
                      className={`hp-card__maturity hp-card__maturity--${item.maturity}`}
                      title={maturityMeta.description}
                    >
                      {maturityMeta.label}
                    </span>

                    {/* Label */}
                    <h3 className="hp-card__label">{item.label}</h3>

                    {/* Description */}
                    <p className="hp-card__desc">{item.description}</p>

                    {/* Footer actions */}
                    <div className="hp-card__footer">
                      <button
                        type="button"
                        className="hp-card__open-btn"
                        disabled={isBlocked}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isBlocked) openHomeItem(item)
                        }}
                      >
                        Open Interface
                      </button>

                      <button
                        type="button"
                        className="hp-card__details-btn"
                        aria-expanded={isExpanded}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedCardId((current) => (current === cardId ? null : cardId))
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={14} aria-hidden /> Less
                          </>
                        ) : (
                          <>
                            <ChevronDown size={14} aria-hidden /> Details
                          </>
                        )}
                      </button>
                    </div>

                    {/* Expandable detail panel */}
                    {isExpanded && (
                      <div className="hp-card__detail-panel" role="note">
                        <div>
                          <p className="hp-card__detail-heading">Capabilities</p>
                          <ul className="hp-card__detail-list">
                            {profile.capabilities.slice(0, 4).map((cap) => (
                              <li key={`${cardId}-${cap}`}>{cap}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="hp-card__detail-heading">Workflow notes</p>
                          <p className="hp-card__detail-body">{profile.learnMore}</p>
                        </div>

                        <div>
                          <p className="hp-card__best-for-label">Best for</p>
                          <p className="hp-card__best-for-value">{profile.bestFor}</p>
                        </div>

                        {item.gatedReason && (
                          <p className="hp-card__detail-body" style={{ color: '#ffd7d9' }}>
                            {item.gatedReason}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
        </div>{/* end hp-hero__card-overlay */}
      </header>

      {/* ══════════════════════════════════════════════════════════
          API ACTIVITY OVERLAY — live scrolling request log
          ══════════════════════════════════════════════════════════ */}
      <button
        type="button"
        className="api-overlay-toggle"
        onClick={() => setOverlayVisible((v) => !v)}
        title={overlayVisible ? 'Hide API activity' : 'Show API activity'}
      >
        {overlayVisible ? 'API ▶' : 'API ▷'}
      </button>
      <ApiActivityOverlay visible={overlayVisible} />
    </div>
  )
}

export default HomePage
