import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CodeSnippet,
  DataTable,
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
  TextArea,
  TextInput,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { MidiHubSurface } from './MidiHubHelpPrimitives'

function sanitizeScriptId(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return normalized || `script-${Date.now()}`
}

export function MidiScriptEditor() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()

  const [selectedScriptId, setSelectedScriptId] = useState('')
  const [selectedExampleId, setSelectedExampleId] = useState('')
  const [scriptId, setScriptId] = useState('')
  const [scriptName, setScriptName] = useState('')
  const [scriptCode, setScriptCode] = useState('def main(event):\n    log.info("hello from MAP2")\n')
  const [eventJson, setEventJson] = useState('{"source": "manual"}')

  const queryRefresh = process.env.NODE_ENV === 'test' ? false : 3000
  const consoleRefresh = process.env.NODE_ENV === 'test' ? false : 1500

  const scriptsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'scripts'],
    queryFn: () => midiHubApi.listScripts(nodeId),
    refetchInterval: queryRefresh,
  })

  const examplesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'script-examples'],
    queryFn: () => midiHubApi.getScriptExamples(nodeId),
  })

  const consoleQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'script-console', selectedScriptId],
    queryFn: () => midiHubApi.getScriptConsole(selectedScriptId, 200, nodeId),
    enabled: Boolean(selectedScriptId),
    refetchInterval: selectedScriptId ? consoleRefresh : false,
  })

  const selectedScript = useMemo(
    () => (scriptsQuery.data?.scripts ?? []).find((script) => script.script_id === selectedScriptId) ?? null,
    [scriptsQuery.data?.scripts, selectedScriptId],
  )

  useEffect(() => {
    if (!selectedScript) return
    setScriptId(selectedScript.script_id)
    setScriptName(selectedScript.name)
    setScriptCode(selectedScript.code)
  }, [selectedScript])

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'scripts'] }),
      queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'script-console'] }),
    ])
  }

  const upsertMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertScript(
        {
          script_id: sanitizeScriptId(scriptId || scriptName),
          name: scriptName || sanitizeScriptId(scriptId || 'midi-script'),
          code: scriptCode,
          enabled: true,
        },
        nodeId,
      ),
    onSuccess: async (payload) => {
      pushToast('Script saved', 'success')
      setSelectedScriptId(payload.script.script_id)
      await refreshAll()
    },
    onError: () => pushToast('Failed to save script', 'error'),
  })

  const runMutation = useMutation({
    mutationFn: async () => {
      const parsed = eventJson.trim() ? JSON.parse(eventJson) : {}
      return midiHubApi.runScript(selectedScriptId, parsed, nodeId)
    },
    onSuccess: (payload) => {
      if (payload.ok) pushToast('Script run completed', 'success')
      else pushToast(`Script run failed: ${payload.error ?? 'Unknown error'}`, 'error')
      void refreshAll()
    },
    onError: () => pushToast('Script run failed', 'error'),
  })

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const parsed = eventJson.trim() ? JSON.parse(eventJson) : {}
      return midiHubApi.triggerScript(selectedScriptId, parsed, nodeId)
    },
    onSuccess: () => {
      pushToast('Script triggered', 'success')
      void refreshAll()
    },
    onError: () => pushToast('Script trigger failed', 'error'),
  })

  const stopMutation = useMutation({
    mutationFn: async () => midiHubApi.stopScript(selectedScriptId, nodeId),
    onSuccess: () => {
      pushToast('Script timers stopped', 'info')
      void refreshAll()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScript) return null
      return selectedScript.enabled
        ? midiHubApi.disableScript(selectedScript.script_id, nodeId)
        : midiHubApi.enableScript(selectedScript.script_id, nodeId)
    },
    onSuccess: () => {
      pushToast('Script state updated', 'success')
      void refreshAll()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => midiHubApi.deleteScript(selectedScriptId, nodeId),
    onSuccess: async () => {
      pushToast('Script deleted', 'info')
      setSelectedScriptId('')
      await refreshAll()
    },
  })

  const applyExample = (scriptIdValue: string) => {
    const example = (examplesQuery.data?.examples ?? []).find((item) => item.script_id === scriptIdValue)
    if (!example) return
    setSelectedExampleId(scriptIdValue)
    setScriptId(example.script_id)
    setScriptName(example.name)
    setScriptCode(example.code)
  }

  const rows = useMemo(
    () =>
      (scriptsQuery.data?.scripts ?? []).map((script) => ({
        id: script.script_id,
        name: script.name,
        status: script.enabled ? 'Enabled' : 'Disabled',
        updatedAt: new Date(script.updated_at * 1000).toLocaleString(),
      })),
    [scriptsQuery.data?.scripts],
  )

  return (
    <div className="midi-hub-processing-layout">
      <DataTable rows={rows} headers={[{ key: 'name', header: 'Script' }, { key: 'status', header: 'Status' }, { key: 'updatedAt', header: 'Updated' }]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Script inventory"
            description="Load a saved script into the editor or start from an example."
            className="midi-hub-processing-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type={(scriptsQuery.data?.scripts?.length ?? 0) > 0 ? 'green' : 'cool-gray'}>{`Scripts ${scriptsQuery.data?.scripts?.length ?? 0}`}</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Scripts">
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
                        <Button size="sm" kind="ghost" onClick={() => setSelectedScriptId(row.id)}>
                          Load
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <MidiHubSurface className="midi-hub-processing-editor-layer" tone="raised">
        <div className="midi-hub-processing-toolbar">
          <Tag type={selectedScript?.enabled ? 'green' : 'cool-gray'}>{selectedScript?.enabled ? 'Enabled' : 'Draft'}</Tag>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => {
              setSelectedScriptId('')
              setSelectedExampleId('')
              setScriptId('')
              setScriptName('')
              setScriptCode('def main(event):\n    log.info("hello from MAP2")\n')
            }}
          >
            New script
          </Button>
          <Button size="sm" kind="primary" disabled={!scriptCode.trim()} onClick={() => upsertMutation.mutate()}>
            Save script
          </Button>
          <Button size="sm" kind="secondary" disabled={!selectedScriptId} onClick={() => runMutation.mutate()}>
            Run script
          </Button>
          <Button size="sm" kind="secondary" disabled={!selectedScriptId} onClick={() => triggerMutation.mutate()}>
            Trigger script
          </Button>
          <Button size="sm" kind="ghost" disabled={!selectedScriptId} onClick={() => toggleMutation.mutate()}>
            {selectedScript?.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button size="sm" kind="danger--ghost" disabled={!selectedScriptId} onClick={() => stopMutation.mutate()}>
            Stop timers
          </Button>
          <Button size="sm" kind="danger--tertiary" disabled={!selectedScriptId} onClick={() => deleteMutation.mutate()}>
            Delete
          </Button>
        </div>

        <div className="midi-hub-processing-form-grid">
          <Select id="midi-hub-script-example" labelText="Example scripts" value={selectedExampleId} onChange={(event) => applyExample(event.currentTarget.value)}>
            <SelectItem value="" text="Load example" />
            {(examplesQuery.data?.examples ?? []).map((example) => (
              <SelectItem key={example.script_id} value={example.script_id} text={example.name} />
            ))}
          </Select>
          <TextInput id="midi-hub-script-id" labelText="Script ID" value={scriptId} onChange={(event) => setScriptId(event.currentTarget.value)} placeholder="midi-script" />
          <TextInput id="midi-hub-script-name" labelText="Script name" value={scriptName} onChange={(event) => setScriptName(event.currentTarget.value)} placeholder="MIDI Script" />
          <TextArea id="midi-hub-script-event-json" labelText="Test event JSON" value={eventJson} onChange={(event) => setEventJson(event.currentTarget.value)} rows={4} />
        </div>

        <TextArea id="midi-hub-script-code" labelText="Python source" value={scriptCode} onChange={(event) => setScriptCode(event.currentTarget.value)} rows={18} />
        <div className="midi-hub-processing-toolbar">
          <Tag type="cool-gray">Console</Tag>
        </div>
        <CodeSnippet className="midi-hub-processing-code-block" type="multi">
          {(consoleQuery.data?.lines ?? []).join('\n') || 'No output yet.'}
        </CodeSnippet>
      </MidiHubSurface>
    </div>
  )
}
