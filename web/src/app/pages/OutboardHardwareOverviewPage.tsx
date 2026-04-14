import { Button, Tag, Tile } from '@carbon/react'
import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'

import { useTesiraDevices } from '../components/Tesira/hooks/useTesiraApi'
import type { TesiraDeviceSummary } from '../components/Tesira/types'
import { type DeviceLocation, useDeviceLocation } from '../hooks/useDeviceLocation'
import { PageHeader } from '../components/PageHeader'
import { useIntelFXOverviewStatus, type IntelFXState } from '../../map2/intelfxApi'
import { useMPX1OverviewStatus, type MPX1State } from '../../map2/mpx1Api'
import {
  resolveOutboardHardwareStandaloneRoute,
  type OutboardHardwareDevice,
  type OutboardHardwareShellContextValue,
} from './outboardHardwareShared'
import { useCluster } from '../contexts/useCluster'
import { buildOutboardHardwarePath } from './outboardHardwareRoutes'

type StatusTagType = 'green' | 'red' | 'blue' | 'cool-gray' | 'warm-gray'
type OutboardHardwareLiveStatusGroup = 'healthy' | 'attention' | 'offline'
type StatusFilter = 'all' | OutboardHardwareLiveStatusGroup

type LiveStatusFact = {
  label: string
  type: StatusTagType
}

type OutboardHardwareLiveStatus = {
  group: OutboardHardwareLiveStatusGroup
  label: string
  type: StatusTagType
  summary: string
  facts: LiveStatusFact[]
}

type OutboardHardwareRouteTarget = {
  label: string
  path: string
  nodeId: string | null
}

function categoryTagType(category: OutboardHardwareDevice['category']): 'red' | 'blue' | 'green' {
  if (category === 'AVB DSP Mixer') return 'red'
  if (category === 'USB Audio Interface') return 'blue'
  return 'green'
}

function dedupeLabels(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

function describeLocation(location: DeviceLocation | null | undefined): string | null {
  return location?.hostname ?? location?.nodeId ?? null
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function buildInterfaceStatus(
  displayName: string,
  location: DeviceLocation | null,
  isLoading: boolean,
  error: unknown,
): OutboardHardwareLiveStatus {
  const nodeLabel = describeLocation(location)

  if (isLoading && !location && !error) {
    return {
      group: 'attention',
      label: 'Refreshing',
      type: 'blue',
      summary: `Checking cluster inventory for ${displayName}.`,
      facts: [{ label: 'Inventory poll active', type: 'blue' }],
    }
  }

  if (location?.status === 'offline') {
    return {
      group: 'offline',
      label: 'Node offline',
      type: 'red',
      summary: `${displayName} is assigned to ${nodeLabel ?? 'a cluster node'}, but that node is currently offline.`,
      facts: [
        { label: nodeLabel ?? 'Offline node', type: 'red' },
        { label: 'Switch required', type: 'warm-gray' },
      ],
    }
  }

  if (location) {
    return {
      group: 'healthy',
      label: 'Detected',
      type: 'green',
      summary: `${displayName} is visible on ${nodeLabel ?? 'the cluster inventory'} and ready for its dedicated route.`,
      facts: [
        { label: nodeLabel ?? 'Cluster inventory', type: 'green' },
        { label: location.kind.replace('_', ' '), type: 'cool-gray' },
      ],
    }
  }

  if (error) {
    return {
      group: 'attention',
      label: 'Inventory issue',
      type: 'red',
      summary: `Cluster inventory could not confirm ${displayName} right now.`,
      facts: [{ label: 'Retry from dedicated route', type: 'warm-gray' }],
    }
  }

  return {
    group: 'offline',
    label: 'Not detected',
    type: 'cool-gray',
    summary: `${displayName} is not currently visible in the shared hardware inventory.`,
    facts: [{ label: 'No inventory match', type: 'cool-gray' }],
  }
}

function buildRackStatus(
  displayName: string,
  location: DeviceLocation | null,
  state: MPX1State | IntelFXState | null,
  error: string | null,
): OutboardHardwareLiveStatus {
  const nodeLabel = describeLocation(location)

  if (!state && !error && !location) {
    return {
      group: 'attention',
      label: 'Refreshing',
      type: 'blue',
      summary: `Checking live rack status for ${displayName}.`,
      facts: [{ label: 'State bootstrap active', type: 'blue' }],
    }
  }

  if (location?.status === 'offline') {
    return {
      group: 'offline',
      label: 'Node offline',
      type: 'red',
      summary: `${displayName} is assigned to ${nodeLabel ?? 'a cluster node'}, but that node is currently offline.`,
      facts: [{ label: nodeLabel ?? 'Offline node', type: 'red' }],
    }
  }

  if (state?.connected) {
    return {
      group: 'healthy',
      label: 'Connected',
      type: 'green',
      summary: `${displayName} is responding${nodeLabel ? ` on ${nodeLabel}` : ''} and reports program ${state.current_program}.`,
      facts: [
        { label: `Program ${state.current_program}`, type: 'green' },
        ...(nodeLabel ? [{ label: nodeLabel, type: 'cool-gray' as const }] : []),
        { label: state.rtmidi_available ? 'RtMidi ready' : 'RtMidi unavailable', type: state.rtmidi_available ? 'green' : 'warm-gray' },
      ],
    }
  }

  if (location) {
    return {
      group: 'attention',
      label: 'Detected only',
      type: 'warm-gray',
      summary: `${displayName} is visible on ${nodeLabel ?? 'the cluster inventory'}, but the live control service is not currently connected.`,
      facts: [
        { label: nodeLabel ?? 'Cluster inventory', type: 'cool-gray' },
        { label: 'Control link down', type: 'warm-gray' },
      ],
    }
  }

  if (error) {
    return {
      group: 'attention',
      label: 'Control issue',
      type: 'red',
      summary: `The live control hook for ${displayName} returned an error before the rack could be confirmed.`,
      facts: [{ label: 'Open dedicated route', type: 'warm-gray' }],
    }
  }

  return {
    group: 'offline',
    label: 'Not detected',
    type: 'cool-gray',
    summary: `${displayName} is not currently visible in inventory and is not reporting live control state.`,
    facts: [{ label: 'No live rack session', type: 'cool-gray' }],
  }
}

function buildTesiraStatus(devices: TesiraDeviceSummary[], isLoading: boolean, error: unknown): OutboardHardwareLiveStatus {
  if (isLoading && devices.length === 0 && !error) {
    return {
      group: 'attention',
      label: 'Refreshing',
      type: 'blue',
      summary: 'Checking the Tesira fleet feed.',
      facts: [{ label: 'Fleet query active', type: 'blue' }],
    }
  }

  if (error && devices.length === 0) {
    return {
      group: 'attention',
      label: 'Fleet issue',
      type: 'red',
      summary: 'The Tesira fleet query did not return any devices.',
      facts: [{ label: 'Query retry needed', type: 'warm-gray' }],
    }
  }

  if (devices.length === 0) {
    return {
      group: 'offline',
      label: 'Not discovered',
      type: 'cool-gray',
      summary: 'No Tesira units are currently discovered by the fleet query.',
      facts: [{ label: '0 devices', type: 'cool-gray' }],
    }
  }

  const connectedCount = devices.filter((device) => device.connected).length
  const faultCount = devices.reduce((sum, device) => sum + (device.fault_count ?? 0), 0)
  const nodeLabels = dedupeLabels(devices.flatMap((device) => [device.source_hostname, device.source_node_id, device.host]))
  const stateType: StatusTagType = connectedCount === 0 ? 'red' : faultCount > 0 || connectedCount < devices.length ? 'warm-gray' : 'green'
  const stateLabel =
    connectedCount === 0
      ? 'Offline'
      : faultCount > 0
        ? 'Attention'
        : connectedCount < devices.length
          ? 'Partial'
          : 'Healthy'

  return {
    group: stateType === 'green' ? 'healthy' : stateType === 'warm-gray' ? 'attention' : 'offline',
    label: stateLabel,
    type: stateType,
    summary: `${connectedCount}/${devices.length} Tesira devices connected${faultCount > 0 ? ` with ${pluralize(faultCount, 'fault')}` : ''}.`,
    facts: [
      { label: `${connectedCount}/${devices.length} connected`, type: connectedCount > 0 ? 'green' : 'red' },
      ...(faultCount > 0 ? [{ label: pluralize(faultCount, 'fault'), type: 'red' as const }] : []),
      ...(nodeLabels[0] ? [{ label: nodeLabels[0], type: 'cool-gray' as const }] : []),
    ],
  }
}

function useOutboardHardwareLiveStatus(): Record<string, OutboardHardwareLiveStatus> {
  const tesiraDevicesQuery = useTesiraDevices()
  const edirolLocation = useDeviceLocation('edirol-ua1000')
  const joggLocation = useDeviceLocation('hotone-jogg')
  const mpx1Location = useDeviceLocation('lexicon-mpx1')
  const intelfxLocation = useDeviceLocation('rocktron-intelfx')
  const mpx1 = useMPX1OverviewStatus({
    enabled: true,
    pollIntervalMs: 15_000,
    nodeId: mpx1Location.location?.nodeId ?? null,
  })
  const intelfx = useIntelFXOverviewStatus({
    enabled: true,
    pollIntervalMs: 15_000,
    nodeId: intelfxLocation.location?.nodeId ?? null,
  })

  return useMemo(
    () => ({
      'biamp-tesira': buildTesiraStatus(
        tesiraDevicesQuery.data ?? [],
        tesiraDevicesQuery.isLoading,
        tesiraDevicesQuery.error,
      ),
      'edirol-ua1000': buildInterfaceStatus(
        'Edirol UA-1000',
        edirolLocation.location,
        edirolLocation.isLoading,
        edirolLocation.error,
      ),
      'hotone-jogg': buildInterfaceStatus(
        'HoTone JoGG',
        joggLocation.location,
        joggLocation.isLoading,
        joggLocation.error,
      ),
      'lexicon-mpx1': buildRackStatus('MPX1 Rack', mpx1Location.location, mpx1.state, mpx1.error),
      'eventide-intelfx': buildRackStatus('IntelFX Rack', intelfxLocation.location, intelfx.state, intelfx.error),
    }),
    [
      edirolLocation.error,
      edirolLocation.isLoading,
      edirolLocation.location,
      intelfx.error,
      intelfx.state,
      intelfxLocation.location,
      joggLocation.error,
      joggLocation.isLoading,
      joggLocation.location,
      mpx1.error,
      mpx1.state,
      mpx1Location.location,
      tesiraDevicesQuery.data,
      tesiraDevicesQuery.error,
      tesiraDevicesQuery.isLoading,
    ],
  )
}

function routeTargetLabel(nodeName: string | null | undefined): string {
  return nodeName?.trim() ? `Open on ${nodeName}` : 'Open dedicated route'
}

function resolveRouteTarget(
  device: OutboardHardwareDevice,
  liveStatusByDeviceId: Record<string, OutboardHardwareLiveStatus>,
  locations: {
    edirol: DeviceLocation | null
    jogg: DeviceLocation | null
    mpx1: DeviceLocation | null
    intelfx: DeviceLocation | null
  },
  tesiraDevices: TesiraDeviceSummary[],
  localNodeId: string,
): OutboardHardwareRouteTarget | null {
  const dedicatedRoute = resolveOutboardHardwareStandaloneRoute(device.deviceId)
  if (!dedicatedRoute) {
    return null
  }

  if (device.deviceId === 'biamp-tesira') {
    if (tesiraDevices.length === 1) {
      const deviceSummary = tesiraDevices[0]
      const nodeId = deviceSummary.source_node_id && deviceSummary.source_node_id !== localNodeId
        ? deviceSummary.source_node_id
        : null
      const nodeName = deviceSummary.source_hostname ?? deviceSummary.source_node_id ?? null
      return {
        label: routeTargetLabel(nodeName),
        path: `/tesira/${deviceSummary.device_id}/dashboard`,
        nodeId,
      }
    }

    const primaryNode = dedupeLabels(tesiraDevices.flatMap((entry) => [entry.source_hostname, entry.source_node_id]))[0] ?? null
    return {
      label: routeTargetLabel(primaryNode),
      path: dedicatedRoute,
      nodeId: null,
    }
  }

  const location =
    device.deviceId === 'edirol-ua1000'
      ? locations.edirol
      : device.deviceId === 'hotone-jogg'
        ? locations.jogg
        : device.deviceId === 'lexicon-mpx1'
          ? locations.mpx1
          : device.deviceId === 'eventide-intelfx'
            ? locations.intelfx
            : null

  const nodeId = location?.nodeId && location.nodeId !== localNodeId ? location.nodeId : null
  const nodeName = describeLocation(location)
  const status = liveStatusByDeviceId[device.deviceId]

  return {
    label: routeTargetLabel(nodeName),
    path: dedicatedRoute,
    nodeId: status?.group === 'offline' && !location ? null : nodeId,
  }
}

function matchesStatusFilter(status: OutboardHardwareLiveStatus, filter: StatusFilter): boolean {
  return filter === 'all' || status.group === filter
}

function filterLabel(filter: StatusFilter): string {
  if (filter === 'all') return 'All'
  if (filter === 'healthy') return 'Healthy'
  if (filter === 'attention') return 'Attention'
  return 'Offline'
}

function OutboardHardwareCard({
  device,
  liveStatus,
  routeTarget,
  buildDevicePath,
}: {
  device: OutboardHardwareDevice
  liveStatus: OutboardHardwareLiveStatus
  routeTarget: OutboardHardwareRouteTarget | null
  buildDevicePath: (deviceId?: string | null) => string
}) {
  const navigate = useNavigate()
  const { setActiveNode } = useCluster()
  const dedicatedRoute = routeTarget?.path ?? resolveOutboardHardwareStandaloneRoute(device.deviceId)

  const openDedicatedRoute = () => {
    if (!routeTarget) return
    setActiveNode(routeTarget.nodeId)
    navigate(routeTarget.path)
  }

  return (
    <Tile className="outboard-hardware-page__card">
      <div className="outboard-hardware-page__card-head">
        <div>
          <p className="outboard-hardware-page__eyebrow">{device.category}</p>
          <h2>{device.displayName}</h2>
        </div>
        <Tag type={categoryTagType(device.category)}>{device.shortLabel}</Tag>
      </div>
      <p className="outboard-hardware-page__body-copy">{device.description}</p>
      <p className="outboard-hardware-page__body-copy">
        Operator focus: <strong>{device.operatorFocus}</strong>
      </p>
      <div
        className="outboard-hardware-page__tag-row outboard-hardware-page__status-row"
        aria-label={`${device.displayName} live status`}
      >
        <Tag type={liveStatus.type}>{liveStatus.label}</Tag>
        {liveStatus.facts.map((fact) => (
          <Tag key={`${device.deviceId}-${fact.label}`} type={fact.type}>
            {fact.label}
          </Tag>
        ))}
      </div>
      <p className="outboard-hardware-page__body-copy">
        Live status: <strong>{liveStatus.summary}</strong>
      </p>
      <div className="outboard-hardware-page__tag-row">
        {device.capabilities.slice(0, 4).map((capability) => (
          <Tag key={`${device.deviceId}-${capability}`} type="cool-gray">
            {capability}
          </Tag>
        ))}
      </div>
      <div className="outboard-hardware-page__action-row">
        <Button kind="ghost" size="sm" onClick={() => navigate(buildDevicePath(device.deviceId))}>
          Open in workspace
        </Button>
        {dedicatedRoute ? (
          <Button kind="secondary" size="sm" onClick={openDedicatedRoute}>
            {routeTarget?.label ?? 'Open dedicated route'}
          </Button>
        ) : null}
      </div>
    </Tile>
  )
}

export function OutboardHardwareOverviewPage({
  buildDevicePath = buildOutboardHardwarePath,
}: {
  buildDevicePath?: (deviceId?: string | null) => string
}) {
  const { devices } = useOutletContext<OutboardHardwareShellContextValue>()
  const { localNodeId } = useCluster()
  const tesiraDevicesQuery = useTesiraDevices()
  const edirolLocation = useDeviceLocation('edirol-ua1000')
  const joggLocation = useDeviceLocation('hotone-jogg')
  const mpx1Location = useDeviceLocation('lexicon-mpx1')
  const intelfxLocation = useDeviceLocation('rocktron-intelfx')
  const liveStatusByDeviceId = useOutboardHardwareLiveStatus()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const metrics = useMemo(() => ({
    total: devices.length,
    healthy: devices.filter((device) => liveStatusByDeviceId[device.deviceId]?.group === 'healthy').length,
    attention: devices.filter((device) => liveStatusByDeviceId[device.deviceId]?.group === 'attention').length,
    offline: devices.filter((device) => liveStatusByDeviceId[device.deviceId]?.group === 'offline').length,
  }), [devices, liveStatusByDeviceId])

  const filteredDevices = useMemo(
    () => devices.filter((device) => matchesStatusFilter(liveStatusByDeviceId[device.deviceId], statusFilter)),
    [devices, liveStatusByDeviceId, statusFilter],
  )

  const routeTargetsByDeviceId = useMemo(
    () =>
      Object.fromEntries(
        devices.map((device) => [
          device.deviceId,
          resolveRouteTarget(
            device,
            liveStatusByDeviceId,
            {
              edirol: edirolLocation.location,
              jogg: joggLocation.location,
              mpx1: mpx1Location.location,
              intelfx: intelfxLocation.location,
            },
            tesiraDevicesQuery.data ?? [],
            localNodeId,
          ),
        ]),
      ) as Record<string, OutboardHardwareRouteTarget | null>,
    [
      devices,
      edirolLocation.location,
      intelfxLocation.location,
      joggLocation.location,
      liveStatusByDeviceId,
      localNodeId,
      mpx1Location.location,
      tesiraDevicesQuery.data,
    ],
  )

  return (
    <div className="outboard-hardware-page">
      <PageHeader
        title="Outboard Hardware"
        subtitle="Unified routed shell for rack processors, AVB DSP hardware, and dedicated interface pages."
        actions={
          <div className="outboard-hardware-page__tag-row">
            <Tag type="blue">{metrics.total} devices</Tag>
            <Tag type="green">{metrics.healthy} healthy</Tag>
            <Tag type="warm-gray">{metrics.attention} attention</Tag>
            <Tag type="red">{metrics.offline} offline</Tag>
          </div>
        }
      />

      <div className="outboard-hardware-page__metrics">
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Total devices</p>
          <h2>{metrics.total}</h2>
          <p className="outboard-hardware-page__body-copy">All currently curated outboard units exposed through the shared shell.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Healthy</p>
          <h2>{metrics.healthy}</h2>
          <p className="outboard-hardware-page__body-copy">Devices currently reporting a ready or connected posture from the shared rollup sources.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Attention</p>
          <h2>{metrics.attention}</h2>
          <p className="outboard-hardware-page__body-copy">Devices that are partially reachable, refreshing, or need operator review before live use.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Offline</p>
          <h2>{metrics.offline}</h2>
          <p className="outboard-hardware-page__body-copy">Devices not currently discovered or assigned to nodes that are offline from the shared inventory view.</p>
        </Tile>
      </div>

      <div className="outboard-hardware-page__action-row" role="group" aria-label="Outboard status filter">
        <Tag type="cool-gray">
          Showing {filteredDevices.length} of {metrics.total}
        </Tag>
        {(['all', 'healthy', 'attention', 'offline'] as StatusFilter[]).map((filter) => (
          <Button
            key={filter}
            kind={statusFilter === filter ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter(filter)}
          >
            {filterLabel(filter)}
          </Button>
        ))}
      </div>

      <div className="outboard-hardware-page__unit-grid">
        {filteredDevices.length === 0 ? (
          <Tile className="outboard-hardware-page__card">
            <p className="outboard-hardware-page__body-copy">
              No outboard devices currently match the <strong>{filterLabel(statusFilter)}</strong> filter.
            </p>
          </Tile>
        ) : (
          filteredDevices.map((device) => (
            <OutboardHardwareCard
              key={device.deviceId}
              device={device}
              liveStatus={liveStatusByDeviceId[device.deviceId] ?? {
                group: 'offline',
                label: 'Unavailable',
                type: 'cool-gray',
                summary: 'Live status is not available for this device yet.',
                facts: [],
              }}
              routeTarget={routeTargetsByDeviceId[device.deviceId] ?? null}
              buildDevicePath={buildDevicePath}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default OutboardHardwareOverviewPage
