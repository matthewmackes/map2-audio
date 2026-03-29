/**
 * DrumMachineCard - compact drum-machine surface for JUCE Grid embeds.
 *
 * The grid version keeps only the essential live controls and routes deeper
 * editing to the dedicated /drums workspace.
 */

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PauseFilled, PlayFilled, Waveform } from '@carbon/icons-react'

import { NumberInput, ParameterKnob } from '../../../ParameterControl'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import type { DrumKit, DrumMachineState, DrumTransportState } from '@/map2/types'

type DrumMode = DrumMachineState['ui_mode']

const DRUM_MACHINE_URI = 'map2://juce/drums'

const PARAM = {
  BPM: 0,
  VOLUME: 1,
  PATTERN: 2,
  VARIATION: 3,
  TRANSPORT: 4,
} as const

const DRUM_MACHINE_PARAMS: PluginParamDef[] = [
  { index: PARAM.BPM, name: 'BPM', symbol: 'bpm' },
  { index: PARAM.VOLUME, name: 'Volume', symbol: 'volume' },
  { index: PARAM.PATTERN, name: 'Pattern', symbol: 'pattern' },
  { index: PARAM.VARIATION, name: 'Variation', symbol: 'variation' },
  { index: PARAM.TRANSPORT, name: 'Transport', symbol: 'transport' },
]

const MODE_LABELS: Record<DrumMode, string> = {
  practice: 'Practice',
  advanced: 'Advanced',
  backing_tracks: 'Backing Tracks',
}

const CARD_STYLES = {
  summary: {
    display: 'grid',
    gap: 6,
    padding: 14,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'radial-gradient(circle at top right, rgba(36,161,72,0.14), transparent 34%), ' +
      'linear-gradient(145deg, rgba(18,18,18,0.98), rgba(10,10,10,0.94))',
  } as const,
  summaryEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: '#8d8d8d',
  },
  summaryTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 20,
    fontWeight: 800,
    color: '#f4f4f4',
    letterSpacing: '-0.04em',
  } as const,
  summaryMeta: {
    fontSize: 12,
    color: '#c6c6c6',
  },
  body: {
    display: 'grid',
    gap: 16,
  } as const,
  controls: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 16,
    alignItems: 'start',
  } as const,
  knobWrap: {
    display: 'grid',
    justifyItems: 'center',
  } as const,
  transport: {
    display: 'grid',
    gap: 12,
    alignContent: 'start',
  } as const,
  transportButton: {
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
    background: '#24a148',
  } as const,
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap' as const,
    fontSize: 11,
    color: '#c6c6c6',
  } as const,
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function navigateToDrums(mode: DrumMode) {
  if (typeof window === 'undefined') {
    return
  }

  const nextUrl = `/drums?mode=${mode}`
  window.history.pushState({}, '', nextUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

interface DrumMachineCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function DrumMachineCardBase({
  plugin,
  accentColor = '#24a148',
  compact = true,
  onBypassToggle,
  onOpenMidiMappings,
}: DrumMachineCardProps) {
  const stateQuery = useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    refetchInterval: 1500,
    staleTime: 500,
  })
  const transportQuery = useQuery({
    queryKey: ['drums', 'transport'],
    queryFn: drumsApi.getTransport,
    refetchInterval: 1000,
    staleTime: 250,
  })
  const activeKitQuery = useQuery({
    queryKey: ['drums', 'active-kit'],
    queryFn: drumsApi.getActiveKit,
    staleTime: 10_000,
  })

  const transport = transportQuery.data as DrumTransportState | undefined
  const normalizedState = normalizeDrumMachineState(stateQuery.data as DrumMachineState | undefined)
  const activeKit = activeKitQuery.data as DrumKit | null | undefined
  const currentMode = normalizedState.ui_mode
  const isPlaying = transport?.is_playing ?? normalizedState.transport
  const bpm = transport?.bpm ?? normalizedState.bpm
  const volume = normalizedState.volume

  const handleTransportToggle = useCallback(() => {
    void drumsApi.updateState({ transport: !isPlaying })
  }, [isPlaying])

  const handleBpmChange = useCallback((value: number) => {
    void drumsApi.updateState({ bpm: clamp(Math.round(value), 30, 300) })
  }, [])

  const handleVolumeChange = useCallback((value: number) => {
    void drumsApi.updateState({ volume: clamp(Math.round(value), 0, 100) })
  }, [])

  const visualization = (
    <div style={CARD_STYLES.summary}>
      <span style={CARD_STYLES.summaryEyebrow}>Drum workstation</span>
      <div style={CARD_STYLES.summaryTitle}>
        <Waveform size={18} />
        <span>{MODE_LABELS[currentMode]}</span>
      </div>
      <span style={CARD_STYLES.summaryMeta}>
        {activeKit?.name ?? 'No kit loaded'} · {isPlaying ? 'Transport running' : 'Transport stopped'}
      </span>
    </div>
  )

  const footer = (
    <div style={CARD_STYLES.footer}>
      <span aria-label="Active kit name">Kit: {activeKit?.name ?? 'Unloaded'}</span>
      <span aria-label="Current mode label">Mode: {MODE_LABELS[currentMode]}</span>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      onLaunch={() => navigateToDrums(currentMode)}
      visualization={visualization}
      footer={footer}
      showPresetControls={false}
    >
      <div style={CARD_STYLES.body}>
        <div style={CARD_STYLES.controls}>
          <div style={CARD_STYLES.knobWrap}>
            <ParameterKnob
              label="Volume"
              ariaLabel="Volume"
              value={volume}
              min={0}
              max={100}
              step={1}
              onChange={handleVolumeChange}
              size="small"
              accentColor={accentColor}
            />
          </div>

          <div style={CARD_STYLES.transport}>
            <NumberInput
              label="BPM"
              ariaLabel="BPM"
              value={bpm}
              min={30}
              max={300}
              step={1}
              onChange={handleBpmChange}
              size="small"
              accentColor={accentColor}
            />

            <button
              type="button"
              aria-label={isPlaying ? 'Stop drum transport' : 'Start drum transport'}
              onClick={handleTransportToggle}
              style={CARD_STYLES.transportButton}
            >
              {isPlaying ? <PauseFilled size={16} /> : <PlayFilled size={16} />}
              {isPlaying ? 'Stop' : 'Play'}
            </button>
          </div>
        </div>
      </div>
    </PluginCardShell>
  )
}

export { DrumMachineCardBase as DrumMachineCard }
export default withMidiDialog(DrumMachineCardBase, DRUM_MACHINE_URI, DRUM_MACHINE_PARAMS)
