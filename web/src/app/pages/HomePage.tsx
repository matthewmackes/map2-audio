import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Chemistry } from '@carbon/icons-react'
import { Button, Checkbox, ClickableTile, Column, Grid, Layer, Select, SelectItem, SkeletonText, Tag, TextInput, Tile } from '@carbon/react'
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

interface AdoptionReadinessSummary {
  status?: string
  blocking_count?: number
  warning_count?: number
  computed_at?: string | null
}

interface AdoptionCandidateResponse {
  candidate_id?: string
  remote_node_id?: string | null
  node_id?: string | null
  hostname?: string
  display_name?: string | null
  api_url?: string | null
  trust_state?: string
  adoption_state?: string
  activation_state?: string
  readiness?: AdoptionReadinessSummary | null
  registered?: boolean
  visible?: boolean
  routing_ready?: boolean
}

interface AdoptionCandidatesResponse {
  items?: AdoptionCandidateResponse[]
}

interface BootstrapTokenIssueResponse {
  bootstrap_token?: string
}

interface CloneSourceResponse {
  node_id?: string
  hostname?: string
  display_name?: string | null
  role?: string | null
  deployment_mode?: string | null
  api_url?: string | null
  is_local?: boolean
}

interface CloneSourceListResponse {
  items?: CloneSourceResponse[]
}

interface ClonePreviewItemResponse {
  key?: string
  label?: string
  value?: string
}

interface ClonePreviewGroupResponse {
  id?: string
  label?: string
  description?: string
  default_selected?: boolean
  items?: ClonePreviewItemResponse[]
}

interface ClonePreviewResponse {
  source?: CloneSourceResponse | null
  groups?: ClonePreviewGroupResponse[]
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

function adoptionTagType(state: string | null | undefined): 'green' | 'warm-gray' | 'red' | 'blue' | 'cool-gray' {
  switch (resolveString(state)?.toLowerCase()) {
    case 'ready':
      return 'green'
    case 'claimable':
    case 'adopted':
      return 'blue'
    case 'blocked':
    case 'orphaned':
      return 'red'
    case 'candidate':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function formatAdoptionLabel(state: string | null | undefined): string {
  return resolveString(state)
    ?.replace(/_/g, ' ')
    .split('-')
    .flatMap((token) => token.split(' '))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') ?? 'Unknown'
}

function formatReadinessSummary(readiness: AdoptionReadinessSummary | null | undefined): string {
  if (!readiness) return 'Readiness not checked'

  const status = formatAdoptionLabel(readiness.status)
  const blocking = typeof readiness.blocking_count === 'number' ? readiness.blocking_count : 0
  const warnings = typeof readiness.warning_count === 'number' ? readiness.warning_count : 0

  if (blocking > 0) {
    return `${status} · ${blocking} blocking issue${blocking === 1 ? '' : 's'}`
  }
  if (warnings > 0) {
    return `${status} · ${warnings} warning${warnings === 1 ? '' : 's'}`
  }
  return status
}

function needsAdoptionAction(candidate: AdoptionCandidateResponse): boolean {
  const activationState = resolveString(candidate.activation_state)?.toLowerCase()
  const adoptionState = resolveString(candidate.adoption_state)?.toLowerCase()
  return !(activationState === 'active' && adoptionState === 'ready')
}

function canCloneCandidate(candidate: AdoptionCandidateResponse): boolean {
  const nodeId = resolveString(candidate.node_id)
  const activationState = resolveString(candidate.activation_state)?.toLowerCase()
  const adoptionState = resolveString(candidate.adoption_state)?.toLowerCase()
  return Boolean(nodeId && activationState !== 'active' && (adoptionState === 'adopted' || adoptionState === 'blocked'))
}

// ── Main Component ────────────────────────────────────────────────────────────

export function HomePage() {
  const { localNode, topology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.home)
  const navigate = useNavigate()

  const [tiles, setTiles] = useState<ClusterTile[]>([])
  const [adoptionCandidates, setAdoptionCandidates] = useState<AdoptionCandidateResponse[]>([])
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tilesError, setTilesError] = useState<string | null>(null)
  const [adoptionActionError, setAdoptionActionError] = useState<string | null>(null)
  const [adoptionActionId, setAdoptionActionId] = useState<string | null>(null)
  const [claimCodes, setClaimCodes] = useState<Record<string, string>>({})
  const [cloneSourcesByNode, setCloneSourcesByNode] = useState<Record<string, CloneSourceResponse[]>>({})
  const [clonePreviewByNode, setClonePreviewByNode] = useState<Record<string, ClonePreviewResponse>>({})
  const [selectedCloneSourceByNode, setSelectedCloneSourceByNode] = useState<Record<string, string>>({})
  const [selectedCloneGroupsByNode, setSelectedCloneGroupsByNode] = useState<Record<string, Record<string, boolean>>>({})
  const [clusterName, setClusterName] = useState('Local Node')
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadTiles = useCallback(async () => {
    setTilesLoading(true)
    setTilesError(null)
    try {
      const [hostInfo, networkStatus, devices, peers, discovered, deploymentMode, adoption] = await Promise.all([
        fetchJsonOrNull<HostMachineInfoResponse>('/api/system/host-machine-info', apiNodeId),
        fetchJsonOrNull<NetworkStatusResponse>('/api/network/status', apiNodeId),
        fetchJsonOrNull<ClusterDevicesResponse>('/api/cluster/health/extended/devices', apiNodeId),
        fetchJsonOrNull<PeersResponse>('/api/peers', apiNodeId),
        fetchJsonOrNull<ClusterDiscoveredResponse>('/api/cluster/discovered', apiNodeId),
        fetchJsonOrNull<DeploymentModeResponse>('/api/deployment/mode', apiNodeId),
        fetchJsonOrNull<AdoptionCandidatesResponse>('/api/adoption/candidates', apiNodeId),
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
      setAdoptionCandidates(
        Array.isArray(adoption?.items) ? adoption.items.filter(needsAdoptionAction) : [],
      )

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

  const performAdoptionAction = useCallback(async (
    actionId: string,
    path: string,
    payload: Record<string, unknown>,
  ) => {
    setAdoptionActionId(actionId)
    setAdoptionActionError(null)
    try {
      const response = await fetch(scopedHomeApiPath(path, apiNodeId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let detail = `Request failed with status ${response.status}`
        try {
          const body = await response.json() as { detail?: unknown; message?: unknown }
          detail = resolveString(body.detail) ?? resolveString(body.message) ?? detail
        } catch {
          // Keep the fallback error.
        }
        throw new Error(detail)
      }
      await loadTiles()
    } catch (error) {
      setAdoptionActionError(error instanceof Error ? error.message : 'Adoption action failed')
    } finally {
      setAdoptionActionId(null)
    }
  }, [apiNodeId, loadTiles])

  const handleClaimCodeChange = useCallback((candidateId: string, value: string) => {
    setClaimCodes((current) => ({
      ...current,
      [candidateId]: value,
    }))
  }, [])

  const handleClaimCandidate = useCallback(async (candidateId: string) => {
    const pairingCode = resolveString(claimCodes[candidateId]) ?? ''
    if (!pairingCode) {
      setAdoptionActionError('Enter a pairing code before claiming a node.')
      return
    }
    await performAdoptionAction(
      `claim:${candidateId}`,
      `/api/adoption/candidates/${encodeURIComponent(candidateId)}/claim`,
      {
        pairing_code: pairingCode,
        requested_by: localNode?.node_id ?? null,
      },
    )
    setClaimCodes((current) => ({
      ...current,
      [candidateId]: '',
    }))
  }, [claimCodes, localNode?.node_id, performAdoptionAction])

  const handleTokenClaimCandidate = useCallback(async (candidate: AdoptionCandidateResponse) => {
    const candidateId = resolveString(candidate.candidate_id)
    if (!candidateId) return

    setAdoptionActionId(`token-claim:${candidateId}`)
    setAdoptionActionError(null)
    try {
      const issueResponse = await fetch(scopedHomeApiPath('/api/bootstrap/tokens/issue', apiNodeId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_node_id: resolveString(candidate.remote_node_id) ?? resolveString(candidate.node_id),
          target_hostname: resolveString(candidate.hostname),
          target_api_url: resolveString(candidate.api_url),
        }),
      })
      if (!issueResponse.ok) {
        throw new Error(`Token issue failed with status ${issueResponse.status}`)
      }
      const issuePayload = await issueResponse.json() as BootstrapTokenIssueResponse
      const bootstrapToken = resolveString(issuePayload.bootstrap_token)
      if (!bootstrapToken) {
        throw new Error('Issued bootstrap token payload is missing the token value')
      }

      await performAdoptionAction(
        `token-claim:${candidateId}`,
        `/api/adoption/candidates/${encodeURIComponent(candidateId)}/claim`,
        {
          bootstrap_token: bootstrapToken,
          requested_by: localNode?.node_id ?? null,
        },
      )
    } catch (error) {
      setAdoptionActionError(error instanceof Error ? error.message : 'Bootstrap token claim failed')
      setAdoptionActionId(null)
    }
  }, [apiNodeId, localNode?.node_id, performAdoptionAction])

  const handleAdoptCandidate = useCallback(async (candidate: AdoptionCandidateResponse) => {
    const candidateId = resolveString(candidate.candidate_id)
    if (!candidateId) return
    await performAdoptionAction(
      `adopt:${candidateId}`,
      `/api/adoption/candidates/${encodeURIComponent(candidateId)}/adopt`,
      {
        display_name: resolveString(candidate.display_name) ?? resolveString(candidate.hostname),
        role: 'AUDIO-NODE',
        activation_mode: 'standby',
      },
    )
  }, [performAdoptionAction])

  const handlePromoteCandidate = useCallback(async (candidate: AdoptionCandidateResponse) => {
    const nodeId = resolveString(candidate.node_id)
    if (!nodeId) return
    await performAdoptionAction(
      `promote:${nodeId}`,
      `/api/adoption/nodes/${encodeURIComponent(nodeId)}/promote`,
      {
        activation_scope: 'all',
        requested_by: localNode?.node_id ?? null,
      },
    )
  }, [localNode?.node_id, performAdoptionAction])

  const loadCloneSources = useCallback(async (nodeId: string) => {
    setAdoptionActionId(`clone-sources:${nodeId}`)
    setAdoptionActionError(null)
    try {
      const response = await fetch(scopedHomeApiPath(`/api/adoption/nodes/${encodeURIComponent(nodeId)}/clone/sources`, apiNodeId))
      if (!response.ok) {
        throw new Error(`Clone source discovery failed with status ${response.status}`)
      }
      const payload = await response.json() as CloneSourceListResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      setCloneSourcesByNode((current) => ({
        ...current,
        [nodeId]: items,
      }))
      setSelectedCloneSourceByNode((current) => {
        if (current[nodeId] || items.length === 0) return current
        return {
          ...current,
          [nodeId]: resolveString(items[0]?.node_id) ?? '',
        }
      })
    } catch (error) {
      setAdoptionActionError(error instanceof Error ? error.message : 'Failed to load clone sources')
    } finally {
      setAdoptionActionId(null)
    }
  }, [apiNodeId])

  const handleCloneSourceChange = useCallback((nodeId: string, sourceNodeId: string) => {
    setSelectedCloneSourceByNode((current) => ({
      ...current,
      [nodeId]: sourceNodeId,
    }))
    setClonePreviewByNode((current) => {
      const next = { ...current }
      delete next[nodeId]
      return next
    })
    setSelectedCloneGroupsByNode((current) => {
      const next = { ...current }
      delete next[nodeId]
      return next
    })
  }, [])

  const handlePreviewCloneCandidate = useCallback(async (nodeId: string, sourceNodeId: string) => {
    if (!nodeId || !sourceNodeId) return
    setAdoptionActionId(`clone-preview:${nodeId}`)
    setAdoptionActionError(null)
    try {
      const response = await fetch(
        scopedHomeApiPath(
          `/api/adoption/nodes/${encodeURIComponent(nodeId)}/clone/preview?source_node_id=${encodeURIComponent(sourceNodeId)}`,
          apiNodeId,
        ),
      )
      if (!response.ok) {
        throw new Error(`Clone preview failed with status ${response.status}`)
      }
      const payload = await response.json() as ClonePreviewResponse
      const groups = Array.isArray(payload.groups) ? payload.groups : []
      setClonePreviewByNode((current) => ({
        ...current,
        [nodeId]: payload,
      }))
      setSelectedCloneGroupsByNode((current) => ({
        ...current,
        [nodeId]: groups.reduce<Record<string, boolean>>((next, group) => {
          const groupId = resolveString(group.id)
          if (groupId) {
            next[groupId] = group.default_selected !== false
          }
          return next
        }, {}),
      }))
    } catch (error) {
      setAdoptionActionError(error instanceof Error ? error.message : 'Failed to preview clone profile')
    } finally {
      setAdoptionActionId(null)
    }
  }, [apiNodeId])

  const handleCloneGroupToggle = useCallback((nodeId: string, groupId: string, checked: boolean) => {
    setSelectedCloneGroupsByNode((current) => ({
      ...current,
      [nodeId]: {
        ...(current[nodeId] ?? {}),
        [groupId]: checked,
      },
    }))
  }, [])

  const handleApplyCloneCandidate = useCallback(async (candidate: AdoptionCandidateResponse) => {
    const nodeId = resolveString(candidate.node_id)
    if (!nodeId) return
    const sourceNodeId = resolveString(selectedCloneSourceByNode[nodeId])
    if (!sourceNodeId) {
      setAdoptionActionError('Select a clone source before applying a profile clone.')
      return
    }
    const selectedGroupIds = Object.entries(selectedCloneGroupsByNode[nodeId] ?? {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([groupId]) => groupId)
    if (selectedGroupIds.length === 0) {
      setAdoptionActionError('Select at least one clone profile group before applying the clone.')
      return
    }
    await performAdoptionAction(
      `clone-apply:${nodeId}`,
      `/api/adoption/nodes/${encodeURIComponent(nodeId)}/clone`,
      {
        source_node_id: sourceNodeId,
        group_ids: selectedGroupIds,
        requested_by: localNode?.node_id ?? null,
      },
    )
    await handlePreviewCloneCandidate(nodeId, sourceNodeId)
  }, [handlePreviewCloneCandidate, localNode?.node_id, performAdoptionAction, selectedCloneGroupsByNode, selectedCloneSourceByNode])

  const pendingAdoptionCandidates = useMemo(
    () => adoptionCandidates.filter(needsAdoptionAction),
    [adoptionCandidates],
  )

  useEffect(() => {
    pendingAdoptionCandidates
      .filter(canCloneCandidate)
      .forEach((candidate) => {
        const nodeId = resolveString(candidate.node_id)
        if (!nodeId || cloneSourcesByNode[nodeId] != null) return
        void loadCloneSources(nodeId)
      })
  }, [cloneSourcesByNode, loadCloneSources, pendingAdoptionCandidates])

  useEffect(() => {
    pendingAdoptionCandidates
      .filter(canCloneCandidate)
      .forEach((candidate) => {
        const nodeId = resolveString(candidate.node_id)
        if (!nodeId || clonePreviewByNode[nodeId] != null) return
        const sourceNodeId = resolveString(selectedCloneSourceByNode[nodeId])
        if (!sourceNodeId) return
        void handlePreviewCloneCandidate(nodeId, sourceNodeId)
      })
  }, [clonePreviewByNode, handlePreviewCloneCandidate, pendingAdoptionCandidates, selectedCloneSourceByNode])

  useEffect(() => {
    const activeNodeIds = new Set(
      pendingAdoptionCandidates
        .map((candidate) => resolveString(candidate.node_id))
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    )
    setCloneSourcesByNode((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => activeNodeIds.has(nodeId))))
    setClonePreviewByNode((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => activeNodeIds.has(nodeId))))
    setSelectedCloneSourceByNode((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => activeNodeIds.has(nodeId))))
    setSelectedCloneGroupsByNode((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => activeNodeIds.has(nodeId))))
  }, [pendingAdoptionCandidates])

  const openHomeItem = useCallback((item: HomeNavigationItem) => {
    navigate(item.to)
  }, [navigate])

  const featuredItems = useMemo(() => {
    const items = homeNavigationSections.flatMap((section) => section.items)
    return FEATURED_HOME_ROUTES
      .map((route) => items.find((item) => item.to === route) ?? null)
      .filter((item): item is HomeNavigationItem => Boolean(item))
  }, [])

  const totalNodes = tiles.length || (Array.isArray(topology?.nodes) ? topology.nodes.length : 0) || 1
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
                const isAudioGridCard = item.to === '/juce-grid'
                const cardClassName = isAudioGridCard
                  ? 'hp-workspace-card hp-workspace-card--audio-grid-focus'
                  : 'hp-workspace-card'

                return (
                  <ClickableTile
                    key={item.to}
                    className={cardClassName}
                    data-home-route={item.to}
                    onClick={() => openHomeItem(item)}
                  >
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

              <ClickableTile className="hp-workspace-card" data-home-route="/labs" onClick={() => navigate('/labs')}>
                <div className="hp-workspace-card__header">
                  <span className="hp-workspace-card__icon" aria-hidden>
                    <Chemistry size={24} />
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
                <p className="hp-section__eyebrow">Node adoption</p>
                <h2 className="hp-section__title">Adopt discovered nodes</h2>
              </div>
            </div>

            {adoptionActionError ? (
              <Tile className="hp-adoption-card hp-adoption-card--error">
                <p className="hp-node-card__title">Adoption action failed</p>
                <p className="hp-node-card__meta">{adoptionActionError}</p>
              </Tile>
            ) : null}

            <div className="hp-adoption-grid" aria-label="Adoption queue">
              {tilesLoading ? (
                <Tile className="hp-adoption-card hp-adoption-card--loading">
                  <SkeletonText heading width="55%" />
                  <SkeletonText width="90%" />
                  <SkeletonText width="72%" />
                </Tile>
              ) : null}

              {!tilesLoading && pendingAdoptionCandidates.length === 0 ? (
                <Tile className="hp-adoption-card hp-adoption-card--empty">
                  <p className="hp-node-card__title">No nodes are waiting for adoption</p>
                  <p className="hp-node-card__meta">
                    Discovered unmanaged peers, standby nodes, and blocked adoption candidates will appear here.
                  </p>
                </Tile>
              ) : null}

              {!tilesLoading && pendingAdoptionCandidates.map((candidate) => {
                const candidateId =
                  resolveString(candidate.candidate_id) ??
                  resolveString(candidate.remote_node_id) ??
                  resolveString(candidate.node_id) ??
                  resolveString(candidate.hostname) ??
                  'candidate'
                const nodeId = resolveString(candidate.node_id)
                const adoptionState = resolveString(candidate.adoption_state) ?? 'candidate'
                const activationState = resolveString(candidate.activation_state) ?? 'standby'
                const readinessText = formatReadinessSummary(candidate.readiness)
                const isClaimBusy = adoptionActionId === `claim:${candidateId}`
                const isTokenClaimBusy = adoptionActionId === `token-claim:${candidateId}`
                const isAdoptBusy = adoptionActionId === `adopt:${candidateId}`
                const isPromoteBusy = nodeId != null && adoptionActionId === `promote:${nodeId}`
                const isCloneSourceBusy = nodeId != null && adoptionActionId === `clone-sources:${nodeId}`
                const isClonePreviewBusy = nodeId != null && adoptionActionId === `clone-preview:${nodeId}`
                const isCloneApplyBusy = nodeId != null && adoptionActionId === `clone-apply:${nodeId}`
                const cloneSources = nodeId != null ? (cloneSourcesByNode[nodeId] ?? []) : []
                const selectedCloneSource = nodeId != null ? (selectedCloneSourceByNode[nodeId] ?? '') : ''
                const clonePreview = nodeId != null ? clonePreviewByNode[nodeId] : undefined
                const cloneGroups = Array.isArray(clonePreview?.groups) ? clonePreview.groups : []
                const cloneSelections = nodeId != null ? (selectedCloneGroupsByNode[nodeId] ?? {}) : {}
                const showCloneControls = Boolean(nodeId && canCloneCandidate(candidate))

                return (
                  <Tile key={candidateId} className="hp-adoption-card">
                    <div className="hp-adoption-card__header">
                      <div>
                        <p className="hp-node-card__title">
                          {resolveString(candidate.display_name) ?? resolveString(candidate.hostname) ?? candidateId}
                        </p>
                        <p className="hp-node-card__meta">
                          {resolveString(candidate.hostname) ?? candidateId}
                        </p>
                      </div>
                      <div className="hp-adoption-card__tags">
                        <Tag type={adoptionTagType(adoptionState)}>{formatAdoptionLabel(adoptionState)}</Tag>
                        <Tag type={adoptionTagType(candidate.readiness?.status)}>{readinessText}</Tag>
                      </div>
                    </div>

                    <div className="hp-adoption-card__meta-row">
                      <span>Trust: {formatAdoptionLabel(candidate.trust_state)}</span>
                      <span>Activation: {formatAdoptionLabel(activationState)}</span>
                    </div>

                    {adoptionState === 'candidate' ? (
                      <div className="hp-adoption-card__actions">
                        <TextInput
                          id={`claim-code-${candidateId}`}
                          size="sm"
                          labelText="Pairing code"
                          hideLabel
                          placeholder="Enter pairing code"
                          value={claimCodes[candidateId] ?? ''}
                          onChange={(event) => handleClaimCodeChange(candidateId, event.target.value)}
                        />
                        <Button
                          kind="secondary"
                          size="sm"
                          disabled={isClaimBusy}
                          onClick={() => void handleClaimCandidate(candidateId)}
                        >
                          {isClaimBusy ? 'Claiming…' : 'Claim'}
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={isTokenClaimBusy}
                          onClick={() => void handleTokenClaimCandidate(candidate)}
                        >
                          {isTokenClaimBusy ? 'Issuing token…' : 'Claim with token'}
                        </Button>
                      </div>
                    ) : null}

                    {adoptionState === 'claimable' ? (
                      <div className="hp-adoption-card__actions">
                        <Button
                          kind="primary"
                          size="sm"
                          disabled={isAdoptBusy}
                          onClick={() => void handleAdoptCandidate(candidate)}
                        >
                          {isAdoptBusy ? 'Adopting…' : 'Adopt to standby'}
                        </Button>
                      </div>
                    ) : null}

                    {showCloneControls ? (
                      <div className="hp-clone-panel">
                        <p className="hp-clone-panel__title">Clone safe settings from another node</p>
                        <p className="hp-node-card__meta">
                          Select a managed source node, review the clone groups, then apply the chosen defaults before promotion.
                        </p>

                        {cloneSources.length > 0 ? (
                          <div className="hp-clone-panel__controls">
                            <Select
                              id={`clone-source-${nodeId}`}
                              size="sm"
                              labelText="Clone source"
                              value={selectedCloneSource}
                              onChange={(event) => handleCloneSourceChange(nodeId, event.target.value)}
                            >
                              {cloneSources.map((source) => {
                                const sourceNodeId = resolveString(source.node_id) ?? ''
                                const sourceLabel = resolveString(source.display_name) ?? resolveString(source.hostname) ?? sourceNodeId
                                const sourceMeta = resolveString(source.hostname) ?? sourceNodeId
                                return (
                                  <SelectItem
                                    key={sourceNodeId}
                                    value={sourceNodeId}
                                    text={sourceMeta && sourceMeta !== sourceLabel ? `${sourceLabel} (${sourceMeta})` : sourceLabel}
                                  />
                                )
                              })}
                            </Select>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={isCloneSourceBusy || isClonePreviewBusy || !selectedCloneSource}
                              onClick={() => nodeId && selectedCloneSource ? void handlePreviewCloneCandidate(nodeId, selectedCloneSource) : undefined}
                            >
                              {isCloneSourceBusy || isClonePreviewBusy ? 'Refreshing clone preview…' : 'Refresh clone preview'}
                            </Button>
                          </div>
                        ) : (
                          <p className="hp-node-card__meta">
                            {isCloneSourceBusy ? 'Loading clone sources…' : 'No managed clone sources are available yet.'}
                          </p>
                        )}

                        {cloneGroups.length > 0 ? (
                          <div className="hp-clone-panel__groups">
                            {cloneGroups.map((group) => {
                              const groupId = resolveString(group.id)
                              if (!groupId) return null
                              return (
                                <div key={groupId} className="hp-clone-group">
                                  <Checkbox
                                    id={`clone-group-${nodeId}-${groupId}`}
                                    labelText={resolveString(group.label) ?? groupId}
                                    checked={cloneSelections[groupId] !== false}
                                    onChange={(_, { checked }) => handleCloneGroupToggle(nodeId, groupId, Boolean(checked))}
                                  />
                                  <p className="hp-node-card__meta">{resolveString(group.description)}</p>
                                  <div className="hp-clone-group__items">
                                    {(group.items ?? []).map((item) => {
                                      const itemKey = resolveString(item.key) ?? resolveString(item.label) ?? 'item'
                                      return (
                                        <span key={itemKey} className="hp-clone-group__item">
                                          {resolveString(item.label) ?? itemKey}: {resolveString(item.value) ?? 'n/a'}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {(adoptionState === 'adopted' || adoptionState === 'blocked') && nodeId ? (
                      <div className="hp-adoption-card__actions">
                        <Button
                          kind="secondary"
                          size="sm"
                          disabled={isCloneApplyBusy || cloneGroups.length === 0}
                          onClick={() => void handleApplyCloneCandidate(candidate)}
                        >
                          {isCloneApplyBusy ? 'Applying clone…' : 'Apply selected clone'}
                        </Button>
                        <Button
                          kind="primary"
                          size="sm"
                          disabled={isPromoteBusy || candidate.readiness?.status === 'blocked'}
                          onClick={() => void handlePromoteCandidate(candidate)}
                        >
                          {isPromoteBusy ? 'Promoting…' : 'Promote to active'}
                        </Button>
                      </div>
                    ) : null}
                  </Tile>
                )
              })}
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
