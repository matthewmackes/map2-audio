import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

const SESSION_HEADERS = [
  { key: 'session', header: 'Session' },
  { key: 'endpoint', header: 'Endpoint' },
  { key: 'metrics', header: 'Metrics' },
]

const OSC_NAMESPACE = [
  '/map2/transport/bpm',
  '/map2/transport/song_position',
  '/map2/presets/recall',
  '/map2/macros/trigger',
  '/map2/gpio/input/1',
  '/map2/gpio/output/1',
  '/map2/tesira/Level1/level',
]

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
  const [oscMappings, setOscMappings] = useState(JSON.stringify([
    { address: '/map2/presets/recall', destination_port: 'dst', message_type: 'program_change', channel: 1 },
  ], null, 2))

  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'network-sessions'] })
  const refreshOscMappings = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'osc-mappings'] })

  const oscMappingsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'osc-mappings'],
    queryFn: () => midiHubApi.listOscMappings(nodeId),
  })

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

  const setMappings = useMutation({
    mutationFn: async () => {
      const mappings = JSON.parse(oscMappings) as Array<Record<string, unknown>>
      return midiHubApi.setOscMappings(mappings, nodeId)
    },
    onSuccess: async () => {
      pushToast('OSC namespace saved', 'success')
      await refreshOscMappings()
    },
    onError: () => pushToast('OSC namespace update failed', 'error'),
  })

  const sessions = (sessionsQuery.data?.sessions ?? []).map((session) => ({
    id: session.session_id,
    session: `${session.session_id} · ${session.mode}`,
    endpoint: `${session.host}:${session.port}`,
    metrics: `Latency ${session.latency_ms?.toFixed?.(2) ?? 'N/A'} ms · Jitter ${session.jitter_ms?.toFixed?.(2) ?? 'N/A'} ms`,
  }))

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-toolbar">
          <Tag type={sessions.length > 0 ? 'green' : 'warm-gray'}>{`Sessions ${sessions.length}`}</Tag>
          <Tag type="cool-gray">{mode === 'send' ? 'Initiator' : 'Listener'}</Tag>
          <Tag type="blue">RTP-MIDI</Tag>
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
          <TextInput id="midi-hub-network-mode" labelText="Session mode" value={mode} onChange={(event) => setMode(event.currentTarget.value === 'listen' ? 'listen' : 'send')} />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => createSession.mutate()}>
            Create session
          </Button>
          <Button size="sm" kind="ghost" onClick={() => void refreshSessions()}>
            Refresh
          </Button>
        </div>
      </div>

      <DataTable rows={sessions} headers={SESSION_HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="RTP-MIDI sessions"
            description="Provision remote endpoints, then test payload flow and remove stale sessions from one table."
            className="midi-hub-network-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">{`Latency refresh ${(sessionsQuery.data?.count ?? 0) > 0 ? 'Live' : 'Idle'}`}</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="RTP-MIDI sessions">
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _key, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      ))}
                      <TableCell>
                        <div className="midi-hub-record-actions">
                          <Button size="sm" kind="ghost" onClick={() => sendTestMidi.mutate(row.id)}>
                            Test
                          </Button>
                          <Button size="sm" kind="ghost" onClick={() => deleteSession.mutate(row.id)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-toolbar">
          <Tag type="cool-gray">OSC bridge</Tag>
          <Tag type="blue">/map2/* namespace</Tag>
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
        <TextArea id="midi-hub-osc-mappings" labelText="OSC namespace mappings" rows={6} value={oscMappings} onChange={(event) => setOscMappings(event.currentTarget.value)} />
        <div className="midi-hub-actions">
          <Button size="sm" kind="ghost" onClick={() => setMappings.mutate()}>
            Save namespace
          </Button>
        </div>
        <div className="midi-hub-network-namespace">
          {OSC_NAMESPACE.map((entry) => (
            <Tag key={entry} type="cool-gray">
              {entry}
            </Tag>
          ))}
        </div>
        <pre className="midi-hub-code-block">{JSON.stringify(oscMappingsQuery.data?.mappings ?? [], null, 2)}</pre>
      </div>
    </div>
  )
}
