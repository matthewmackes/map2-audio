import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  TextField,
} from '@mui/material'
import { midiHubApi, type MidiHubPresetSummary } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

function slugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `preset-${Date.now()}`
  )
}

function parseProgramNumber(input: string): number {
  const parsed = Number.parseInt(input, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(127, parsed))
}

export function MidiHubPresetManager() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leftPresetId, setLeftPresetId] = useState('')
  const [rightPresetId, setRightPresetId] = useState('')
  const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null)
  const [importPath, setImportPath] = useState('')
  const [slotProgram, setSlotProgram] = useState('0')
  const [slotTarget, setSlotTarget] = useState('')
  const [chainId, setChainId] = useState('')
  const [chainInterval, setChainInterval] = useState('500')
  const [chainCycles, setChainCycles] = useState('')

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'presets'],
    queryFn: () => midiHubApi.listPresets(nodeId),
    refetchInterval: 3000,
  })

  const chainsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'preset-chains'],
    queryFn: () => midiHubApi.getPresetChains(nodeId),
    refetchInterval: 5000,
  })

  const slotsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'preset-slots'],
    queryFn: () => midiHubApi.getProgramSlots(nodeId),
    refetchInterval: 5000,
  })

  const presets = useMemo(() => presetsQuery.data?.presets ?? [], [presetsQuery.data?.presets])
  const defaultPresetId = (presetsQuery.data?.default as { default_preset_id?: string | null } | undefined)?.default_preset_id ?? null
  const chainIds = useMemo(() => Object.keys(chainsQuery.data?.chains ?? {}), [chainsQuery.data?.chains])

  const targetOptions = useMemo(
    () => [
      ...presets.map((preset) => ({ value: preset.preset_id, label: `Preset: ${preset.name}` })),
      ...chainIds.map((id) => ({ value: `chain:${id}`, label: `Chain: ${id}` })),
    ],
    [presets, chainIds]
  )

  const createMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.savePreset({
        preset_id: `${slugFromName(name)}-${Date.now()}`,
        name,
        description,
      }, nodeId),
    onSuccess: () => {
      pushToast('Preset saved', 'success')
      setCreateOpen(false)
      setName('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Failed to save preset', 'error'),
  })

  const recallMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.recallPreset(presetId, nodeId),
    onSuccess: () => {
      pushToast('Preset recalled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.deletePreset(presetId, nodeId),
    onSuccess: () => {
      pushToast('Preset deleted', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const defaultMutation = useMutation({
    mutationFn: async (presetId: string | null) => midiHubApi.setDefaultPreset(presetId, nodeId),
    onSuccess: () => {
      pushToast('Default preset updated', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const compareMutation = useMutation({
    mutationFn: async () => midiHubApi.comparePresets(leftPresetId, rightPresetId, nodeId),
    onSuccess: (payload) => setCompareResult(payload.diff),
    onError: () => pushToast('Compare failed', 'error'),
  })

  const exportMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.exportPreset(presetId, undefined, nodeId),
    onSuccess: (payload) => pushToast(`Preset exported: ${payload.path}`, 'success'),
  })

  const importMutation = useMutation({
    mutationFn: async () => midiHubApi.importPreset(importPath, nodeId),
    onSuccess: () => {
      pushToast('Preset imported', 'success')
      setImportPath('')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Preset import failed', 'error'),
  })

  const slotMutation = useMutation({
    mutationFn: async () => midiHubApi.setProgramSlot(parseProgramNumber(slotProgram), slotTarget, nodeId),
    onSuccess: () => {
      pushToast('Program slot updated', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Program slot update failed', 'error'),
  })

  const removeSlotMutation = useMutation({
    mutationFn: async (programNumber: number) => midiHubApi.deleteProgramSlot(programNumber, nodeId),
    onSuccess: () => {
      pushToast('Program slot removed', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const runChainMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.runPresetChain(chainId, {
        interval_ms: Math.max(25, Number.parseInt(chainInterval || '500', 10) || 500),
        cycles: chainCycles.trim() ? Math.max(1, Number.parseInt(chainCycles, 10) || 1) : null,
      }, nodeId),
    onSuccess: () => pushToast('Preset chain timer started', 'success'),
    onError: () => pushToast('Failed to run preset chain timer', 'error'),
  })

  const stopChainMutation = useMutation({
    mutationFn: async () => midiHubApi.stopPresetChain(chainId, nodeId),
    onSuccess: () => pushToast('Preset chain timer stopped', 'info'),
    onError: () => pushToast('Failed to stop preset chain timer', 'error'),
  })

  const slotEntries = useMemo(() => {
    const slots = slotsQuery.data?.slots ?? {}
    return Object.entries(slots)
      .map(([program, target]) => ({ program: Number.parseInt(program, 10), target }))
      .sort((left, right) => left.program - right.program)
  }, [slotsQuery.data?.slots])

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="flex" style={{ gap: 8 }}>
          <Chip size="small" label={`Presets: ${presets.length}`} />
          {defaultPresetId ? <Chip size="small" color="success" label={`Default: ${defaultPresetId}`} /> : null}
          <Chip size="small" label={`Slots: ${slotEntries.length}`} />
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })}>
            Refresh
          </Button>
          <Button size="small" variant="contained" onClick={() => setCreateOpen(true)}>
            Save Current
          </Button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {presets.map((preset: MidiHubPresetSummary) => (
          <div key={preset.preset_id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div className="stack" style={{ gap: 2 }}>
              <div style={{ fontWeight: 700 }}>{preset.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                <code>{preset.preset_id}</code> · {preset.description || 'No description'}
              </div>
            </div>
            <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Button size="small" onClick={() => recallMutation.mutate(preset.preset_id)}>Recall</Button>
              <Button size="small" onClick={() => exportMutation.mutate(preset.preset_id)}>Export</Button>
              <Button
                size="small"
                variant={defaultPresetId === preset.preset_id ? 'contained' : 'outlined'}
                onClick={() => defaultMutation.mutate(defaultPresetId === preset.preset_id ? null : preset.preset_id)}
              >
                Default
              </Button>
              <Button size="small" color="error" onClick={() => deleteMutation.mutate(preset.preset_id)}>Delete</Button>
            </div>
          </div>
        ))}
        {presets.length === 0 ? <div className="list-item">No MIDI Hub presets yet.</div> : null}
      </div>

      <div className="grid two" style={{ gap: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Compare Presets</h4>
          <div className="stack" style={{ gap: 8 }}>
            <Select value={leftPresetId} size="small" onChange={(event) => setLeftPresetId(String(event.target.value))} displayEmpty>
              <MenuItem value="">Left preset</MenuItem>
              {presets.map((preset) => <MenuItem key={`left-${preset.preset_id}`} value={preset.preset_id}>{preset.name}</MenuItem>)}
            </Select>
            <Select value={rightPresetId} size="small" onChange={(event) => setRightPresetId(String(event.target.value))} displayEmpty>
              <MenuItem value="">Right preset</MenuItem>
              {presets.map((preset) => <MenuItem key={`right-${preset.preset_id}`} value={preset.preset_id}>{preset.name}</MenuItem>)}
            </Select>
            <Button
              size="small"
              variant="outlined"
              disabled={!leftPresetId || !rightPresetId}
              onClick={() => compareMutation.mutate()}
            >
              Compare
            </Button>
            {compareResult ? (
              <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#0f172a', color: '#e2e8f0', overflowX: 'auto' }}>
                {JSON.stringify(compareResult, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Import Preset</h4>
          <div className="stack" style={{ gap: 8 }}>
            <TextField
              size="small"
              label="Preset file path"
              value={importPath}
              onChange={(event) => setImportPath(event.target.value)}
              placeholder="~/.map2/midi_hub_presets/exports/<file>.json"
            />
            <Button
              size="small"
              variant="outlined"
              disabled={!importPath.trim()}
              onClick={() => importMutation.mutate()}
            >
              Import
            </Button>
          </div>
        </div>
      </div>

      <div className="grid two" style={{ gap: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Program Change Slots</h4>
          <div className="stack" style={{ gap: 8 }}>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Program"
                value={slotProgram}
                onChange={(event) => setSlotProgram(event.target.value)}
                style={{ maxWidth: 120 }}
              />
              <Select
                value={slotTarget}
                size="small"
                displayEmpty
                onChange={(event) => setSlotTarget(String(event.target.value))}
                style={{ minWidth: 260 }}
              >
                <MenuItem value="">Select preset or chain</MenuItem>
                {targetOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
              <Button
                size="small"
                variant="outlined"
                disabled={!slotTarget}
                onClick={() => slotMutation.mutate()}
              >
                Assign
              </Button>
            </div>

            {slotEntries.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No program slots mapped yet.</div>
            ) : (
              slotEntries.map((slot) => (
                <div key={slot.program} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>PC {slot.program} → <code>{slot.target}</code></span>
                  <Button size="small" color="error" onClick={() => removeSlotMutation.mutate(slot.program)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ marginTop: 0 }}>Preset Chain Timer</h4>
          <div className="stack" style={{ gap: 8 }}>
            <Select value={chainId} size="small" displayEmpty onChange={(event) => setChainId(String(event.target.value))}>
              <MenuItem value="">Select chain</MenuItem>
              {chainIds.map((id) => (
                <MenuItem key={id} value={id}>{id}</MenuItem>
              ))}
            </Select>
            <div className="flex" style={{ gap: 8 }}>
              <TextField
                size="small"
                label="Interval (ms)"
                value={chainInterval}
                onChange={(event) => setChainInterval(event.target.value)}
                style={{ maxWidth: 160 }}
              />
              <TextField
                size="small"
                label="Cycles"
                value={chainCycles}
                onChange={(event) => setChainCycles(event.target.value)}
                placeholder="optional"
                style={{ maxWidth: 140 }}
              />
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={!chainId}
                onClick={() => runChainMutation.mutate()}
              >
                Run
              </Button>
              <Button
                size="small"
                color="warning"
                variant="outlined"
                disabled={!chainId}
                onClick={() => stopChainMutation.mutate()}
              >
                Stop
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Save MIDI Hub Preset</DialogTitle>
        <DialogContent>
          <div className="stack" style={{ gap: 10, marginTop: 4 }}>
            <TextField size="small" label="Name" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              size="small"
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
