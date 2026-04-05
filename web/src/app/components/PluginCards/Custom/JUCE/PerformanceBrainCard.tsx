import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Launch, PauseFilled, PlayFilled } from '@carbon/icons-react'

import { NumberInput, ParameterKnob } from '../../../ParameterControl'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { useBrainRuntimeStateSync } from '@/app/hooks/useBrainRuntimeState'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'
import { brainApi, type BrainMixerState, type BrainSlot, type BrainState, type BrainTransportState } from '@/map2/api'

const PERFORMANCE_BRAIN_URI = 'map2://juce/brain'

const PARAM = {
  BPM: 0,
  MASTER: 1,
  PATTERN: 2,
  VARIATION: 3,
  TRANSPORT: 4,
} as const

const PERFORMANCE_BRAIN_PARAMS: PluginParamDef[] = [
  { index: PARAM.BPM, name: 'BPM', symbol: 'bpm' },
  { index: PARAM.MASTER, name: 'Master Volume', symbol: 'master_volume' },
  { index: PARAM.PATTERN, name: 'Pattern', symbol: 'pattern' },
  { index: PARAM.VARIATION, name: 'Variation', symbol: 'variation' },
  { index: PARAM.TRANSPORT, name: 'Transport', symbol: 'transport' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildBrainUrl(plugin: PluginCardProps['plugin'], pluginPosition?: number) {
  const searchParams = new URLSearchParams()
  if (plugin.instance_id != null) {
    searchParams.set('instance_id', String(plugin.instance_id))
  }
  if (pluginPosition != null) {
    searchParams.set('plugin_position', String(pluginPosition))
  }
  const search = searchParams.toString()
  return search ? `/brain?${search}` : '/brain'
}

function navigateToBrain(plugin: PluginCardProps['plugin'], pluginPosition?: number) {
  if (typeof window === 'undefined') {
    return
  }
  const nextUrl = buildBrainUrl(plugin, pluginPosition)
  window.history.pushState({}, '', nextUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

interface PerformanceBrainCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function PerformanceBrainCardBase({
  plugin,
  pluginPosition,
  accentColor: providedAccent,
  compact = true,
  onBypassToggle,
  onOpenMidiMappings,
}: PerformanceBrainCardProps) {
  const queryClient = useQueryClient()
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const scope = useMemo(
    () => ({
      instanceId: plugin.instance_id,
      pluginPosition,
    }),
    [plugin.instance_id, pluginPosition],
  )
  const scopeKey = `${plugin.instance_id ?? 'workspace'}:${pluginPosition ?? 'none'}`

  useBrainRuntimeStateSync(scope, scopeKey)

  const stateQuery = useQuery({
    queryKey: ['brain', 'state', scopeKey],
    queryFn: () => brainApi.getState(scope),
    staleTime: 500,
  })
  const transportQuery = useQuery({
    queryKey: ['brain', 'transport', scopeKey],
    queryFn: () => brainApi.getTransport(scope),
    staleTime: 500,
  })
  const mixerQuery = useQuery({
    queryKey: ['brain', 'mixer', scopeKey],
    queryFn: () => brainApi.getMixer(scope),
    staleTime: 2_000,
  })

  const state = stateQuery.data as BrainState | undefined
  const transport = transportQuery.data as BrainTransportState | undefined
  const mixer = mixerQuery.data as BrainMixerState | undefined
  const activeSlot = state?.slots?.[state.active_slot] as BrainSlot | undefined

  const transportMutation = useMutation({
    mutationFn: (patch: Parameters<typeof brainApi.setTransport>[0]) => brainApi.setTransport(patch, scope),
    onSuccess: (nextTransport) => {
      queryClient.setQueryData(['brain', 'transport', scopeKey], nextTransport)
    },
  })
  const mixerMutation = useMutation({
    mutationFn: (nextMixer: BrainMixerState) => brainApi.setMixer(nextMixer, scope),
    onSuccess: (nextMixer) => {
      queryClient.setQueryData(['brain', 'mixer', scopeKey], nextMixer)
    },
  })
  const slotMutation = useMutation({
    mutationFn: ({ slotId, patch }: { slotId: number; patch: Parameters<typeof brainApi.updateSlot>[1] }) =>
      brainApi.updateSlot(slotId, patch, scope),
    onSuccess: (nextSlot) => {
      queryClient.setQueryData<BrainState | undefined>(['brain', 'state', scopeKey], (previousState) => {
        if (!previousState?.slots?.length) {
          return previousState
        }
        const nextSlots = [...previousState.slots]
        nextSlots[nextSlot.slot_id] = {
          ...nextSlots[nextSlot.slot_id],
          ...nextSlot,
        }
        return {
          ...previousState,
          slots: nextSlots,
        }
      })
    },
  })

  const isPlaying = transport?.is_playing ?? false
  const bpm = transport?.bpm ?? 120
  const pattern = (transport?.pattern ?? 0) + 1
  const masterVolume = Math.round((mixer?.master?.master_volume ?? 0.82) * 100)
  const activeSlotLevel = Math.round((activeSlot?.level ?? 1) * 100)

  const handleTransportToggle = useCallback(() => {
    transportMutation.mutate({ is_playing: !isPlaying })
  }, [isPlaying, transportMutation])

  const handleBpmChange = useCallback((value: number) => {
    transportMutation.mutate({ bpm: clamp(Math.round(value), 40, 300) })
  }, [transportMutation])

  const handlePatternChange = useCallback((value: number) => {
    transportMutation.mutate({ pattern: clamp(Math.round(value) - 1, 0, 127) })
  }, [transportMutation])

  const handleMasterChange = useCallback((value: number) => {
    if (!mixer) {
      return
    }
    mixerMutation.mutate({
      ...mixer,
      master: {
        ...mixer.master,
        master_volume: clamp(value, 0, 100) / 100,
      },
    })
  }, [mixer, mixerMutation])

  const handleQuickMixChange = useCallback((value: number) => {
    if (!activeSlot) {
      return
    }
    slotMutation.mutate({
      slotId: activeSlot.slot_id,
      patch: {
        level: clamp(value, 0, 100) / 100,
      },
    })
  }, [activeSlot, slotMutation])

  const visualization = (
    <div style={{
      display: 'grid',
      gap: 6,
      padding: 14,
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      background:
        'radial-gradient(circle at top right, rgba(15,98,254,0.18), transparent 34%), ' +
        'linear-gradient(145deg, rgba(18,18,18,0.98), rgba(10,10,10,0.94))',
    }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8d8d8d' }}>
        Performance brain
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, color: '#f4f4f4' }}>
        <Launch size={18} />
        <span>{state?.set_name ?? 'Performance Brain'}</span>
      </div>
      <span style={{ fontSize: 12, color: '#c6c6c6' }}>
        {activeSlot ? `${activeSlot.name} · ${activeSlot.mode}` : 'No focused slot'} · Pattern {(transport?.pattern ?? 0) + 1}
      </span>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      onLaunch={() => navigateToBrain(plugin, pluginPosition)}
      visualization={visualization}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#c6c6c6' }}>
          <span aria-label="Focused slot summary">{activeSlot ? `${activeSlot.slot_id + 1}: ${activeSlot.name}` : 'No slot'}</span>
          <span aria-label="Sequence summary">Pattern {(transport?.pattern ?? 0) + 1} · Var {transport?.variation ?? 0}</span>
        </div>
      )}
      showPresetControls={false}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <ParameterKnob
              label="Master"
              ariaLabel="Master volume"
              value={masterVolume}
              min={0}
              max={100}
              step={1}
              onChange={handleMasterChange}
              size="small"
              accentColor={accentColor}
            />
          </div>

          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <ParameterKnob
              label="Quick Mix"
              ariaLabel="Active slot level"
              value={activeSlotLevel}
              min={0}
              max={100}
              step={1}
              onChange={handleQuickMixChange}
              size="small"
              accentColor={accentColor}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <NumberInput
              label="BPM"
              ariaLabel="Brain BPM"
              value={bpm}
              min={40}
              max={300}
              step={1}
              onChange={handleBpmChange}
              size="small"
              accentColor={accentColor}
            />
          </div>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <NumberInput
              label="Pattern"
              ariaLabel="Brain pattern"
              value={pattern}
              min={1}
              max={128}
              step={1}
              onChange={handlePatternChange}
              size="small"
              accentColor={accentColor}
            />
          </div>
        </div>

        <button
          type="button"
          aria-label={isPlaying ? 'Stop Performance Brain transport' : 'Start Performance Brain transport'}
          onClick={handleTransportToggle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 42,
            border: 'none',
            borderRadius: 10,
            padding: '0 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            color: '#081018',
            background: '#0f62fe',
          }}
        >
          {isPlaying ? <PauseFilled size={16} /> : <PlayFilled size={16} />}
          {isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>
    </PluginCardShell>
  )
}

export { PerformanceBrainCardBase as PerformanceBrainCard }
export default withMidiDialog(PerformanceBrainCardBase, PERFORMANCE_BRAIN_URI, PERFORMANCE_BRAIN_PARAMS)
