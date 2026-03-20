import { useMemo, useState } from 'react'
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
  TextInput,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

const HEADERS = [
  { key: 'device', header: 'Device' },
  { key: 'drift', header: 'Drift' },
  { key: 'updated', header: 'Updated' },
]

function resolveSeverity(event: Record<string, unknown>): 'red' | 'warm-gray' | 'cool-gray' {
  const drift = event.drift as Record<string, unknown> | undefined
  if (drift && Object.keys(drift).length > 0) return 'red'
  return 'cool-gray'
}

export function DeviceShadowPanel() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [shadowDeviceId, setShadowDeviceId] = useState('usb_din_adapter:lab')
  const [shadowHealth, setShadowHealth] = useState('online')

  const shadowQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'shadow'],
    queryFn: () => midiHubApi.getDeviceShadow(100, nodeId),
    refetchInterval: 3000,
  })

  const refreshShadow = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'shadow'] })

  const upsertShadow = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertDeviceShadow(
        shadowDeviceId.trim(),
        {
          expected_state: {
            connected: true,
            responding: true,
            health: shadowHealth,
          },
          source: 'ui',
        },
        nodeId,
      ),
    onSuccess: async (payload) => {
      pushToast(payload.drift_detected ? 'Shadow drift detected' : 'Shadow state saved', payload.drift_detected ? 'warn' : 'success')
      await refreshShadow()
    },
  })

  const clearShadow = useMutation({
    mutationFn: async () => midiHubApi.clearDeviceShadowEvents(nodeId),
    onSuccess: async () => {
      pushToast('Shadow drift log cleared', 'info')
      await refreshShadow()
    },
  })

  const rows = useMemo(
    () =>
      (shadowQuery.data?.events ?? []).map((event, index) => {
        const drift = (event.drift as Record<string, unknown> | undefined) ?? {}
        return {
          id: `${String(event.device_id ?? 'device')}-${index}`,
          device: String(event.device_id ?? 'Unknown'),
          drift: Object.keys(drift).length > 0 ? JSON.stringify(drift) : 'No drift detail',
          updated: String(event.detected_at ?? event.updated_at ?? 'Unknown'),
          severity: resolveSeverity(event),
        }
      }),
    [shadowQuery.data],
  )
  const severityById = useMemo(
    () =>
      rows.reduce<Record<string, 'red' | 'warm-gray' | 'cool-gray'>>((accumulator, row) => {
        accumulator[row.id] = row.severity
        return accumulator
      }, {}),
    [rows],
  )

  return (
    <div className="midi-hub-lab-panel">
      <div className="midi-hub-lab-panel__toolbar">
        <Tag type={rows.length > 0 ? 'red' : 'cool-gray'}>{`Drift events ${rows.length}`}</Tag>
        <Tag type="warm-gray">{`Tracked devices ${Object.keys(shadowQuery.data?.shadow_state ?? {}).length}`}</Tag>
      </div>

      <div className="midi-hub-form-grid">
        <TextInput id="midi-hub-shadow-device" labelText="Shadow device ID" value={shadowDeviceId} onChange={(event) => setShadowDeviceId(event.currentTarget.value)} />
        <TextInput id="midi-hub-shadow-health" labelText="Expected health" value={shadowHealth} onChange={(event) => setShadowHealth(event.currentTarget.value)} />
      </div>

      <div className="midi-hub-actions">
        <Button size="sm" kind="primary" onClick={() => upsertShadow.mutate()}>
          Sync shadow
        </Button>
        <Button size="sm" kind="ghost" onClick={() => clearShadow.mutate()}>
          Clear drift
        </Button>
      </div>

      <DataTable rows={rows} headers={HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Device shadow drift"
            description="Review mismatches between expected state and observed hardware behavior."
            className="midi-hub-lab-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">Drift severity log</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Device shadow drift">
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
                  <TableHeader>Severity</TableHeader>
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
                        <Tag type={severityById[row.id] ?? 'cool-gray'}>
                          {(severityById[row.id] ?? 'cool-gray') === 'red' ? 'Drift detected' : 'Stable'}
                        </Tag>
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
  )
}
