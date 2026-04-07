import { Button, Loading, Tag, Tile } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PageHeader } from '../components/PageHeader'
import { enrichedPhysicalSurfacesApi } from '../../map2/clients/enrichedPhysicalSurfaces'
import type { EnrichedPhysicalSurfaceMatch } from '../../map2/types'
import type { PhysicalSurfacesShellContextValue } from './PhysicalSurfacesShell'

function statusTagType(status: string | undefined): 'green' | 'blue' | 'red' | 'cool-gray' {
  if (status === 'online') return 'green'
  if (status === 'detected') return 'blue'
  if (status === 'attention') return 'red'
  return 'cool-gray'
}

function matchLabel(match: EnrichedPhysicalSurfaceMatch) {
  const parts = [
    match.product,
    match.manufacturer,
    match.alsa_id,
    match.vendor_id && match.product_id ? `${match.vendor_id}:${match.product_id}` : null,
  ].filter(Boolean)
  return parts.join(' • ') || 'Unnamed match'
}

export function PhysicalSurfaceUnitPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { surfaceId } = useParams<{ surfaceId: string }>()
  const { summary, isLoading } = useOutletContext<PhysicalSurfacesShellContextValue>()

  const unit = useMemo(
    () => summary?.units.find((item) => item.unit_id === surfaceId) ?? null,
    [summary, surfaceId],
  )

  const setViewMutation = useMutation({
    mutationFn: async (viewId: string | null) => {
      if (!surfaceId) return null
      return enrichedPhysicalSurfacesApi.setUnitView(surfaceId, viewId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enriched-physical-surfaces', 'summary'] })
    },
  })

  if (isLoading && !unit) {
    return (
      <div className="physical-surfaces-page physical-surfaces-page--loading">
        <Loading active withOverlay={false} description="Loading physical surface" />
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="physical-surfaces-page">
        <PageHeader
          title="Physical Surface Not Found"
          subtitle="The requested unit is not present in the shared stack summary."
        />
      </div>
    )
  }

  return (
    <div className="physical-surfaces-page">
      <PageHeader
        title={unit.display_name}
        subtitle="Shared physical-surface detail page inside Enriched_MIDI_Physical_Surfaces."
        actions={<Tag type={statusTagType(unit.status)}>{unit.status}</Tag>}
      />

      <div className="physical-surfaces-page__metrics">
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Status</p>
          <h2>{unit.status}</h2>
          <p className="physical-surfaces-page__body-copy">{unit.status_reason}</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Host Detection</p>
          <h2>{unit.host_detected ? 'Yes' : 'No'}</h2>
          <p className="physical-surfaces-page__body-copy">USB and kernel sound/MIDI probes are both considered when resolving device-family presence.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Capabilities</p>
          <h2>{unit.capabilities.length}</h2>
          <p className="physical-surfaces-page__body-copy">Declared capabilities currently modeled for this device family in the shared stack.</p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Specialized Route</p>
          <h2>{unit.specialized_route ? 'Present' : 'Unified only'}</h2>
          <p className="physical-surfaces-page__body-copy">
            {unit.specialized_route
              ? `An existing dedicated route is available at ${unit.specialized_route}.`
              : 'This family currently lives only inside the new shared shell.'}
          </p>
        </Tile>
        <Tile className="physical-surfaces-page__metric-card">
          <p className="physical-surfaces-page__eyebrow">Current View</p>
          <h2>{unit.view_state.current_view_label}</h2>
          <p className="physical-surfaces-page__body-copy">
            Source: {unit.view_state.current_view_source}
            {unit.view_state.is_override_active ? ' • operator override active' : ''}
          </p>
        </Tile>
      </div>

      <div className="physical-surfaces-page__dual-grid">
        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Transport layers</p>
              <h2>Integration posture</h2>
            </div>
          </div>
          <ul className="physical-surfaces-page__detail-list">
            {unit.transport_layers.map((layer) => (
              <li key={layer.layer_id}>
                <div>
                  <strong>{layer.label}</strong>
                  <p>{layer.detail}</p>
                </div>
                <Tag type={statusTagType(layer.status)}>{layer.status}</Tag>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Firmware posture</p>
              <h2>Operational guidance</h2>
            </div>
            <Tag type="cool-gray">{unit.firmware_posture.status}</Tag>
          </div>
          <p className="physical-surfaces-page__body-copy">{unit.firmware_posture.detail}</p>
          <div className="physical-surfaces-page__action-row">
            {unit.specialized_route ? (
              <Button kind="secondary" size="sm" onClick={() => navigate(unit.specialized_route ?? `/physical-surfaces/${unit.unit_id}`)}>
                Open Existing Route
              </Button>
            ) : null}
            <Button kind="ghost" size="sm" onClick={() => navigate('/physical-surfaces')}>
              Back to Overview
            </Button>
          </div>
        </Tile>
      </div>

      <div className="physical-surfaces-page__dual-grid">
        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Fixed views</p>
              <h2>Per-family page model</h2>
            </div>
            <Tag type="blue">{unit.view_state.page_layout_mode}</Tag>
          </div>
          <p className="physical-surfaces-page__body-copy">
            View sync: {unit.view_state.view_sync}. Follow policy: {unit.view_state.target_follow_policy}.
          </p>
          <div className="physical-surfaces-page__action-row">
            <Button
              kind="ghost"
              size="sm"
              disabled={setViewMutation.isPending}
              onClick={() => setViewMutation.mutate(null)}
            >
              Follow Runtime
            </Button>
          </div>
          <ul className="physical-surfaces-page__view-list">
            {unit.view_state.views.map((view) => (
              <li key={view.view_id} className="physical-surfaces-page__view-item">
                <div className="physical-surfaces-page__card-head">
                  <div>
                    <strong>{view.label}</strong>
                    <p className="physical-surfaces-page__body-copy">{view.note ?? 'No additional note.'}</p>
                  </div>
                  <Tag type={view.view_id === unit.view_state.current_view_id ? 'green' : 'cool-gray'}>
                    {view.view_id === unit.view_state.current_view_id ? 'current' : view.category}
                  </Tag>
                </div>
                <div className="physical-surfaces-page__tag-row">
                  {Object.entries(view.presentation ?? {}).map(([key, value]) => (
                    <Tag key={`${view.view_id}-${key}`} type="cool-gray">
                      {key}: {value}
                    </Tag>
                  ))}
                </div>
                <div className="physical-surfaces-page__action-row">
                  <Button
                    kind={view.view_id === unit.view_state.current_view_id ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={setViewMutation.isPending}
                    onClick={() => setViewMutation.mutate(view.view_id)}
                  >
                    {view.view_id === unit.view_state.current_view_id ? 'Current View' : 'Use View'}
                  </Button>
                </div>
                <div className="physical-surfaces-page__zone-grid">
                  {view.zones.map((zone) => (
                    <div key={`${view.view_id}-${zone.zone_id}`} className="physical-surfaces-page__zone-card">
                      <p className="physical-surfaces-page__eyebrow">{zone.label}</p>
                      <strong>{zone.role}</strong>
                      <p className="physical-surfaces-page__body-copy">{zone.controls.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Surface lab</p>
              <h2>Advanced tooling</h2>
            </div>
            <Tag type={unit.surface_lab.enabled ? 'green' : 'cool-gray'}>{unit.surface_lab.access}</Tag>
          </div>
          <p className="physical-surfaces-page__body-copy">
            Integrated per-device lab for diagnostics, mapping, capture/replay, and firmware operations.
          </p>
          <div className="physical-surfaces-page__tag-row">
            {unit.surface_lab.features.map((feature) => (
              <Tag key={feature} type="cool-gray">
                {feature}
              </Tag>
            ))}
          </div>
          {unit.surface_lab.snapshot ? (
            <pre className="physical-surfaces-page__pre">{JSON.stringify(unit.surface_lab.snapshot, null, 2)}</pre>
          ) : null}
        </Tile>
      </div>

      <div className="physical-surfaces-page__dual-grid">
        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Recent target</p>
              <h2>Auto-follow context</h2>
            </div>
            <Tag type={unit.view_state.recent_target ? 'green' : 'cool-gray'}>
              {unit.view_state.recent_target ? unit.view_state.recent_target.kind : 'none'}
            </Tag>
          </div>
          <p className="physical-surfaces-page__body-copy">
            {unit.view_state.recent_target
              ? `${unit.view_state.recent_target.label} via ${unit.view_state.recent_target.source}`
              : 'No current recent target is tracked for this surface.'}
          </p>
        </Tile>
      </div>

      <div className="physical-surfaces-page__dual-grid">
        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Capabilities</p>
              <h2>Family scope</h2>
            </div>
          </div>
          <div className="physical-surfaces-page__tag-row">
            {unit.capabilities.map((capability) => (
              <Tag key={capability} type="cool-gray">
                {capability}
              </Tag>
            ))}
          </div>
          <ul className="physical-surfaces-page__note-list">
            {unit.integration_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Tile>

        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Runtime service state</p>
              <h2>Current backend context</h2>
            </div>
          </div>
          <pre className="physical-surfaces-page__pre">{JSON.stringify(unit.service_state, null, 2)}</pre>
        </Tile>
      </div>

      <div className="physical-surfaces-page__dual-grid">
        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Matched USB devices</p>
              <h2>USB probe</h2>
            </div>
          </div>
          <ul className="physical-surfaces-page__match-list">
            {unit.matched_usb_devices.length ? unit.matched_usb_devices.map((match, index) => (
              <li key={`${unit.unit_id}-usb-${index}`}>{matchLabel(match)}</li>
            )) : <li>No matching USB devices were visible during the summary probe.</li>}
          </ul>
        </Tile>

        <Tile className="physical-surfaces-page__card">
          <div className="physical-surfaces-page__card-head">
            <div>
              <p className="physical-surfaces-page__eyebrow">Matched sound cards</p>
              <h2>Kernel sound/MIDI probe</h2>
            </div>
          </div>
          <ul className="physical-surfaces-page__match-list">
            {unit.matched_sound_cards.length ? unit.matched_sound_cards.map((match, index) => (
              <li key={`${unit.unit_id}-snd-${index}`}>{matchLabel(match)}</li>
            )) : <li>No matching sound-card or procfs MIDI path was visible during the summary probe.</li>}
          </ul>
        </Tile>
      </div>
    </div>
  )
}

export default PhysicalSurfaceUnitPage
