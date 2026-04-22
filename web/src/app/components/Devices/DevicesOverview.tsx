/**
 * DevicesOverview — unified hero-card landing page for `/devices`.
 *
 * Renders one hero card per entry in `DEVICE_REGISTRY`, grouped by `kind`.
 * Each card shows the vendor hero artwork, capability chips, transport layer
 * status, and a live status tag resolved from:
 *   - `statusSource.kind === 'device-location'` → `useClusterHardwareInventory`.
 *   - `statusSource.kind === 'physical-surface'` → `enrichedPhysicalSurfacesApi.getSummary()`.
 *   - `statusSource.kind === 'planned'` → always `'planned'`.
 *
 * Clicking the hero image (or the "Open Surface Page" action) navigates to the
 * device's `defaultView` via `buildDeviceRoute`.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Tag } from '@carbon/react'

import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
  type DeviceRegistryEntry,
  type DeviceStatusKind,
  type DeviceTransportLayer,
} from '../../data/deviceRegistry'
import { getDeviceHeroImage } from '../../data/deviceHeroImages'
import { useClusterHardwareInventory } from '../../hooks/useDeviceLocation'
import { enrichedPhysicalSurfacesApi } from '../../../map2/clients/enrichedPhysicalSurfaces'
import type { EnrichedPhysicalSurfaceUnit } from '../../../map2/types'
import { DashboardCard } from '../shared/DashboardCard'
import { WorkspaceSectionHeader } from '../shared/WorkspaceSectionHeader'

import './DevicesOverview.css'

type StatusTagType = 'green' | 'blue' | 'cool-gray' | 'warm-gray' | 'red'

interface DeviceStatus {
  kind: DeviceStatusKind
  label: string
  tone: StatusTagType
  detail?: string
}

const DEVICE_TYPE_SEARCH_TERMS: Record<string, string[]> = {
  'ableton-push': ['ableton push', 'push 1', 'push 2', 'push 3', 'push'],
  'edirol-ua1000': ['edirol ua 1000', 'ua 1000', '0582 0074'],
  'hotone-jogg': ['hotone jogg', 'jogg', '84ef 0014'],
  'lexicon-mpx1': ['lexicon mpx 1', 'mpx 1', 'lexicon'],
  'rocktron-intelfx': ['rocktron intellifex', 'intellifex', 'intel fx', 'rocktron'],
  'biamp-tesira': ['biamp tesira', 'tesira', 'biamp'],
  'lcd-console': ['lcd console', 'map2 lcd'],
  'ground-control-pro': ['ground control pro', 'voodoo lab', 'gc pro'],
  'mackie-mcu-pro': ['mackie mcu pro', 'mcu pro', 'mackie control'],
  'novation-launch-control': ['novation launch control', 'launch control'],
  'meloaudio-midi-commander': ['meloaudio midi commander', 'midi commander'],
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function deviceLocationPresent(
  inventory: Record<string, any> | undefined,
  deviceKey: string | string[],
): boolean {
  if (!inventory) return false
  const needles = Array.isArray(deviceKey)
    ? deviceKey
    : (DEVICE_TYPE_SEARCH_TERMS[deviceKey] ?? [deviceKey])
  for (const node of Object.values(inventory)) {
    const haystacks: string[] = []
    for (const device of (node as any).usb_audio_devices ?? []) {
      haystacks.push(normalize((device as any).name) + ' ' + normalize((device as any).product))
    }
    for (const device of (node as any).midi_devices ?? []) {
      haystacks.push(normalize((device as any).name) + ' ' + normalize((device as any).product))
    }
    for (const label of (node as any).audio_interfaces ?? []) {
      haystacks.push(normalize(label))
    }
    const combined = haystacks.join(' ')
    if (needles.some((needle) => combined.includes(normalize(needle)))) {
      return true
    }
  }
  return false
}

function surfaceStatusFor(
  units: EnrichedPhysicalSurfaceUnit[] | undefined,
  surfaceId: string,
): { status: EnrichedPhysicalSurfaceUnit['status']; name: string } | null {
  if (!units) return null
  const match = units.find(
    (unit) =>
      unit.unit_id === surfaceId ||
      unit.device_type === surfaceId ||
      (unit.family ?? '').toLowerCase() === surfaceId.toLowerCase(),
  )
  if (!match) return null
  return { status: match.status, name: match.display_name }
}

function toDeviceStatus(
  entry: DeviceRegistryEntry,
  inventory: Record<string, any> | undefined,
  surfaces: EnrichedPhysicalSurfaceUnit[] | undefined,
): DeviceStatus {
  if (entry.statusSource.kind === 'planned') {
    return { kind: 'planned', label: 'planned', tone: 'cool-gray' }
  }
  if (entry.statusSource.kind === 'device-location') {
    const found = deviceLocationPresent(inventory, entry.statusSource.deviceKey)
    return found
      ? { kind: 'online', label: 'online', tone: 'green' }
      : { kind: 'offline', label: 'offline', tone: 'warm-gray' }
  }
  const surface = surfaceStatusFor(surfaces, entry.statusSource.surfaceId)
  if (!surface) {
    return { kind: 'offline', label: 'offline', tone: 'warm-gray' }
  }
  if (surface.status === 'online') {
    return { kind: 'online', label: 'online', tone: 'green', detail: surface.name }
  }
  if (surface.status === 'detected') {
    return { kind: 'detected', label: 'detected', tone: 'blue', detail: surface.name }
  }
  if (surface.status === 'attention') {
    return { kind: 'offline', label: 'attention', tone: 'red', detail: surface.name }
  }
  return { kind: 'planned', label: 'planned', tone: 'cool-gray', detail: surface.name }
}

function transportLayerTone(status: DeviceTransportLayer['status']): StatusTagType {
  if (status === 'online') return 'green'
  if (status === 'detected') return 'blue'
  if (status === 'offline') return 'red'
  return 'cool-gray'
}

const KIND_SECTION_ORDER: Array<DeviceRegistryEntry['kind']> = [
  'control-surface',
  'processor',
  'audio-interface',
  'console',
]
const KIND_LABELS: Record<DeviceRegistryEntry['kind'], string> = {
  'audio-interface': 'Audio interfaces',
  processor: 'Processors',
  console: 'Consoles',
  'control-surface': 'Physical Surfaces',
}
const KIND_SUBTITLES: Record<DeviceRegistryEntry['kind'], string> = {
  'audio-interface': 'USB audio interfaces and host-side routing.',
  processor: 'Rack processors, AVB DSP, and effects units.',
  console: 'On-site consoles and status surfaces.',
  'control-surface': 'Controller families, transport layers, and device-specific surfaces.',
}

function DeviceHeroCard({ entry, status }: { entry: DeviceRegistryEntry; status: DeviceStatus }) {
  const navigate = useNavigate()
  const hero = getDeviceHeroImage(entry.id)
  const targetRoute = buildDeviceRoute(entry.id)

  const openDeviceRoute = () => navigate(targetRoute)

  const handleHeroKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDeviceRoute()
    }
  }

  return (
    <DashboardCard className="devices-overview__card">
      <div className="devices-overview__card-head">
        <div>
          <p className="devices-overview__eyebrow">{entry.eyebrow}</p>
          <h2 className="devices-overview__card-title">{entry.label}</h2>
        </div>
        <Tag type={status.tone}>{status.label}</Tag>
      </div>
      <p className="devices-overview__body-copy">{entry.description}</p>
      <p className="devices-overview__body-copy">
        Current view: <strong>{entry.currentViewLabel}</strong>
      </p>
      <div className="devices-overview__tag-row">
        {entry.capabilities.slice(0, 4).map((capability) => (
          <Tag key={capability} type="cool-gray">
            {capability}
          </Tag>
        ))}
      </div>
      {entry.transportLayers.length ? (
        <div className="devices-overview__list-block">
          <h3>Transport layers</h3>
          <ul className="devices-overview__list">
            {entry.transportLayers.map((layer) => (
              <li key={layer.id}>
                <span>{layer.label}</span>
                <Tag type={transportLayerTone(layer.status)}>{layer.status}</Tag>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hero ? (
        <div
          className="devices-overview__hero-image-container"
          onClick={openDeviceRoute}
          onKeyDown={handleHeroKeyDown}
          role="button"
          tabIndex={0}
          title={`Open ${entry.label} — ${hero.attribution}`}
        >
          <img
            src={hero.imagePath}
            alt={hero.alt}
            className="devices-overview__hero-image"
            loading="lazy"
          />
          <div className="devices-overview__hero-image-overlay">
            <span className="devices-overview__hero-image-label">Open Surface Page</span>
          </div>
        </div>
      ) : null}
      <div className="devices-overview__action-row">
        <Button kind="ghost" size="sm" onClick={openDeviceRoute}>
          Open Surface Page
        </Button>
      </div>
    </DashboardCard>
  )
}

export function DevicesOverview() {
  const inventoryQuery = useClusterHardwareInventory(true)
  const surfacesQuery = useQuery({
    queryKey: ['devices-overview', 'physical-surfaces'],
    queryFn: () => enrichedPhysicalSurfacesApi.getSummary(),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  const statusByDevice = useMemo(() => {
    const result: Record<string, DeviceStatus> = {}
    const inventory = inventoryQuery.data?.nodes
    const surfaces = surfacesQuery.data?.summary.units
    for (const entry of DEVICE_REGISTRY) {
      result[entry.id] = toDeviceStatus(entry, inventory, surfaces)
    }
    return result
  }, [inventoryQuery.data?.nodes, surfacesQuery.data?.summary.units])

  const grouped = useMemo(() => {
    const result: Record<DeviceRegistryEntry['kind'], DeviceRegistryEntry[]> = {
      'audio-interface': [],
      processor: [],
      console: [],
      'control-surface': [],
    }
    for (const entry of DEVICE_REGISTRY) {
      result[entry.kind].push(entry)
    }
    return result
  }, [])

  const overviewMetrics = useMemo(() => {
    let online = 0
    let detected = 0
    for (const entry of DEVICE_REGISTRY) {
      const kind = statusByDevice[entry.id]?.kind
      if (kind === 'online') online += 1
      else if (kind === 'detected') detected += 1
    }
    return { online, detected, total: DEVICE_REGISTRY.length }
  }, [statusByDevice])

  const hostObservation = useMemo(
    () => DEVICE_REGISTRY.find((entry) => entry.hostObservation)?.hostObservation ?? null,
    [],
  )

  return (
    <div className="devices-overview">
      <WorkspaceSectionHeader
        eyebrow="Devices"
        title="Devices"
        subtitle="All hardware units and control surfaces managed by this stack."
        actions={
          <div className="devices-overview__tag-row">
            <Tag type="green">{overviewMetrics.online} online</Tag>
            <Tag type="blue">{overviewMetrics.detected} detected</Tag>
            <Tag type="blue">{overviewMetrics.total} units</Tag>
          </div>
        }
      />

      {hostObservation ? (
        <DashboardCard className="devices-overview__host-note">
          <p className="devices-overview__eyebrow">Host observation</p>
          <p className="devices-overview__body-copy">{hostObservation}</p>
        </DashboardCard>
      ) : null}

      {KIND_SECTION_ORDER.map((kind) => {
        const entries = grouped[kind]
        if (!entries.length) return null
        return (
          <section key={kind} className="devices-overview__section">
            <div className="devices-overview__section-header">
              <h3 className="devices-overview__section-title">{KIND_LABELS[kind]}</h3>
              <p className="devices-overview__section-subtitle">{KIND_SUBTITLES[kind]}</p>
            </div>
            <div className="devices-overview__unit-grid">
              {entries.map((entry) => (
                <DeviceHeroCard
                  key={entry.id}
                  entry={entry}
                  status={statusByDevice[entry.id]}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
