import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Tag, TextInput } from '@carbon/react'
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
      midiHubApi.playbackRecording(
        id,
        {
          destination_override: destinationOverride.trim() || undefined,
          loop: loopPlayback,
          speed: 1,
        },
        nodeId,
      ),
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
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={sessions.length > 0 ? 'green' : 'warm-gray'}>{`Sessions ${sessions.length}`}</Tag>
          <Tag type={loopPlayback ? 'blue' : 'cool-gray'}>{loopPlayback ? 'Loop playback' : 'One-shot playback'}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-recorder-session-id"
            labelText="Session ID"
            value={sessionId}
            onChange={(event) => setSessionId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-recorder-session-name"
            labelText="Session name"
            value={sessionName}
            onChange={(event) => setSessionName(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-recorder-destination"
            labelText="Playback destination"
            value={destinationOverride}
            onChange={(event) => setDestinationOverride(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-recorder-loop"
            labelText="Loop playback"
            checked={loopPlayback}
            onChange={(_, data) => setLoopPlayback(data.checked)}
          />
          <Button size="sm" kind="primary" onClick={() => startRecording.mutate()} disabled={!sessionId.trim()}>
            Start recording
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => stopRecording.mutate()}>
            Stop recording
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-record-list">
          {sessions.length === 0 ? <div className="midi-hub-empty-state">No recordings saved.</div> : null}
          {sessions.map((session) => (
            <div key={session.session_id} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{session.name}</strong>
                <div className="midi-hub-record-meta">
                  <code>{session.session_id}</code>
                  {` · events ${session.event_count}`}
                </div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="secondary" onClick={() => playback.mutate(session.session_id)}>
                  Play
                </Button>
                <Button size="sm" kind="ghost" onClick={() => stopPlayback.mutate(session.session_id)}>
                  Stop
                </Button>
                <Button size="sm" kind="ghost" onClick={() => exportRecording.mutate(session.session_id)}>
                  Export SMF
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteRecording.mutate(session.session_id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
