import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from '@carbon/icons-react'
import { Button, ClickableTile, Column, Grid, Layer, SkeletonText, Tag, Tile } from '@carbon/react'
import {
  Map2BrandMark,
  MAP2_PLATFORM_VERSION,
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import {
  homeNavigationSections,
  type HardwareInterfaceMenuItem,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { useNodePageContext } from '../hooks/useNodePageContext'
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
  hostname?: string
  host?: string
  last_seen?: string | null
  latency_ms?: number | null
  is_online?: boolean
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

const FEATURED_HOME_ROUTES = ['/platforms/overview', '/artifacts', '/juce-grid', '/midi-hub'] as const
const HOME_LAUNCHER_COPY: Record<string, { summary: string; helper: string }> = {
  '/platforms/overview': {
    summary: 'Set up the system and check node status.',
    helper: 'System setup',
  },
  '/artifacts': {
    summary: 'Find plugins, models, impulse responses, and other audio files.',
    helper: 'Files and plugins',
  },
  '/juce-grid': {
    summary: 'Build audio signal flow, routing, and snapshots.',
    helper: 'Audio routing',
  },
  '/midi-hub': {
    summary: 'Set up controllers, mappings, and MIDI routing.',
    helper: 'MIDI control',
  },
  '/labs': {
    summary: 'Open advanced tools that are not part of normal daily use.',
    helper: 'Advanced tools',
  },
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

function resolveLauncherCopy(route: string): { summary: string; helper: string } {
  return HOME_LAUNCHER_COPY[route] ?? {
    summary: 'Open this workspace.',
    helper: 'Workspace',
  }
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

function platformStatusTagType(status: ClusterTile['status']): 'green' | 'warm-gray' | 'red' | 'blue' | 'cool-gray' {
  switch (status) {
    case 'online':
      return 'green'
    case 'degraded':
      return 'warm-gray'
    case 'offline':
      return 'red'
    case 'updating':
      return 'blue'
    default:
      return 'cool-gray'
  }
}

function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

// ── Main Component ────────────────────────────────────────────────────────────

export function HomePage() {
  const { localNode, topology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.home)
  const navigate = useNavigate()

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
          const peerIsOnline = typeof peer.is_online === 'boolean'
            ? peer.is_online
            : discoveredPeer != null
          const status: ClusterTile['status'] =
            !peerIsOnline ? 'offline' : latency != null && latency > 180 ? 'degraded' : 'online'

          tileList.push({
            id: nodeId,
            hostname:
              resolveString(peer.hostname) ??
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

  const openHomeItem = useCallback((item: HomeNavigationItem) => {
    navigate(item.to)
  }, [navigate])

  const featuredItems = useMemo(() => {
    const items = homeNavigationSections.flatMap((section) => section.items)
    return FEATURED_HOME_ROUTES
      .map((route) => items.find((item) => item.to === route) ?? null)
      .filter((item): item is HomeNavigationItem => Boolean(item))
  }, [])

  const totalNodes = tiles.length || topology.nodes.length || 1
  const onlineNodes = tiles.filter((tile) => tile.status === 'online').length
  const atRiskNodes = tiles.filter((tile) => tile.status !== 'online').length
  const selectedNodeLabel = localNode?.hostname ?? clusterName
  const systemStatusSummary = atRiskNodes > 0
    ? `${atRiskNodes} of ${totalNodes} nodes need attention`
    : `${onlineNodes} of ${totalNodes} nodes online`
  const labsCopy = resolveLauncherCopy('/labs')

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="hp-root">
      <Grid condensed className="hp-grid">
        <Column sm={4} md={8} lg={16} className="hp-column">
          <Layer className="hp-shell hp-shell--hero">
            <div className="hp-shell__brand">
              <Map2BrandMark className="hp-shell__brand-mark" />
              <div className="hp-shell__brand-copy">
                <p className="hp-shell__eyebrow">{MAP2_PLATFORM_NAME}</p>
                <h1 className="hp-shell__title">Open a workspace</h1>
                <p className="hp-shell__summary">
                  Choose the part of MAP2 you need for sound, MIDI, files, or system setup.
                </p>
              </div>
            </div>
            <div className="hp-shell__meta">
              <Tag type="cool-gray">{MAP2_PLATFORM_VERSION}</Tag>
              <Tag type="cool-gray">{selectedNodeLabel}</Tag>
              <Tag type={atRiskNodes > 0 ? 'warm-gray' : 'green'}>
                {systemStatusSummary}
              </Tag>
            </div>
          </Layer>
        </Column>

        <Column sm={4} md={8} lg={16} className="hp-column">
          <Layer className="hp-section">
            <div className="hp-section__header">
              <div>
                <p className="hp-section__eyebrow">Main workspaces</p>
                <h2 className="hp-section__title">Choose where to work</h2>
              </div>
            </div>
            <div className="hp-workspace-grid" aria-label="Main workspaces">
              {featuredItems.map((item) => {
                const Icon = item.icon
                const copy = resolveLauncherCopy(item.to)

                return (
                  <ClickableTile key={item.to} className="hp-workspace-card" onClick={() => openHomeItem(item)}>
                    <div className="hp-workspace-card__header">
                      <span className="hp-workspace-card__icon" aria-hidden>
                        <Icon size={24} />
                      </span>
                      <p className="hp-workspace-card__eyebrow">{item.homeSection}</p>
                    </div>
                    <h3 className="hp-workspace-card__title">{item.label}</h3>
                    <p className="hp-workspace-card__summary">{copy.summary}</p>
                    <p className="hp-workspace-card__helper">{copy.helper}</p>
                  </ClickableTile>
                )
              })}

              <ClickableTile className="hp-workspace-card" onClick={() => navigate('/labs')}>
                <div className="hp-workspace-card__header">
                  <span className="hp-workspace-card__icon" aria-hidden>
                    <ArrowRight size={24} />
                  </span>
                  <p className="hp-workspace-card__eyebrow">System</p>
                </div>
                <h3 className="hp-workspace-card__title">Labs</h3>
                <p className="hp-workspace-card__summary">{labsCopy.summary}</p>
                <p className="hp-workspace-card__helper">{labsCopy.helper}</p>
              </ClickableTile>
            </div>
          </Layer>
        </Column>

        <Column sm={4} md={8} lg={16} className="hp-column">
          <Layer className="hp-section">
            <div className="hp-section__header">
              <div>
                <p className="hp-section__eyebrow">System status</p>
                <h2 className="hp-section__title">Check nodes</h2>
              </div>
              <Button kind="secondary" size="sm" renderIcon={ArrowRight} onClick={() => navigate('/platforms/cluster-dashboard')}>
                Open cluster dashboard
              </Button>
            </div>
            <div className="hp-node-grid" aria-label="Node status">
              {tilesLoading ? (
                <>
                  <Tile className="hp-node-card hp-node-card--loading">
                    <SkeletonText heading width="60%" />
                    <SkeletonText width="90%" />
                    <SkeletonText width="40%" />
                  </Tile>
                  <Tile className="hp-node-card hp-node-card--loading">
                    <SkeletonText heading width="55%" />
                    <SkeletonText width="88%" />
                    <SkeletonText width="35%" />
                  </Tile>
                </>
              ) : null}

              {!tilesLoading && tilesError ? (
                <Tile className="hp-node-card hp-node-card--error">
                  <p className="hp-node-card__title">Cluster status unavailable</p>
                  <p className="hp-node-card__meta">{tilesError}</p>
                </Tile>
              ) : null}

              {!tilesLoading && !tilesError && tiles.map((tile) => (
                <ClickableTile
                  key={`cluster-tile-${tile.id}`}
                  className="hp-node-card"
                  onClick={() => navigate('/platforms/cluster-dashboard')}
                >
                  <div className="hp-node-card__header">
                    <div>
                      <p className="hp-node-card__title">{tile.hostname}</p>
                      <p className="hp-node-card__meta">{tile.ip}</p>
                    </div>
                    <Tag type={platformStatusTagType(tile.status)}>
                      {tile.status}
                    </Tag>
                  </div>
                  <p className="hp-node-card__eyebrow">
                    {tile.isLocal ? 'Local device' : formatRoleLabel(tile.role)}
                  </p>
                  <div className="hp-node-card__stats">
                    <span className="hp-node-card__health">
                      <span
                        className="hp-node-card__dot"
                        style={{ backgroundColor: clusterDotClass(tile.status) }}
                        aria-hidden="true"
                      />
                      {tile.healthScore}% health
                    </span>
                    <span>{tile.cpuRam}</span>
                  </div>
                  <p className="hp-node-card__devices">{tile.audioDevices.join(' · ')}</p>
                </ClickableTile>
              ))}
            </div>
          </Layer>
        </Column>
      </Grid>
    </div>
  )
}

export default HomePage
