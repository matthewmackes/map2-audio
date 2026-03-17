import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, Tag, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiNetworkPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'network-sessions'],
    queryFn: () => midiHubApi.listNetworkSessions(nodeId),
    refetchInterval: 3000,
  })

  const [sessionId, setSessionId] = useState('rtp-1')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('50040')
  const [mode, setMode] = useState<'send' | 'listen'>('send')
  const [oscPort, setOscPort] = useState('58000')
  const [oscAddress, setOscAddress] = useState('/map2/cc1')
  const [oscValue, setOscValue] = useState('0.5')

  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'network-sessions'] })

  const createSession = useMutation({
    mutationFn: async () =>
      midiHubApi.createNetworkSession(
        {
          session_id: sessionId.trim() || `rtp-${Date.now()}`,
          host: host.trim() || '127.0.0.1',
          port: Math.max(1, Math.min(65535, Number.parseInt(port || '50040', 10) || 50040)),
          mode,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Network session created', 'success')
      void refreshSessions()
    },
    onError: () => pushToast('Failed to create network session', 'error'),
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => midiHubApi.deleteNetworkSession(id, nodeId),
    onSuccess: () => {
      pushToast('Network session removed', 'info')
      void refreshSessions()
    },
  })

  const sendTestMidi = useMutation({
    mutationFn: async (id: string) => midiHubApi.sendNetworkMidi(id, [0x90, 60, 100], nodeId),
    onSuccess: (payload) =>
      pushToast(payload.ok ? 'Sent test MIDI note' : 'Session send failed', payload.ok ? 'success' : 'warn'),
  })

  const startOsc = useMutation({
    mutationFn: async () =>
      midiHubApi.startOscServer(Math.max(1, Math.min(65535, Number.parseInt(oscPort || '58000', 10) || 58000)), nodeId),
    onSuccess: () => pushToast('OSC server started', 'success'),
    onError: () => pushToast('Failed to start OSC server', 'error'),
  })

  const stopOsc = useMutation({
    mutationFn: async () => midiHubApi.stopOscServer(nodeId),
    onSuccess: () => pushToast('OSC server stopped', 'info'),
  })

  const sendOsc = useMutation({
    mutationFn: async () =>
      midiHubApi.sendOsc(
        {
          host: host.trim() || '127.0.0.1',
          port: Math.max(1, Math.min(65535, Number.parseInt(oscPort || '58000', 10) || 58000)),
          address: oscAddress.trim() || '/map2/cc1',
          value: Number.parseFloat(oscValue || '0') || 0,
        },
        nodeId,
      ),
    onSuccess: () => pushToast('OSC message sent', 'success'),
    onError: () => pushToast('Failed to send OSC message', 'error'),
  })

  const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data?.sessions])

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={sessions.length > 0 ? 'green' : 'warm-gray'}>{`Sessions ${sessions.length}`}</Tag>
          <Tag type="cool-gray">{mode === 'send' ? 'Initiator' : 'Listener'}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-network-session-id"
            labelText="Session ID"
            value={sessionId}
            onChange={(event) => setSessionId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-network-host"
            labelText="Host"
            value={host}
            onChange={(event) => setHost(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-network-port"
            labelText="Port"
            value={port}
            onChange={(event) => setPort(event.currentTarget.value)}
          />
          <Select
            id="midi-hub-network-mode"
            labelText="Session mode"
            value={mode}
            onChange={(event) => setMode(event.currentTarget.value === 'listen' ? 'listen' : 'send')}
          >
            <SelectItem value="send" text="Send" />
            <SelectItem value="listen" text="Listen" />
          </Select>
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => createSession.mutate()}>
            Create session
          </Button>
          <Button size="sm" kind="ghost" onClick={() => void refreshSessions()}>
            Refresh
          </Button>
        </div>

        <div className="midi-hub-record-list">
          {sessions.length === 0 ? <div className="midi-hub-empty-state">No network sessions configured.</div> : null}
          {sessions.map((session) => (
            <div key={session.session_id} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{session.session_id}</strong>
                <div className="midi-hub-record-meta">
                  <code>{`${session.host}:${session.port}`}</code>
                  {` · ${session.mode} · latency ${session.latency_ms?.toFixed?.(2) ?? 'N/A'} ms`}
                </div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="secondary" onClick={() => sendTestMidi.mutate(session.session_id)}>
                  Send test note
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteSession.mutate(session.session_id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type="cool-gray">OSC bridge</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-osc-port"
            labelText="OSC port"
            value={oscPort}
            onChange={(event) => setOscPort(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-osc-address"
            labelText="OSC address"
            value={oscAddress}
            onChange={(event) => setOscAddress(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-osc-value"
            labelText="Value"
            value={oscValue}
            onChange={(event) => setOscValue(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => startOsc.mutate()}>
            Start OSC
          </Button>
          <Button size="sm" kind="secondary" onClick={() => sendOsc.mutate()}>
            Send OSC
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => stopOsc.mutate()}>
            Stop OSC
          </Button>
        </div>
      </div>
    </div>
  )
}
