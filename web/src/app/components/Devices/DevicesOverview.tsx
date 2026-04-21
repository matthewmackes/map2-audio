/**
 * DevicesOverview — grid landing page for `/devices`. Phase 3 of T2420.
 *
 * Renders one Carbon tile per entry in `DEVICE_REGISTRY`, grouped by `kind`.
 * Status badge is resolved from:
 *   - `statusSource.kind === 'device-location'` → `useClusterHardwareInventory`
 *     + `scanInventory`-style match (via `useDeviceLocation`).
 *   - `statusSource.kind === 'physical-surface'` → `enrichedPhysicalSurfacesApi.getSummary()`.
 *   - `statusSource.kind === 'planned'` → always `'planned'`.
 *
 * Clicking a tile navigates to the device's `defaultView` via `buildDeviceRoute`.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClickableTile, Layer, Tag } from '@carbon/react'

import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
  type DeviceRegistryEntry,
  type DeviceStatusKind,
} from '../../data/deviceRegistry'
import { useClusterHardwareInventory } from '../../hooks/useDeviceLocation'
import { enrichedPhysicalSurfacesApi } from '../../../map2/clients/enrichedPhysicalSurfaces'
import type { EnrichedPhysicalSurfaceUnit } from '../../../map2/types'

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
    return { kind: 'planned', label: 'Planned', tone: 'cool-gray' }
  }
  if (entry.statusSource.kind === 'device-location') {
    const found = deviceLocationPresent(inventory, entry.statusSource.deviceKey)
    return found
      ? { kind: 'online', label: 'Online', tone: 'green' }
      : { kind: 'offline', label: 'Offline', tone: 'warm-gray' }
  }
  const surface = surfaceStatusFor(surfaces, entry.statusSource.surfaceId)
  if (!surface) {
    return { kind: 'offline', label: 'Offline', tone: 'warm-gray' }
  }
  if (surface.status === 'online') {
    return { kind: 'online', label: 'Online', tone: 'green', detail: surface.name }
  }
  if (surface.status === 'detected') {
    return { kind: 'detected', label: 'Detected', tone: 'blue', detail: surface.name }
  }
  if (surface.status === 'attention') {
    return { kind: 'offline', label: 'Attention', tone: 'red', detail: surface.name }
  }
  return { kind: 'planned', label: 'Planned', tone: 'cool-gray', detail: surface.name }
}

const KIND_SECTION_ORDER: Array<DeviceRegistryEntry['kind']> = [
  'audio-interface',
  'processor',
  'console',
  'control-surface',
]
const KIND_LABELS: Record<DeviceRegistryEntry['kind'], string> = {
  'audio-interface': 'Audio interfaces',
  processor: 'Processors',
  console: 'Consoles',
  'control-surface': 'Control surfaces',
}

export function DevicesOverview() {
  const navigate = useNavigate()
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

  return (
    <Layer level={1} className="devices-overview">
      <header className="devices-overview__header">
        <h2 className="devices-overview__title">Devices</h2>
        <p className="devices-overview__subtitle">
          All hardware units and control surfaces managed by this stack.
        </p>
      </header>

      {KIND_SECTION_ORDER.map((kind) => {
        const entries = grouped[kind]
        if (!entries.length) return null
        return (
          <section key={kind} className="devices-overview__section">
            <h3 className="devices-overview__section-title">{KIND_LABELS[kind]}</h3>
            <div className="devices-overview__grid">
              {entries.map((entry) => {
                const status = statusByDevice[entry.id]
                const Icon = entry.icon
                return (
                  <ClickableTile
                    key={entry.id}
                    className="devices-overview__tile"
                    onClick={() =>
                      navigate(entry.legacyRoute ?? buildDeviceRoute(entry.id))
                    }
                  >
                    <div
                      className="devices-overview__tile-accent"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden="true"
                    />
                    <div className="devices-overview__tile-header">
                      <Icon size={20} />
                      <div className="devices-overview__tile-labels">
                        <span className="devices-overview__tile-name">{entry.label}</span>
                        <span className="devices-overview__tile-short">{entry.shortLabel}</span>
                      </div>
                    </div>
                    <p className="devices-overview__tile-description">{entry.description}</p>
                    <div className="devices-overview__tile-meta">
                      <Tag type={status.tone} size="sm">
                        {status.label}
                      </Tag>
                      <span className="devices-overview__tile-views">
                        {entry.views.length} view{entry.views.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </ClickableTile>
                )
              })}
            </div>
          </section>
        )
      })}
    </Layer>
  )
}
