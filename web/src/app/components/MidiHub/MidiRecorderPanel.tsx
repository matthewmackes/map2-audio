import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RecordingFilled, StopFilled } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  DataTable,
  NumberInput,
  OverflowMenu,
  OverflowMenuItem,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

function parseNumberInput(
  event: { imaginaryTarget?: { value?: string | number }; currentTarget?: { value?: string | number } },
  fallback: number,
  min: number,
  max: number,
) {
  const raw = event.imaginaryTarget?.value ?? event.currentTarget?.value ?? fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function MidiRecorderPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [sessionId, setSessionId] = useState('take1')
  const [sessionName, setSessionName] = useState('Take 1')
  const [destinationOverride, setDestinationOverride] = useState('dst')
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [exportBpm, setExportBpm] = useState(120)
  const [ticksPerQuarter, setTicksPerQuarter] = useState(480)

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
          speed: playbackSpeed,
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
    mutationFn: async (id: string) =>
      midiHubApi.exportRecording(
        id,
        {
          bpm: exportBpm,
          ticks_per_quarter: ticksPerQuarter,
        },
        nodeId,
      ),
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
  const rows = useMemo(
    () =>
      sessions.map((session) => ({
        id: session.session_id,
        session_id: session.session_id,
        name: session.name,
        events: String(session.event_count),
        created: session.created_at ? new Date(session.created_at * 1000).toLocaleString() : 'N/A',
      })),
    [sessions],
  )
  const headers = [
    { key: 'name', header: 'Session' },
    { key: 'session_id', header: 'ID' },
    { key: 'events', header: 'Events' },
    { key: 'created', header: 'Created' },
  ]

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
          <Slider
            id="midi-hub-recorder-playback-speed"
            labelText="Playback speed"
            min={0.25}
            max={2}
            step={0.05}
            value={playbackSpeed}
            minLabel="0.25x"
            maxLabel="2.0x"
            hideTextInput={false}
            formatLabel={(value) => `${Number(value).toFixed(2)}x`}
            onChange={({ value }) => setPlaybackSpeed(Number(value ?? 1))}
          />
          <NumberInput
            id="midi-hub-recorder-export-bpm"
            label="Export BPM"
            value={exportBpm}
            min={20}
            max={300}
            step={1}
            hideSteppers={false}
            size="sm"
            onChange={(event) => setExportBpm(parseNumberInput(event, exportBpm, 20, 300))}
          />
          <NumberInput
            id="midi-hub-recorder-ticks-per-quarter"
            label="Export ticks/quarter"
            value={ticksPerQuarter}
            min={24}
            max={1920}
            step={24}
            hideSteppers={false}
            size="sm"
            onChange={(event) => setTicksPerQuarter(parseNumberInput(event, ticksPerQuarter, 24, 1920))}
          />
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-recorder-loop"
            labelText="Loop playback"
            checked={loopPlayback}
            onChange={(_, data) => setLoopPlayback(data.checked)}
          />
          <Button
            size="sm"
            kind="primary"
            renderIcon={RecordingFilled}
            onClick={() => startRecording.mutate()}
            disabled={!sessionId.trim()}
          >
            Start recording
          </Button>
          <Button size="sm" kind="danger--tertiary" renderIcon={StopFilled} onClick={() => stopRecording.mutate()}>
            Stop recording
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getHeaderProps, getRowProps }) => (
            <TableContainer title="Recording sessions">
              <Table size="sm" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const headerProps = getHeaderProps({ header })
                      const { key, ...rest } = headerProps
                      return (
                        <TableHeader key={key ?? header.key} {...rest}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length + 1}>
                        <div className="midi-hub-empty-state">No recordings saved.</div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {rows.map((row) => {
                    const sessionId = String(row.id)
                    const rowProps = getRowProps({ row })
                    const { key, ...rest } = rowProps
                    return (
                      <TableRow key={key ?? row.id} {...rest}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                        <TableCell>
                          <OverflowMenu
                            ariaLabel={`Recording actions for ${sessionId}`}
                            flipped
                            iconDescription={`Recording actions for ${sessionId}`}
                            size="sm"
                          >
                            <OverflowMenuItem itemText="Play" onClick={() => playback.mutate(sessionId)} />
                            <OverflowMenuItem itemText="Stop" onClick={() => stopPlayback.mutate(sessionId)} />
                            <OverflowMenuItem itemText="Export SMF" onClick={() => exportRecording.mutate(sessionId)} />
                            <OverflowMenuItem isDelete itemText="Delete" onClick={() => deleteRecording.mutate(sessionId)} />
                          </OverflowMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </div>
    </div>
  )
}
