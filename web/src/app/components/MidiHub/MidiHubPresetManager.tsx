import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { midiHubApi, type MidiHubPresetSummary } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { PresetChainEditor } from './PresetChainEditor'
import { PresetTable } from './PresetTable'
import { ProgramChangeSlots } from './ProgramChangeSlots'

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
  const presetNameById = useMemo(() => new Map(presets.map((preset) => [preset.preset_id, preset.name])), [presets])
  const presetDescriptionById = useMemo(
    () => new Map(presets.map((preset) => [preset.preset_id, preset.description || 'No description'])),
    [presets],
  )
  const chains = chainsQuery.data?.chains ?? {}
  const slotEntries = useMemo(() => {
    const slots = slotsQuery.data?.slots ?? {}
    return Object.entries(slots)
      .map(([program, target]) => ({ program: Number.parseInt(program, 10), target }))
      .sort((left, right) => left.program - right.program)
  }, [slotsQuery.data?.slots])

  const targetOptions = useMemo(
    () => [
      ...presets.map((preset) => ({ value: preset.preset_id, label: `Preset: ${preset.name}` })),
      ...Object.keys(chains).map((id) => ({ value: `chain:${id}`, label: `Chain: ${id}` })),
    ],
    [chains, presets],
  )

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string }) =>
      midiHubApi.savePreset(
        {
          preset_id: `${slugFromName(payload.name)}-${Date.now()}`,
          name: payload.name,
          description: payload.description,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Preset saved', 'success')
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
    mutationFn: async (payload: { leftPresetId: string; rightPresetId: string }) =>
      midiHubApi.comparePresets(payload.leftPresetId, payload.rightPresetId, nodeId),
    onError: () => pushToast('Compare failed', 'error'),
  })

  const exportMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.exportPreset(presetId, undefined, nodeId),
    onSuccess: (payload) => pushToast(`Preset exported: ${payload.path}`, 'success'),
  })

  const importMutation = useMutation({
    mutationFn: async (path: string) => midiHubApi.importPreset(path, nodeId),
    onSuccess: () => {
      pushToast('Preset imported', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Preset import failed', 'error'),
  })

  const slotMutation = useMutation({
    mutationFn: async (payload: { programNumber: string; targetId: string }) =>
      midiHubApi.setProgramSlot(parseProgramNumber(payload.programNumber), payload.targetId, nodeId),
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

  const saveChainMutation = useMutation({
    mutationFn: async (payload: { chainId: string; presetIds: string[] }) =>
      midiHubApi.setPresetChain(payload.chainId, payload.presetIds, nodeId),
    onSuccess: () => {
      pushToast('Preset chain updated', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Failed to update preset chain', 'error'),
  })

  const runChainMutation = useMutation({
    mutationFn: async (payload: { chainId: string; intervalMs: number; cycles?: number | null }) =>
      midiHubApi.runPresetChain(
        payload.chainId,
        {
          interval_ms: payload.intervalMs,
          cycles: payload.cycles,
        },
        nodeId,
      ),
    onSuccess: () => pushToast('Preset chain timer started', 'success'),
    onError: () => pushToast('Failed to run preset chain timer', 'error'),
  })

  const stopChainMutation = useMutation({
    mutationFn: async (chainId: string) => midiHubApi.stopPresetChain(chainId, nodeId),
    onSuccess: () => pushToast('Preset chain timer stopped', 'info'),
    onError: () => pushToast('Failed to stop preset chain timer', 'error'),
  })

  return (
    <div className="midi-hub-presets-manager">
      <PresetTable
        presets={presets}
        defaultPresetId={defaultPresetId}
        compareResult={compareMutation.data?.diff ?? null}
        onCreate={(payload) => createMutation.mutateAsync(payload)}
        onRecall={(presetId) => recallMutation.mutateAsync(presetId)}
        onDelete={(presetId) => deleteMutation.mutateAsync(presetId)}
        onExport={(presetId) => exportMutation.mutateAsync(presetId)}
        onToggleDefault={(presetId) => defaultMutation.mutateAsync(defaultPresetId === presetId ? null : presetId)}
        onCompare={(leftPresetId, rightPresetId) => compareMutation.mutateAsync({ leftPresetId, rightPresetId })}
        onImport={(path) => importMutation.mutateAsync(path)}
      />

      <ProgramChangeSlots
        slotEntries={slotEntries}
        targetOptions={targetOptions}
        presetNameById={presetNameById}
        onAssign={(programNumber, targetId) => slotMutation.mutateAsync({ programNumber, targetId })}
        onRemove={(programNumber) => removeSlotMutation.mutateAsync(programNumber)}
      />

      <PresetChainEditor
        chains={chains}
        presets={presets}
        presetNameById={presetNameById}
        presetDescriptionById={presetDescriptionById}
        onSaveChain={(chainId, presetIds) => saveChainMutation.mutateAsync({ chainId, presetIds })}
        onRunChain={(chainId, intervalMs, cycles) => runChainMutation.mutateAsync({ chainId, intervalMs, cycles })}
        onStopChain={(chainId) => stopChainMutation.mutateAsync(chainId)}
      />
    </div>
  )
}

export type MidiHubPresetOption = MidiHubPresetSummary
