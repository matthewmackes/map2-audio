import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, Tag, TextArea, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

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

  const scriptsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'scripts'],
    queryFn: () => midiHubApi.listScripts(nodeId),
    refetchInterval: 3000,
  })

  const examplesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'script-examples'],
    queryFn: () => midiHubApi.getScriptExamples(nodeId),
  })

  const consoleQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'script-console', selectedScriptId],
    queryFn: () => midiHubApi.getScriptConsole(selectedScriptId, 200, nodeId),
    enabled: Boolean(selectedScriptId),
    refetchInterval: selectedScriptId ? 1500 : false,
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

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={(scriptsQuery.data?.scripts?.length ?? 0) > 0 ? 'green' : 'warm-gray'}>
            {`Scripts ${scriptsQuery.data?.scripts?.length ?? 0}`}
          </Tag>
          {selectedScript ? <Tag type={selectedScript.enabled ? 'green' : 'warm-gray'}>{selectedScript.enabled ? 'Enabled' : 'Disabled'}</Tag> : null}
        </div>

        <div className="midi-hub-form-grid">
          <Select
            id="midi-hub-script-select"
            labelText="Saved scripts"
            value={selectedScriptId}
            onChange={(event) => setSelectedScriptId(event.currentTarget.value)}
          >
            <SelectItem value="" text="Select script" />
            {(scriptsQuery.data?.scripts ?? []).map((script) => (
              <SelectItem
                key={script.script_id}
                value={script.script_id}
                text={`${script.name} (${script.enabled ? 'enabled' : 'disabled'})`}
              />
            ))}
          </Select>

          <Select
            id="midi-hub-script-example"
            labelText="Example scripts"
            value={selectedExampleId}
            onChange={(event) => applyExample(event.currentTarget.value)}
          >
            <SelectItem value="" text="Load example" />
            {(examplesQuery.data?.examples ?? []).map((example) => (
              <SelectItem key={example.script_id} value={example.script_id} text={example.name} />
            ))}
          </Select>

          <TextInput
            id="midi-hub-script-id"
            labelText="Script ID"
            value={scriptId}
            onChange={(event) => setScriptId(event.currentTarget.value)}
            placeholder="midi-script"
          />

          <TextInput
            id="midi-hub-script-name"
            labelText="Script name"
            value={scriptName}
            onChange={(event) => setScriptName(event.currentTarget.value)}
            placeholder="MIDI Script"
          />
        </div>

        <TextArea
          id="midi-hub-script-event-json"
          labelText="Test event JSON"
          value={eventJson}
          onChange={(event) => setEventJson(event.currentTarget.value)}
          rows={4}
        />

        <div className="midi-hub-actions">
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
            Save
          </Button>
          <Button size="sm" kind="secondary" disabled={!selectedScriptId} onClick={() => runMutation.mutate()}>
            Run
          </Button>
          <Button size="sm" kind="secondary" disabled={!selectedScriptId} onClick={() => triggerMutation.mutate()}>
            Trigger
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
      </div>

      <div className="midi-hub-mini-surface">
        <TextArea
          id="midi-hub-script-code"
          labelText="Python source"
          value={scriptCode}
          onChange={(event) => setScriptCode(event.currentTarget.value)}
          rows={18}
        />

        <div className="midi-hub-toolbar">
          <Tag type="cool-gray">Console</Tag>
        </div>
        <pre className="midi-hub-code-block">{(consoleQuery.data?.lines ?? []).join('\n') || 'No output yet.'}</pre>
      </div>
    </div>
  )
}
