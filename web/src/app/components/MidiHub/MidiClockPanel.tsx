import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, Tag, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiClockPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()

  const clockQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'clock'],
    queryFn: () => midiHubApi.getClockStatus(nodeId),
    refetchInterval: 1000,
  })

  const [bpm, setBpm] = useState('120.0')
  const [sourceMode, setSourceMode] = useState<'internal' | 'external'>('internal')
  const [outputPorts, setOutputPorts] = useState('')

  useEffect(() => {
    const data = clockQuery.data
    if (!data) return
    setBpm(String(data.bpm))
    setSourceMode(data.source_mode === 'external' ? 'external' : 'internal')
    setOutputPorts((data.output_ports ?? []).join(', '))
  }, [clockQuery.data])

  const invalidateClock = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'clock'] })

  const saveMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.updateClockConfig(
        {
          bpm: Math.max(20, Math.min(300, Number.parseFloat(bpm) || 120)),
          source_mode: sourceMode,
          output_ports: outputPorts
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
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

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={clock?.running ? 'green' : 'warm-gray'}>
            {clock?.running ? 'Running' : 'Stopped'}
          </Tag>
          <Tag type="cool-gray">{`Source ${clock?.source_mode ?? 'internal'}`}</Tag>
        </div>

        <div className="midi-hub-stat-grid">
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Configured BPM</span>
            <strong className="midi-hub-stat-tile__value">{clock?.bpm?.toFixed(2) ?? '120.00'}</strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Detected BPM</span>
            <strong className="midi-hub-stat-tile__value">
              {clock?.detected_bpm ? clock.detected_bpm.toFixed(2) : 'N/A'}
            </strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Song position</span>
            <strong className="midi-hub-stat-tile__value">{clock?.song_position ?? 0}</strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Outputs</span>
            <strong className="midi-hub-stat-tile__value">{clock?.output_ports?.length ?? 0}</strong>
          </div>
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

          <TextInput
            id="midi-hub-clock-outputs"
            labelText="Output ports"
            value={outputPorts}
            onChange={(event) => setOutputPorts(event.currentTarget.value)}
            placeholder="dst, monitor, looper"
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => saveMutation.mutate()}>
            Apply clock
          </Button>
          <Button size="sm" kind="secondary" onClick={() => tapMutation.mutate()}>
            Tap
          </Button>
          <Button size="sm" kind="ghost" onClick={() => startMutation.mutate()}>
            Start
          </Button>
          <Button size="sm" kind="ghost" onClick={() => continueMutation.mutate()}>
            Continue
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => stopMutation.mutate()}>
            Stop
          </Button>
        </div>
      </div>
    </div>
  )
}
