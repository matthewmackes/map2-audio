import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PauseFilled, PlayFilled, PlayOutlineFilled, Touch_1 } from '@carbon/icons-react'
import { Button, Checkbox, Select, SelectItem, Slider, Tag, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubOverview } from './useMidiHubOverview'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiClockPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { outputPorts: availableOutputPorts } = useMidiHubOverview(nodeId, scopeKey)

  const clockQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'clock'],
    queryFn: () => midiHubApi.getClockStatus(nodeId),
    refetchInterval: 1000,
  })

  const [bpm, setBpm] = useState('120.0')
  const [sourceMode, setSourceMode] = useState<'internal' | 'external'>('internal')
  const [outputPorts, setOutputPorts] = useState<string[]>([])
  const [snapshotSyncEnabled, setSnapshotSyncEnabled] = useState(false)
  const [divider, setDivider] = useState(1)
  const [multiplier, setMultiplier] = useState(1)

  useEffect(() => {
    const data = clockQuery.data
    if (!data) return
    setBpm(String(data.bpm))
    setSourceMode(data.source_mode === 'external' ? 'external' : 'internal')
    setOutputPorts(data.output_ports ?? [])
    setSnapshotSyncEnabled(Boolean(data.snapshot_sync_enabled))
    setDivider(data.divider ?? 1)
    setMultiplier(data.multiplier ?? 1)
  }, [clockQuery.data])

  const invalidateClock = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'clock'] })

  const saveMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.updateClockConfig(
        {
          bpm: Math.max(20, Math.min(300, Number.parseFloat(bpm) || 120)),
          source_mode: sourceMode,
          output_ports: outputPorts,
          snapshot_sync_enabled: snapshotSyncEnabled,
          divider,
          multiplier,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Clock settings updated', 'success')
      void invalidateClock()
    },
    onError: () => pushToast('Failed to update clock settings', 'error'),
  })

  const tapMutation = useMutation({
    mutationFn: async () => midiHubApi.tapClock(nodeId),
    onSuccess: () => {
      pushToast('Tap captured', 'success')
      void invalidateClock()
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => midiHubApi.startClock(nodeId),
    onSuccess: () => {
      pushToast('Clock started', 'success')
      void invalidateClock()
    },
  })

  const continueMutation = useMutation({
    mutationFn: async () => midiHubApi.continueClock(nodeId),
    onSuccess: () => {
      pushToast('Clock continued', 'success')
      void invalidateClock()
    },
  })

  const stopMutation = useMutation({
    mutationFn: async () => midiHubApi.stopClock(nodeId),
    onSuccess: () => {
      pushToast('Clock stopped', 'info')
      void invalidateClock()
    },
  })

  const clock = clockQuery.data
  const detectedBpm = clock?.detected_bpm ? clock.detected_bpm.toFixed(2) : 'N/A'

  const toggleOutputPort = (portId: string) => {
    setOutputPorts((previous) =>
      previous.includes(portId) ? previous.filter((value) => value !== portId) : [...previous, portId],
    )
  }

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={clock?.running ? 'green' : 'warm-gray'}>
            {clock?.running ? 'Running' : 'Stopped'}
          </Tag>
          <Tag type="cool-gray">{`Source ${clock?.source_mode ?? 'internal'}`}</Tag>
          <Tag type={clock?.snapshot_sync_enabled ? 'blue' : 'warm-gray'}>
            {clock?.snapshot_sync_enabled ? 'Snapshot Sync On' : 'Snapshot Sync Off'}
          </Tag>
        </div>

        <div className="midi-hub-stat-grid">
          <div className="midi-hub-stat-tile midi-hub-stat-tile--hero">
            <span className="midi-hub-stat-tile__label">Transport BPM</span>
            <span className="midi-hub-stat-tile__value">{clock?.bpm?.toFixed(2) ?? '120.00'}</span>
            <span className="midi-hub-stat-tile__subvalue">{`Detected ${detectedBpm}`}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Divider</span>
            <span className="midi-hub-stat-tile__value">{clock?.divider ?? 1}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Multiplier</span>
            <span className="midi-hub-stat-tile__value">{clock?.multiplier ?? 1}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Outputs</span>
            <span className="midi-hub-stat-tile__value">{clock?.output_ports?.length ?? 0}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Song position</span>
            <span className="midi-hub-stat-tile__value">{clock?.song_position ?? 0}</span>
          </div>
        </div>

        <div className="midi-hub-actions midi-hub-actions--transport">
          <Button size="sm" kind="primary" renderIcon={PlayFilled} onClick={() => startMutation.mutate()}>
            Start
          </Button>
          <Button size="sm" kind="secondary" renderIcon={PlayOutlineFilled} onClick={() => continueMutation.mutate()}>
            Continue
          </Button>
          <Button size="sm" kind="danger--tertiary" renderIcon={PauseFilled} onClick={() => stopMutation.mutate()}>
            Stop
          </Button>
          <Button size="sm" kind="ghost" renderIcon={Touch_1} onClick={() => tapMutation.mutate()}>
            Tap tempo
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-clock-bpm"
            labelText="BPM"
            value={bpm}
            onChange={(event) => setBpm(event.currentTarget.value)}
          />

          <Select
            id="midi-hub-clock-source"
            labelText="Clock source"
            value={sourceMode}
            onChange={(event) => setSourceMode(event.currentTarget.value === 'external' ? 'external' : 'internal')}
          >
            <SelectItem value="internal" text="Internal" />
            <SelectItem value="external" text="External" />
          </Select>

          <Slider
            id="midi-hub-clock-divider"
            labelText="Clock divider"
            min={1}
            max={16}
            step={1}
            value={divider}
            hideTextInput={false}
            onChange={({ value }) => setDivider(Number(value ?? 1))}
          />

          <Slider
            id="midi-hub-clock-multiplier"
            labelText="Clock multiplier"
            min={1}
            max={8}
            step={1}
            value={multiplier}
            hideTextInput={false}
            onChange={({ value }) => setMultiplier(Number(value ?? 1))}
          />

          <div className="midi-hub-port-picker">
            <span className="midi-hub-port-picker__label">Output ports</span>
            <div className="midi-hub-port-picker__checkboxes">
              {availableOutputPorts.map((port) => {
                const active = outputPorts.includes(port.port_id)
                return (
                  <Checkbox
                    key={port.port_id}
                    id={`midi-hub-clock-port-${port.port_id}`}
                    labelText={`${port.name} (${port.port_id})`}
                    checked={active}
                    onChange={() => toggleOutputPort(port.port_id)}
                  />
                )
              })}
              {availableOutputPorts.length === 0 ? (
                <div className="midi-hub-empty-state">No output ports available.</div>
              ) : null}
            </div>
          </div>

          <Checkbox
            id="midi-hub-clock-snapshot-sync"
            labelText="Auto-sync with snapshot tempo"
            checked={snapshotSyncEnabled}
            onChange={(_, { checked }) => setSnapshotSyncEnabled(Boolean(checked))}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => saveMutation.mutate()}>
            Apply clock
          </Button>
          <Tag type="cool-gray">{`${outputPorts.length} selected`}</Tag>
        </div>
      </div>
    </div>
  )
}
