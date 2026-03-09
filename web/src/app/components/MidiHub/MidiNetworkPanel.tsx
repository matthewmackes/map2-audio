import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, MenuItem, Select, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useToasts } from '../Toasts'

export function MidiNetworkPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', 'network-sessions'],
    queryFn: midiHubApi.listNetworkSessions,
    refetchInterval: 3000,
  })

  const [sessionId, setSessionId] = useState('rtp-1')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('50040')
  const [mode, setMode] = useState<'send' | 'listen'>('send')

  const [oscPort, setOscPort] = useState('58000')
  const [oscAddress, setOscAddress] = useState('/map2/cc1')
  const [oscValue, setOscValue] = useState('0.5')

  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', 'network-sessions'] })

  const createSession = useMutation({
    mutationFn: async () =>
      midiHubApi.createNetworkSession({
        session_id: sessionId.trim() || `rtp-${Date.now()}`,
        host: host.trim() || '127.0.0.1',
        port: Math.max(1, Math.min(65535, Number.parseInt(port || '50040', 10) || 50040)),
        mode,
      }),
    onSuccess: () => {
      pushToast('Network session created', 'success')
      void refreshSessions()
    },
    onError: () => pushToast('Failed to create network session', 'error'),
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => midiHubApi.deleteNetworkSession(id),
    onSuccess: () => {
      pushToast('Network session removed', 'info')
      void refreshSessions()
    },
  })

  const sendTestMidi = useMutation({
    mutationFn: async (id: string) => midiHubApi.sendNetworkMidi(id, [0x90, 60, 100]),
    onSuccess: (payload) => pushToast(payload.ok ? 'Sent test MIDI note' : 'Session send failed', payload.ok ? 'success' : 'warn'),
  })

  const startOsc = useMutation({
    mutationFn: async () => midiHubApi.startOscServer(Math.max(1, Math.min(65535, Number.parseInt(oscPort || '58000', 10) || 58000))),
    onSuccess: () => pushToast('OSC server started', 'success'),
    onError: () => pushToast('Failed to start OSC server', 'error'),
  })

  const stopOsc = useMutation({
    mutationFn: async () => midiHubApi.stopOscServer(),
    onSuccess: () => pushToast('OSC server stopped', 'info'),
  })

  const sendOsc = useMutation({
    mutationFn: async () =>
      midiHubApi.sendOsc({
        host: host.trim() || '127.0.0.1',
        port: Math.max(1, Math.min(65535, Number.parseInt(oscPort || '58000', 10) || 58000)),
        address: oscAddress.trim() || '/map2/cc1',
        value: Number.parseFloat(oscValue || '0') || 0,
      }),
    onSuccess: () => pushToast('OSC message sent', 'success'),
    onError: () => pushToast('Failed to send OSC message', 'error'),
  })

  const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data?.sessions])

  return (
    <div className="grid two" style={{ gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>RTP/UDP MIDI Sessions</h4>
        <div className="stack" style={{ gap: 8 }}>
          <TextField size="small" label="Session ID" value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
          <TextField size="small" label="Host" value={host} onChange={(event) => setHost(event.target.value)} />
          <TextField size="small" label="Port" value={port} onChange={(event) => setPort(event.target.value)} />
          <Select size="small" value={mode} onChange={(event) => setMode(event.target.value === 'listen' ? 'listen' : 'send')}>
            <MenuItem value="send">Send</MenuItem>
            <MenuItem value="listen">Listen</MenuItem>
          </Select>
          <Button size="small" variant="contained" onClick={() => createSession.mutate()}>Create Session</Button>

          {sessions.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No network sessions configured.</div>
          ) : (
            sessions.map((session) => (
              <div key={session.session_id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <div><strong>{session.session_id}</strong> ({session.mode})</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {session.host}:{session.port} · latency {session.latency_ms?.toFixed?.(2) ?? 'N/A'} ms
                  </div>
                </div>
                <div className="flex" style={{ gap: 6 }}>
                  <Button size="small" onClick={() => sendTestMidi.mutate(session.session_id)}>Test</Button>
                  <Button size="small" color="error" onClick={() => deleteSession.mutate(session.session_id)}>Delete</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>OSC Bridge</h4>
        <div className="stack" style={{ gap: 8 }}>
          <TextField size="small" label="OSC Port" value={oscPort} onChange={(event) => setOscPort(event.target.value)} />
          <TextField size="small" label="OSC Address" value={oscAddress} onChange={(event) => setOscAddress(event.target.value)} />
          <TextField size="small" label="Value" value={oscValue} onChange={(event) => setOscValue(event.target.value)} />

          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={() => startOsc.mutate()}>Start OSC</Button>
            <Button size="small" variant="outlined" color="warning" onClick={() => stopOsc.mutate()}>Stop OSC</Button>
            <Button size="small" variant="outlined" onClick={() => sendOsc.mutate()}>Send OSC</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
