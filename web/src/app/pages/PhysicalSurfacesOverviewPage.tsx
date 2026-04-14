import { Button, Loading, Tag, Tile } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'

import { WorkspaceSectionHeader } from '../components/shared/WorkspaceSectionHeader'
import type { EnrichedPhysicalSurfaceUnit } from '../../map2/types'
import {
  resolvePhysicalSurfaceStandaloneRoute,
  type PhysicalSurfacesShellContextValue,
} from './physicalSurfacesShared'
import { buildPhysicalSurfacesPath } from './physicalSurfacesRoutes'

function statusTagType(status: string | undefined): 'green' | 'blue' | 'red' | 'cool-gray' {
  if (status === 'online') return 'green'
  if (status === 'detected') return 'blue'
  if (status === 'attention') return 'red'
  return 'cool-gray'
}

function overviewMetric(summary: PhysicalSurfacesShellContextValue['summary']) {
  if (!summary) {
    return {
      online: 0,
      detected: 0,
      planned: 0,
      usbDevices: 0,
      soundCards: 0,
      midiHubDevices: 0,
    }
  }
  const online = summary.units.filter((unit) => unit.status === 'online').length
  const detected = summary.units.filter((unit) => unit.status === 'detected').length
  const planned = summary.units.filter((unit) => unit.status === 'planned').length
  return {
    online,
    detected,
    planned,
    usbDevices: summary.host_observations.usb_devices.length,
    soundCards: summary.host_observations.sound_cards.length,
    midiHubDevices: summary.host_observations.midi_hub_devices.length,
  }
}

function UnitCard({
  unit,
  buildUnitPath,
}: {
  unit: EnrichedPhysicalSurfaceUnit
  buildUnitPath: (surfaceId?: string | null) => string
}) {
  const navigate = useNavigate()
  const standaloneRoute = resolvePhysicalSurfaceStandaloneRoute(unit.unit_id, unit.specialized_route)

  return (
    <Tile className="physical-surfaces-page__card" key={unit.unit_id}>
      <div className="physical-surfaces-page__card-head">
        <div>
          <p className="physical-surfaces-page__eyebrow">{unit.family}</p>
          <h2>{unit.display_name}</h2>
        </div>
        <Tag type={statusTagType(unit.status)}>{unit.status}</Tag>
      </div>
      <p className="physical-surfaces-page__body-copy">{unit.status_reason}</p>
      <p className="physical-surfaces-page__body-copy">
        Current view: <strong>{unit.view_state.current_view_label}</strong>
      </p>
      <div className="physical-surfaces-page__tag-row">
        {unit.capabilities.slice(0, 4).map((capability) => (
          <Tag key={capability} type="cool-gray">
            {capability}
          </Tag>
        ))}
        {unit.matched_midi_devices.length ? (
          <Tag type="green">{unit.matched_midi_devices.length} MIDI Hub match{unit.matched_midi_devices.length === 1 ? '' : 'es'}</Tag>
        ) : null}
      </div>
      <div className="physical-surfaces-page__list-block">
        <h3>Transport layers</h3>
        <ul className="physical-surfaces-page__list">
          {unit.transport_layers.map((layer) => (
            <li key={layer.layer_id}>
              <span>{layer.label}</span>
              <Tag type={statusTagType(layer.status)}>{layer.status}</Tag>
            </li>
          ))}
        </ul>
      </div>
      <div className="physical-surfaces-page__action-row">
        <Button kind="ghost" size="sm" onClick={() => navigate(buildUnitPath(unit.unit_id))}>
          Open Surface Page
        </Button>
        {standaloneRoute ? (
          <Button kind="secondary" size="sm" onClick={() => navigate(standaloneRoute)}>
            Open Dedicated Route
          </Button>
        ) : null}
      </div>
    </Tile>
  )
}

export function PhysicalSurfacesOverviewPage({
  buildUnitPath = buildPhysicalSurfacesPath,
}: {
  buildUnitPath?: (surfaceId?: string | null) => string
}) {
  const { summary, isLoading } = useOutletContext<PhysicalSurfacesShellContextValue>()

  const metrics = useMemo(() => overviewMetric(summary), [summary])

  if (isLoading && !summary) {
    return (
      <div className="physical-surfaces-page physical-surfaces-page--loading">
        <Loading active withOverlay={false} description="Loading physical surfaces" />
      </div>
    )
  }

  return (
    <div className="physical-surfaces-page">
      <WorkspaceSectionHeader
        eyebrow="Physical Surfaces"
        title="Physical Surfaces"
        subtitle="Controller families, transport layers, and device-specific surfaces"
        actions={<Tag type="blue">{summary?.units.length ?? 0} units</Tag>}
      />

      <div className="physical-surfaces-page__metrics">
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Online</p>
          <h2>{metrics.online}</h2>
          <p className="physical-surfaces-page__body-copy">Units currently reporting an active shared-stack runtime.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Detected</p>
          <h2>{metrics.detected}</h2>
          <p className="physical-surfaces-page__body-copy">Units matched by the host probe but not yet fully active in the richer runtime.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">USB Devices</p>
          <h2>{metrics.usbDevices}</h2>
          <p className="physical-surfaces-page__body-copy">USB devices visible to the shared hardware probe.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Sound Cards</p>
          <h2>{metrics.soundCards}</h2>
          <p className="physical-surfaces-page__body-copy">ALSA sound-card or MIDI-capable kernel paths seen through sysfs and procfs.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">MIDI Hub Devices</p>
          <h2>{metrics.midiHubDevices}</h2>
          <p className="physical-surfaces-page__body-copy">Profile-matched local devices currently visible through the shared MIDI Hub inventory.</p>
        </Tile>
      </div>

      {summary?.host_observations.maschinen_mk1_host_note ? (
        <Tile className="physical-surfaces-page__host-note">
          <p className="physical-surfaces-page__eyebrow">Host observation</p>
          <p className="physical-surfaces-page__body-copy">{summary.host_observations.maschinen_mk1_host_note}</p>
        </Tile>
      ) : null}

      <div className="physical-surfaces-page__unit-grid">
        {(summary?.units ?? []).map((unit) => (
          <UnitCard key={unit.unit_id} unit={unit} buildUnitPath={buildUnitPath} />
        ))}
      </div>
    </div>
  )
}

export default PhysicalSurfacesOverviewPage
