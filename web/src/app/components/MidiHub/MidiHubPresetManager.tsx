import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, Tag, TextInput } from '@carbon/react'
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
    [presets, chainIds],
  )

  const createMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.savePreset(
        {
          preset_id: `${slugFromName(name)}-${Date.now()}`,
          name,
          description,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Preset saved', 'success')
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
      pushToast('Program change slot updated', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Program change slot update failed', 'error'),
  })

  const removeSlotMutation = useMutation({
    mutationFn: async (programNumber: number) => midiHubApi.deleteProgramSlot(programNumber, nodeId),
    onSuccess: () => {
      pushToast('Program change slot removed', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const runChainMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.runPresetChain(
        chainId,
        {
          interval_ms: Math.max(25, Number.parseInt(chainInterval || '500', 10) || 500),
          cycles: chainCycles.trim() ? Math.max(1, Number.parseInt(chainCycles, 10) || 1) : null,
        },
        nodeId,
      ),
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
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={presets.length > 0 ? 'green' : 'warm-gray'}>{`Presets ${presets.length}`}</Tag>
          {defaultPresetId ? <Tag type="blue">{`Default ${defaultPresetId}`}</Tag> : null}
          <Tag type="cool-gray">{`PC slots ${slotEntries.length}`}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-preset-name"
            labelText="Preset name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-preset-description"
            labelText="Description"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" disabled={!name.trim()} onClick={() => createMutation.mutate()}>
            Save current state
          </Button>
          <Button size="sm" kind="ghost" onClick={() => void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })}>
            Refresh
          </Button>
        </div>

        <div className="midi-hub-record-list">
          {presets.length === 0 ? <div className="midi-hub-empty-state">No MIDI Hub presets saved.</div> : null}
          {presets.map((preset: MidiHubPresetSummary) => (
            <div key={preset.preset_id} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{preset.name}</strong>
                <div className="midi-hub-record-meta">
                  <code>{preset.preset_id}</code>
                  {` · ${preset.description || 'No description'}`}
                </div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="primary" onClick={() => recallMutation.mutate(preset.preset_id)}>
                  Recall
                </Button>
                <Button size="sm" kind="secondary" onClick={() => exportMutation.mutate(preset.preset_id)}>
                  Export
                </Button>
                <Button
                  size="sm"
                  kind={defaultPresetId === preset.preset_id ? 'primary' : 'ghost'}
                  onClick={() => defaultMutation.mutate(defaultPresetId === preset.preset_id ? null : preset.preset_id)}
                >
                  {defaultPresetId === preset.preset_id ? 'Default preset' : 'Make default'}
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteMutation.mutate(preset.preset_id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-panel-grid--2">
          <div className="midi-hub-mini-surface">
            <div className="midi-hub-form-grid">
              <Select
                id="midi-hub-compare-left"
                labelText="Compare left"
                value={leftPresetId}
                onChange={(event) => setLeftPresetId(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select left preset" />
                {presets.map((preset) => (
                  <SelectItem key={`left-${preset.preset_id}`} value={preset.preset_id} text={preset.name} />
                ))}
              </Select>
              <Select
                id="midi-hub-compare-right"
                labelText="Compare right"
                value={rightPresetId}
                onChange={(event) => setRightPresetId(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select right preset" />
                {presets.map((preset) => (
                  <SelectItem key={`right-${preset.preset_id}`} value={preset.preset_id} text={preset.name} />
                ))}
              </Select>
            </div>
            <div className="midi-hub-actions">
              <Button size="sm" kind="secondary" disabled={!leftPresetId || !rightPresetId} onClick={() => compareMutation.mutate()}>
                Compare presets
              </Button>
            </div>
            {compareResult ? <pre className="midi-hub-code-block">{JSON.stringify(compareResult, null, 2)}</pre> : null}
          </div>

          <div className="midi-hub-mini-surface">
            <TextInput
              id="midi-hub-import-path"
              labelText="Import preset file"
              value={importPath}
              onChange={(event) => setImportPath(event.currentTarget.value)}
              placeholder="~/.map2/midi_hub_presets/exports/<file>.json"
            />
            <div className="midi-hub-actions">
              <Button size="sm" kind="secondary" disabled={!importPath.trim()} onClick={() => importMutation.mutate()}>
                Import preset
              </Button>
            </div>
          </div>
        </div>

        <div className="midi-hub-panel-grid--2">
          <div className="midi-hub-mini-surface">
            <div className="midi-hub-form-grid">
              <TextInput
                id="midi-hub-pc-program"
                labelText="Program change number"
                value={slotProgram}
                onChange={(event) => setSlotProgram(event.currentTarget.value)}
              />
              <Select
                id="midi-hub-pc-target"
                labelText="Program change target"
                value={slotTarget}
                onChange={(event) => setSlotTarget(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select preset or chain" />
                {targetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} text={option.label} />
                ))}
              </Select>
            </div>
            <div className="midi-hub-actions">
              <Button size="sm" kind="secondary" disabled={!slotTarget} onClick={() => slotMutation.mutate()}>
                Assign program change
              </Button>
            </div>
            <div className="midi-hub-record-list">
              {slotEntries.length === 0 ? <div className="midi-hub-empty-state">No program change slots mapped.</div> : null}
              {slotEntries.map((slot) => (
                <div key={slot.program} className="midi-hub-record-row">
                  <div className="midi-hub-record-copy">
                    <strong>{`PC ${slot.program}`}</strong>
                    <div className="midi-hub-record-meta">
                      <code>{slot.target}</code>
                    </div>
                  </div>
                  <div className="midi-hub-record-actions">
                    <Button size="sm" kind="danger--tertiary" onClick={() => removeSlotMutation.mutate(slot.program)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="midi-hub-mini-surface">
            <div className="midi-hub-form-grid">
              <Select
                id="midi-hub-chain-id"
                labelText="Preset chain"
                value={chainId}
                onChange={(event) => setChainId(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select chain" />
                {chainIds.map((id) => (
                  <SelectItem key={id} value={id} text={id} />
                ))}
              </Select>
              <TextInput
                id="midi-hub-chain-interval"
                labelText="Interval (ms)"
                value={chainInterval}
                onChange={(event) => setChainInterval(event.currentTarget.value)}
              />
              <TextInput
                id="midi-hub-chain-cycles"
                labelText="Cycles"
                value={chainCycles}
                onChange={(event) => setChainCycles(event.currentTarget.value)}
                placeholder="Optional"
              />
            </div>
            <div className="midi-hub-actions">
              <Button size="sm" kind="secondary" disabled={!chainId} onClick={() => runChainMutation.mutate()}>
                Run preset chain
              </Button>
              <Button size="sm" kind="danger--tertiary" disabled={!chainId} onClick={() => stopChainMutation.mutate()}>
                Stop preset chain
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
