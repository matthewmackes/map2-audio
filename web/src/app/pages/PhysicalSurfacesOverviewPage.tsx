import { Button, Loading, Tag } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'

import { EmptyState } from '../components/shared/EmptyState'
import { DashboardCard } from '../components/shared/DashboardCard'
import { WorkspaceSectionHeader } from '../components/shared/WorkspaceSectionHeader'
import type { EnrichedPhysicalSurfaceUnit } from '../../map2/types'
import {
  resolvePhysicalSurfaceStandaloneRoute,
  type PhysicalSurfacesShellContextValue,
} from './physicalSurfacesShared'
import { buildPhysicalSurfacesPath } from './physicalSurfacesRoutes'
import { getHeroImageForUnit } from './physicalSurfacesHeroImages'

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
    }
  }
  const online = summary.units.filter((unit) => unit.status === 'online').length
  const detected = summary.units.filter((unit) => unit.status === 'detected').length
  return {
    online,
    detected,
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
  const heroImage = getHeroImageForUnit(unit.unit_id)

  const handleHeroImageClick = () => {
    if (standaloneRoute) {
      navigate(standaloneRoute)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && standaloneRoute) {
      e.preventDefault()
      navigate(standaloneRoute)
    }
  }

  return (
    <DashboardCard className="physical-surfaces-page__card" key={unit.unit_id}>
      <div className="physical-surfaces-page__card-head dashboard-card__header">
        <div>
          <p className="physical-surfaces-page__eyebrow dashboard-card__eyebrow">{unit.family}</p>
          <h2 className="dashboard-card__title">{unit.display_name}</h2>
        </div>
        <Tag type={statusTagType(unit.status)}>{unit.status}</Tag>
      </div>
      <p className="physical-surfaces-page__body-copy dashboard-card__body-copy">{unit.status_reason}</p>
      <p className="physical-surfaces-page__body-copy dashboard-card__body-copy">
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
      {standaloneRoute && heroImage ? (
        <div
          className="physical-surfaces-page__hero-image-container"
          onClick={handleHeroImageClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          title={`View ${unit.display_name} - ${heroImage.attribution}`}
        >
          <img
            src={heroImage.imagePath}
            alt={heroImage.alt}
            className="physical-surfaces-page__hero-image"
            loading="lazy"
          />
          <div className="physical-surfaces-page__hero-image-overlay">
            <span className="physical-surfaces-page__hero-image-label">View Dedicated Route</span>
          </div>
        </div>
      ) : null}
      <div className="physical-surfaces-page__action-row">
        <Button kind="ghost" size="sm" onClick={() => navigate(buildUnitPath(unit.unit_id))}>
          Open Surface Page
        </Button>
        {standaloneRoute && !heroImage ? (
          <Button kind="secondary" size="sm" onClick={() => navigate(standaloneRoute)}>
            Open Dedicated Route
          </Button>
        ) : null}
      </div>
    </DashboardCard>
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
        actions={
          <div className="physical-surfaces-page__tag-row">
            <Tag type="green">{metrics.online} online</Tag>
            <Tag type="blue">{metrics.detected} detected</Tag>
            <Tag type="blue">{summary?.units.length ?? 0} units</Tag>
          </div>
        }
      />

      {summary?.host_observations.maschinen_mk1_host_note ? (
        <DashboardCard className="physical-surfaces-page__host-note">
          <p className="physical-surfaces-page__eyebrow dashboard-card__eyebrow">Host observation</p>
          <p className="physical-surfaces-page__body-copy dashboard-card__body-copy">{summary.host_observations.maschinen_mk1_host_note}</p>
        </DashboardCard>
      ) : null}

      {(summary?.units ?? []).length ? (
        <div className="physical-surfaces-page__unit-grid">
          {(summary?.units ?? []).map((unit) => (
            <UnitCard key={unit.unit_id} unit={unit} buildUnitPath={buildUnitPath} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="physical-surfaces-page__card"
          align="left"
          compact
          title="No physical surfaces are currently available"
          description="The shared surface inventory did not return any unit records for this workspace."
        />
      )}
    </div>
  )
}

export default PhysicalSurfacesOverviewPage
