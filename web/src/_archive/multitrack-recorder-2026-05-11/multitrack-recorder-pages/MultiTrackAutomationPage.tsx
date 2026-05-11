/**
 * T2503 Set 10 — Automation sub-area page.
 *
 * Ports the DawAutomationView component. Lane creation and point editing
 * land here; Set 7+ adds curve interpolation modes (linear, hold,
 * bezier) and visual lane scrubbing. The Set 4 verb
 * daw.automation.set_point is the only mutation today.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Button,
  Layer,
  NumberInput,
  Stack,
  Tag,
  TextInput,
} from '@carbon/react'
import { Add } from '@carbon/icons-react'

import { dawApi } from '../../../map2/clients/daw'
import { useDawProjectStore } from '../../stores/dawProjectStore'

export function MultiTrackAutomationPage() {
  const lanes = useDawProjectStore((s) => s.automation_lanes)
  const upsertLane = useDawProjectStore((s) => s.upsertAutomationLane)
  const setPoint = useDawProjectStore((s) => s.setAutomationPoint)

  const [pendingTargetKind, setPendingTargetKind] = useState('plugin_param')
  const [pendingTargetId, setPendingTargetId] = useState('track:0:slot:0:param:0')

  const [selectedLaneId, setSelectedLaneId] = useState<number | null>(lanes[0]?.id ?? null)
  const selectedLane = useMemo(
    () => lanes.find((l) => l.id === selectedLaneId) ?? null,
    [lanes, selectedLaneId],
  )

  const [position, setPosition] = useState(0)
  const [value, setValue] = useState(0.5)

  const setPointMutation = useMutation({
    mutationFn: () =>
      selectedLaneId === null
        ? Promise.reject(new Error('no lane'))
        : dawApi.setAutomationPoint(selectedLaneId, position, value),
    onSuccess: () => {
      if (selectedLaneId !== null) {
        setPoint(selectedLaneId, position, value)
      }
    },
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)',
        gap: 12,
        padding: 12,
      }}
    >
      <Layer>
        <div style={{ padding: 12 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Automation lanes</h2>
            <Tag size="sm" type="warm-gray">{lanes.length}</Tag>
          </header>
          <Stack gap={4}>
            <TextInput
              id="multitrack-lane-target-kind"
              labelText="Target kind"
              value={pendingTargetKind}
              onChange={(e) => setPendingTargetKind(e.target.value)}
            />
            <TextInput
              id="multitrack-lane-target-id"
              labelText="Target id"
              placeholder="track:0:slot:0:param:wet"
              value={pendingTargetId}
              onChange={(e) => setPendingTargetId(e.target.value)}
            />
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={() => {
                const lane = upsertLane(pendingTargetKind, pendingTargetId)
                setSelectedLaneId(lane.id)
              }}
              data-testid="daw-add-lane"
            >
              Add lane
            </Button>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {lanes.map((lane) => (
                <li
                  key={lane.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 4,
                    alignItems: 'center',
                    padding: '4px 6px',
                    border: '1px solid var(--cds-border-subtle-01)',
                    marginBottom: 4,
                    background: lane.id === selectedLaneId ? 'var(--cds-layer-selected)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedLaneId(lane.id)}
                  data-testid={`daw-lane-${lane.id}`}
                >
                  <div>
                    <div style={{ fontSize: '0.85rem' }}>{lane.target_kind}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, fontFamily: 'var(--font-mono, monospace)' }}>
                      {lane.target_id}
                    </div>
                  </div>
                  <Tag size="sm" type="blue">{lane.points.length} pt</Tag>
                </li>
              ))}
            </ul>
          </Stack>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 12 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Point editor</h2>
          {!selectedLane ? (
            <p style={{ opacity: 0.6, margin: 0 }}>Select or add a lane to edit points.</p>
          ) : (
            <Stack gap={4}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <NumberInput
                  id="daw-auto-position"
                  label="Position (beats)"
                  min={0}
                  step={0.25}
                  value={position}
                  onChange={(_e, v: any) => setPosition(Number(v.value ?? position))}
                  data-testid="daw-auto-position"
                />
                <NumberInput
                  id="daw-auto-value"
                  label="Value"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value}
                  onChange={(_e, v: any) => setValue(Number(v.value ?? value))}
                  data-testid="daw-auto-value"
                />
                <Button
                  kind="primary"
                  onClick={() => setPointMutation.mutate()}
                  data-testid="daw-auto-set"
                >
                  Set point
                </Button>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {selectedLane.points.map((point, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 4,
                      padding: '4px 6px',
                      borderBottom: '1px solid var(--cds-border-subtle-01)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>beat {point.position_beats.toFixed(2)}</span>
                    <span>val {point.value.toFixed(3)}</span>
                  </li>
                ))}
                {selectedLane.points.length === 0 ? (
                  <li style={{ opacity: 0.6, fontSize: '0.85rem' }}>No points yet.</li>
                ) : null}
              </ul>
            </Stack>
          )}
        </div>
      </Layer>
    </div>
  )
}

export default MultiTrackAutomationPage
