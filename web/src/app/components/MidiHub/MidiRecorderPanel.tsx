import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, FormControlLabel, Switch, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiRecorderPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [sessionId, setSessionId] = useState('take1')
  const [sessionName, setSessionName] = useState('Take 1')
  const [destinationOverride, setDestinationOverride] = useState('dst')
  const [loopPlayback, setLoopPlayback] = useState(false)

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'recorder', 'sessions'],
    queryFn: () => midiHubApi.listRecordingSessions(nodeId),
    refetchInterval: 2000,
  })

  const startRecording = useMutation({
    mutationFn: async () => midiHubApi.startRecording({ session_id: sessionId.trim(), name: sessionName.trim() }, nodeId),
    onSuccess: () => {
      pushToast('Recording started', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'recorder'] })
    },
    onError: () => pushToast('Recording start failed', 'error'),
  })

  const stopRecording = useMutation({
    mutationFn: () => midiHubApi.stopRecording(nodeId),
    onSuccess: () => {
      pushToast('Recording stopped', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'recorder'] })
    },
  })

  const playback = useMutation({
    mutationFn: async (id: string) =>
      midiHubApi.playbackRecording(id, {
        destination_override: destinationOverride.trim() || undefined,
        loop: loopPlayback,
        speed: 1,
      }, nodeId),
    onSuccess: () => pushToast('Playback started', 'info'),
    onError: () => pushToast('Playback failed', 'error'),
  })

  const stopPlayback = useMutation({
    mutationFn: async (id: string) => midiHubApi.stopRecordingPlayback(id, nodeId),
    onSuccess: () => pushToast('Playback stopped', 'info'),
  })

  const exportRecording = useMutation({
    mutationFn: async (id: string) => midiHubApi.exportRecording(id, undefined, nodeId),
    onSuccess: (payload) => pushToast(`SMF exported: ${payload.path}`, 'success'),
    onError: () => pushToast('Export failed', 'error'),
  })

  const deleteRecording = useMutation({
    mutationFn: async (id: string) => midiHubApi.deleteRecording(id, nodeId),
    onSuccess: () => {
      pushToast('Recording deleted', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'recorder'] })
    },
  })

  const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data?.sessions])

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid grid-4" style={{ gap: 10 }}>
        <TextField label="Session ID" size="small" value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
        <TextField label="Name" size="small" value={sessionName} onChange={(event) => setSessionName(event.target.value)} />
        <TextField
          label="Playback Destination"
          size="small"
          value={destinationOverride}
          onChange={(event) => setDestinationOverride(event.target.value)}
        />
        <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
          <FormControlLabel
            control={<Switch checked={loopPlayback} onChange={(event) => setLoopPlayback(event.target.checked)} />}
            label="Loop"
          />
          <Button size="small" variant="contained" onClick={() => startRecording.mutate()} disabled={!sessionId.trim()}>
            Start
          </Button>
          <Button size="small" variant="outlined" onClick={() => stopRecording.mutate()}>
            Stop
          </Button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {sessions.length === 0 ? <p className="subtitle">No recordings yet.</p> : null}
        {sessions.map((session) => (
          <div key={session.session_id} className="card" style={{ padding: 12 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <strong>{session.name}</strong> <code>{session.session_id}</code>
                <div className="subtitle">Events: {session.event_count}</div>
              </div>
              <div className="flex" style={{ gap: 8 }}>
                <Button size="small" variant="outlined" onClick={() => playback.mutate(session.session_id)}>
                  Play
                </Button>
                <Button size="small" variant="outlined" onClick={() => stopPlayback.mutate(session.session_id)}>
                  Stop
                </Button>
                <Button size="small" variant="outlined" onClick={() => exportRecording.mutate(session.session_id)}>
                  Export SMF
                </Button>
                <Button size="small" color="error" onClick={() => deleteRecording.mutate(session.session_id)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
