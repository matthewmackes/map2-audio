import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
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
  Toggle,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

function clampMidiValue(value: string, max: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(max, parsed))
}

export function MidiMacroPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [macroId, setMacroId] = useState('macro_1')
  const [name, setName] = useState('Macro 1')
  const [triggerCc, setTriggerCc] = useState('1')
  const [destination, setDestination] = useState('dst')
  const [value, setValue] = useState('100')
  const [enabled, setEnabled] = useState(true)

  const queryRefresh = process.env.NODE_ENV === 'test' ? false : 3000

  const macrosQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'macros'],
    queryFn: () => midiHubApi.listMacros(nodeId),
    refetchInterval: queryRefresh,
  })

  const saveMacro = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertMacro(
        {
          macro_id: macroId.trim(),
          name: name.trim() || macroId.trim(),
          trigger: { message_type: 'control_change', cc: clampMidiValue(triggerCc, 127) },
          actions: [
            {
              target: destination.trim() || 'dst',
              action: 'send_midi',
              delay_ms: 0,
              params: { message: [0xb0, clampMidiValue(triggerCc, 127), clampMidiValue(value, 127)] },
            },
          ],
          enabled,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Macro saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'macros'] })
    },
    onError: () => pushToast('Macro save failed', 'error'),
  })

  const deleteMacro = useMutation({
    mutationFn: async (id: string) => midiHubApi.deleteMacro(id, nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'macros'] })
    },
  })

  const triggerMacro = useMutation({
    mutationFn: async (id: string) => midiHubApi.triggerMacro(id, { source: 'ui' }, nodeId),
    onSuccess: () => pushToast('Macro triggered', 'info'),
    onError: () => pushToast('Macro trigger failed', 'error'),
  })

  const macros = useMemo(() => macrosQuery.data?.macros ?? [], [macrosQuery.data?.macros])
  const rows = useMemo(
    () =>
      macros.map((macro) => ({
        id: macro.macro_id,
        name: macro.name,
        trigger: JSON.stringify(macro.trigger),
        actions: String(macro.actions.length),
        status: macro.enabled ? 'Enabled' : 'Disabled',
      })),
    [macros],
  )

  return (
    <div className="midi-hub-processing-stack">
      <div className="midi-hub-processing-form-grid">
        <TextInput id="midi-hub-macro-id" labelText="Macro ID" value={macroId} onChange={(event) => setMacroId(event.currentTarget.value)} />
        <TextInput id="midi-hub-macro-name" labelText="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput id="midi-hub-macro-destination" labelText="Destination port" value={destination} onChange={(event) => setDestination(event.currentTarget.value)} />
        <Select id="midi-hub-macro-trigger-cc" labelText="Trigger CC" value={triggerCc} onChange={(event) => setTriggerCc(event.currentTarget.value)}>
          {Array.from({ length: 16 }).map((_, index) => (
            <SelectItem key={index + 1} value={String(index + 1)} text={`CC ${index + 1}`} />
          ))}
        </Select>
        <TextInput id="midi-hub-macro-value" labelText="CC value" value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        <Toggle id="midi-hub-macro-enabled" labelText="Enabled" labelA="Off" labelB="On" toggled={enabled} onToggle={setEnabled} />
      </div>

      <div className="midi-hub-processing-toolbar">
        <Tag type={macros.length > 0 ? 'green' : 'cool-gray'}>{`Macros ${macros.length}`}</Tag>
        <Button size="sm" kind="primary" onClick={() => saveMacro.mutate()} disabled={!macroId.trim()}>
          Save macro
        </Button>
      </div>

      <DataTable rows={rows} headers={[{ key: 'name', header: 'Macro' }, { key: 'trigger', header: 'Trigger' }, { key: 'actions', header: 'Actions' }, { key: 'status', header: 'Status' }]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Macro list"
            description="Trigger macros inline or remove obsolete automation patterns."
            className="midi-hub-processing-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">Inline trigger</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Macro list">
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
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'status') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={String(cell.value) === 'Enabled' ? 'green' : 'cool-gray'}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                      <TableCell>
                        <OverflowMenu
                          ariaLabel={`Macro actions for ${row.id}`}
                          flipped
                          iconDescription={`Macro actions for ${row.id}`}
                          size="sm"
                        >
                          <OverflowMenuItem itemText="Trigger macro" onClick={() => triggerMacro.mutate(row.id)} />
                          <OverflowMenuItem isDelete itemText="Delete" onClick={() => deleteMacro.mutate(row.id)} />
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
  )
}
