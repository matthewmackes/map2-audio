import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, MenuItem, Select, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useToasts } from '../Toasts'

function sanitizeScriptId(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return normalized || `script-${Date.now()}`
}

export function MidiScriptEditor() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const [selectedScriptId, setSelectedScriptId] = useState('')
  const [scriptId, setScriptId] = useState('')
  const [scriptName, setScriptName] = useState('')
  const [scriptCode, setScriptCode] = useState('def main(event):\n    log.info("hello from MAP2")\n')
  const [eventJson, setEventJson] = useState('{"source": "manual"}')

  const scriptsQuery = useQuery({
    queryKey: ['midi-hub', 'scripts'],
    queryFn: midiHubApi.listScripts,
    refetchInterval: 3000,
  })

  const examplesQuery = useQuery({
    queryKey: ['midi-hub', 'script-examples'],
    queryFn: midiHubApi.getScriptExamples,
  })

  const consoleQuery = useQuery({
    queryKey: ['midi-hub', 'script-console', selectedScriptId],
    queryFn: () => midiHubApi.getScriptConsole(selectedScriptId, 200),
    enabled: Boolean(selectedScriptId),
    refetchInterval: selectedScriptId ? 1500 : false,
  })

  const selectedScript = useMemo(
    () => (scriptsQuery.data?.scripts ?? []).find((script) => script.script_id === selectedScriptId) ?? null,
    [scriptsQuery.data?.scripts, selectedScriptId]
  )

  useEffect(() => {
    if (!selectedScript) return
    setScriptId(selectedScript.script_id)
    setScriptName(selectedScript.name)
    setScriptCode(selectedScript.code)
  }, [selectedScript])

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['midi-hub', 'scripts'] }),
      queryClient.invalidateQueries({ queryKey: ['midi-hub', 'script-console'] }),
    ])
  }

  const upsertMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertScript({
        script_id: sanitizeScriptId(scriptId || scriptName),
        name: scriptName || sanitizeScriptId(scriptId || 'midi-script'),
        code: scriptCode,
        enabled: true,
      }),
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
      return midiHubApi.runScript(selectedScriptId, parsed)
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
      return midiHubApi.triggerScript(selectedScriptId, parsed)
    },
    onSuccess: () => {
      pushToast('Script triggered', 'success')
      void refreshAll()
    },
    onError: () => pushToast('Script trigger failed', 'error'),
  })

  const stopMutation = useMutation({
    mutationFn: async () => midiHubApi.stopScript(selectedScriptId),
    onSuccess: () => {
      pushToast('Script timers stopped', 'info')
      void refreshAll()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScript) return null
      return selectedScript.enabled
        ? midiHubApi.disableScript(selectedScript.script_id)
        : midiHubApi.enableScript(selectedScript.script_id)
    },
    onSuccess: () => {
      pushToast('Script state updated', 'success')
      void refreshAll()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => midiHubApi.deleteScript(selectedScriptId),
    onSuccess: async () => {
      pushToast('Script deleted', 'info')
      setSelectedScriptId('')
      await refreshAll()
    },
  })

  const applyExample = (scriptIdValue: string) => {
    const example = (examplesQuery.data?.examples ?? []).find((item) => item.script_id === scriptIdValue)
    if (!example) return
    setScriptId(example.script_id)
    setScriptName(example.name)
    setScriptCode(example.code)
  }

  return (
    <div className="grid two" style={{ gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Scripts</h4>
        <div className="stack" style={{ gap: 8 }}>
          <Select
            size="small"
            displayEmpty
            value={selectedScriptId}
            onChange={(event) => setSelectedScriptId(String(event.target.value))}
          >
            <MenuItem value="">Select script</MenuItem>
            {(scriptsQuery.data?.scripts ?? []).map((script) => (
              <MenuItem key={script.script_id} value={script.script_id}>
                {script.name} ({script.enabled ? 'enabled' : 'disabled'})
              </MenuItem>
            ))}
          </Select>

          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Select size="small" displayEmpty value="" onChange={(event) => applyExample(String(event.target.value))}>
              <MenuItem value="">Load example</MenuItem>
              {(examplesQuery.data?.examples ?? []).map((example) => (
                <MenuItem key={example.script_id} value={example.script_id}>
                  {example.name}
                </MenuItem>
              ))}
            </Select>
            <Button size="small" variant="outlined" onClick={() => {
              setSelectedScriptId('')
              setScriptId('')
              setScriptName('')
              setScriptCode('def main(event):\n    log.info("hello from MAP2")\n')
            }}>
              New
            </Button>
          </div>

          <TextField
            size="small"
            label="Script ID"
            value={scriptId}
            onChange={(event) => setScriptId(event.target.value)}
            placeholder="midi-script"
          />
          <TextField
            size="small"
            label="Name"
            value={scriptName}
            onChange={(event) => setScriptName(event.target.value)}
            placeholder="MIDI Script"
          />
          <TextField
            size="small"
            label="Event JSON"
            value={eventJson}
            onChange={(event) => setEventJson(event.target.value)}
            multiline
            minRows={2}
          />

          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button size="small" variant="contained" disabled={!scriptCode.trim()} onClick={() => upsertMutation.mutate()}>
              Save
            </Button>
            <Button size="small" variant="outlined" disabled={!selectedScriptId} onClick={() => runMutation.mutate()}>
              Run
            </Button>
            <Button size="small" variant="outlined" disabled={!selectedScriptId} onClick={() => triggerMutation.mutate()}>
              Trigger
            </Button>
            <Button size="small" variant="outlined" color="warning" disabled={!selectedScriptId} onClick={() => stopMutation.mutate()}>
              Stop
            </Button>
            <Button size="small" variant="outlined" disabled={!selectedScriptId} onClick={() => toggleMutation.mutate()}>
              {selectedScript?.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button size="small" color="error" disabled={!selectedScriptId} onClick={() => deleteMutation.mutate()}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Editor</h4>
        <div className="stack" style={{ gap: 8 }}>
          <TextField
            size="small"
            label="Python Script"
            value={scriptCode}
            onChange={(event) => setScriptCode(event.target.value)}
            multiline
            minRows={16}
            maxRows={24}
          />
          <h4 style={{ margin: 0 }}>Console</h4>
          <pre style={{ margin: 0, minHeight: 180, maxHeight: 260, overflowY: 'auto', padding: 10, borderRadius: 8, background: '#0f172a', color: '#e2e8f0' }}>
            {(consoleQuery.data?.lines ?? []).join('\n') || 'No output yet.'}
          </pre>
        </div>
      </div>
    </div>
  )
}
