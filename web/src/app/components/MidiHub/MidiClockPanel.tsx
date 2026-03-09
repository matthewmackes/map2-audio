import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, MenuItem, Select, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useToasts } from '../Toasts'

export function MidiClockPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const clockQuery = useQuery({
    queryKey: ['midi-hub', 'clock'],
    queryFn: midiHubApi.getClockStatus,
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

  const invalidateClock = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', 'clock'] })

  const saveMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.updateClockConfig({
        bpm: Math.max(20, Math.min(300, Number.parseFloat(bpm) || 120)),
        source_mode: sourceMode,
        output_ports: outputPorts
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      pushToast('Clock settings updated', 'success')
      void invalidateClock()
    },
    onError: () => pushToast('Failed to update clock settings', 'error'),
  })

  const tapMutation = useMutation({
    mutationFn: async () => midiHubApi.tapClock(),
    onSuccess: () => {
      pushToast('Tap captured', 'success')
      void invalidateClock()
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => midiHubApi.startClock(),
    onSuccess: () => {
      pushToast('Clock started', 'success')
      void invalidateClock()
    },
  })

  const continueMutation = useMutation({
    mutationFn: async () => midiHubApi.continueClock(),
    onSuccess: () => {
      pushToast('Clock continued', 'success')
      void invalidateClock()
    },
  })

  const stopMutation = useMutation({
    mutationFn: async () => midiHubApi.stopClock(),
    onSuccess: () => {
      pushToast('Clock stopped', 'info')
      void invalidateClock()
    },
  })

  const clock = clockQuery.data

  return (
    <div className="grid two" style={{ gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Clock Status</h4>
        <div className="stack" style={{ gap: 8 }}>
          <div className="list-item">Running: <strong>{clock?.running ? 'Yes' : 'No'}</strong></div>
          <div className="list-item">Configured BPM: <strong>{clock?.bpm?.toFixed(2) ?? '120.00'}</strong></div>
          <div className="list-item">Detected BPM: <strong>{clock?.detected_bpm ? clock.detected_bpm.toFixed(2) : 'N/A'}</strong></div>
          <div className="list-item">Song Position: <strong>{clock?.song_position ?? 0}</strong></div>
          <div className="list-item">Source Mode: <strong>{clock?.source_mode ?? 'internal'}</strong></div>
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Clock Controls</h4>
        <div className="stack" style={{ gap: 8 }}>
          <TextField
            size="small"
            label="BPM"
            value={bpm}
            onChange={(event) => setBpm(event.target.value)}
            style={{ maxWidth: 180 }}
          />
          <Select
            size="small"
            value={sourceMode}
            onChange={(event) => setSourceMode(event.target.value === 'external' ? 'external' : 'internal')}
            style={{ maxWidth: 220 }}
          >
            <MenuItem value="internal">Internal</MenuItem>
            <MenuItem value="external">External</MenuItem>
          </Select>
          <TextField
            size="small"
            label="Output Ports (comma-separated)"
            value={outputPorts}
            onChange={(event) => setOutputPorts(event.target.value)}
            placeholder="dst, monitor, looper"
          />

          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button size="small" variant="contained" onClick={() => saveMutation.mutate()}>Save</Button>
            <Button size="small" variant="outlined" onClick={() => tapMutation.mutate()}>Tap</Button>
            <Button size="small" variant="outlined" color="success" onClick={() => startMutation.mutate()}>Start</Button>
            <Button size="small" variant="outlined" color="warning" onClick={() => continueMutation.mutate()}>Continue</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => stopMutation.mutate()}>Stop</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
