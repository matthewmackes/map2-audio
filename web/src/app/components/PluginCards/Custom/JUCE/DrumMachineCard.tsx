/**
 * DrumMachineCard - compact drum-machine surface for pedalboard/JUCE Grid embeds.
 *
 * Provides a mode-aware transport summary, compact step visualization, bus metering,
 * and a direct route into the full /drums workspace while preserving MIDI mapping.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Headphones, Launch, Music, PlayFilled, SettingsAdjust, StopFilled } from '@carbon/icons-react'

import { PluginCardShell } from '../../Base/PluginCardShell'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { DrumMachineWorkspaceModal } from './DrumMachineWorkspaceModal'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import type {
  DrumMachineState,
  DrumMetering,
  DrumPattern,
  DrumTransportState,
  DrumKit,
} from '@/map2/types'

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

const MODE_META: Record<DrumMode, { label: string; accent: string; icon: typeof Headphones }> = {
  practice: { label: 'Practice', accent: '#4589ff', icon: Headphones },
  advanced: { label: 'Advanced', accent: '#24a148', icon: SettingsAdjust },
  backing_tracks: { label: 'Backing', accent: '#ff832b', icon: Music },
}

const CARD_STYLES = {
  body: {
    display: 'grid',
    gap: 12,
  },
  hero: {
    display: 'grid',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'linear-gradient(145deg, rgba(18,18,18,0.98), rgba(10,10,10,0.94)),' +
      'radial-gradient(circle at top right, rgba(69,137,255,0.16), transparent 40%)',
  } as CSSProperties,
  heroTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    background: 'rgba(255,255,255,0.06)',
  } as CSSProperties,
  transportCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  transportButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#081018',
  } as CSSProperties,
  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#f4f4f4',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  bpmValue: {
    display: 'grid',
    gap: 4,
  },
  bpmNumber: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    color: '#f4f4f4',
  },
  bpmMeta: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#a8a8a8',
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  detailCard: {
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: '10px 12px',
    display: 'grid',
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#8d8d8d',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f4f4f4',
  },
  beatRow: {
    display: 'flex',
    gap: 6,
  },
  beatDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  } as CSSProperties,
  section: {
    display: 'grid',
    gap: 8,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#a8a8a8',
  },
  sectionMeta: {
    fontSize: 11,
    color: '#8d8d8d',
  },
  stepRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(16, minmax(0, 1fr))',
    gap: 6,
  },
  stepDot: {
    height: 16,
    borderRadius: 6,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid transparent',
  } as CSSProperties,
  meterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 8,
  },
  meterStrip: {
    display: 'grid',
    gap: 6,
  },
  meterTrack: {
    height: 54,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'flex-end',
  } as CSSProperties,
  meterFill: {
    width: '100%',
    borderRadius: 8,
    minHeight: 4,
  } as CSSProperties,
  meterLabel: {
    fontSize: 10,
    color: '#a8a8a8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  modeButton: {
    display: 'grid',
    gap: 4,
    alignContent: 'center',
    minHeight: 72,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    padding: 10,
    textAlign: 'left',
    cursor: 'pointer',
  } as CSSProperties,
  modeLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: '#f4f4f4',
  },
  modeRoute: {
    fontSize: 10,
    color: '#8d8d8d',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    fontSize: 11,
    color: '#c6c6c6',
  },
  workspaceActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatPatternLabel(pattern: number, variation: number) {
  return `P${String(pattern + 1).padStart(3, '0')} · ${variation === 0 ? 'Main' : `Var ${variation}`}`
}

function navigateToDrums(mode: DrumMode) {
  if (typeof window === 'undefined') {
    return
  }

  const nextUrl = `/drums?mode=${mode}`
  window.history.pushState({}, '', nextUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function resolveActiveInstrumentIndex(kit: DrumKit | null | undefined, metering: DrumMetering | undefined) {
  const instrumentCount = kit?.instruments.length ?? 0
  if (instrumentCount === 0) {
    return 0
  }

  const peaks = metering?.per_pad_peak ?? []
  let loudestIndex = 0
  let loudestLevel = -1
  for (let index = 0; index < instrumentCount; index += 1) {
    const level = peaks[index] ?? 0
    if (level > loudestLevel) {
      loudestLevel = level
      loudestIndex = index
    }
  }
  return loudestIndex
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
  const meteringQuery = useQuery({
    queryKey: ['drums', 'metering'],
    queryFn: drumsApi.getMetering,
    refetchInterval: 1000,
    staleTime: 0,
  })

  const transport = transportQuery.data as DrumTransportState | undefined
  const normalizedState = normalizeDrumMachineState(stateQuery.data as DrumMachineState | undefined)
  const activeKit = activeKitQuery.data as DrumKit | null | undefined
  const metering = meteringQuery.data as DrumMetering | undefined

  const patternQuery = useQuery({
    queryKey: ['drums', 'pattern', transport?.pattern ?? normalizedState.pattern ?? 0],
    queryFn: () => drumsApi.getPattern(transport?.pattern ?? normalizedState.pattern ?? 0),
    staleTime: 1000,
  })

  const currentMode = normalizedState.ui_mode
  const modeMeta = MODE_META[currentMode]
  const isPlaying = transport?.is_playing ?? normalizedState.transport
  const bpm = transport?.bpm ?? normalizedState.bpm
  const patternId = transport?.pattern ?? normalizedState.pattern
  const variation = transport?.variation ?? normalizedState.variation

  const [beatPhase, setBeatPhase] = useState(0)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [workspaceModalMode, setWorkspaceModalMode] = useState<DrumMode>(currentMode)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)
  const beatInterval = useRef<number | null>(null)

  useEffect(() => {
    if (beatInterval.current != null) {
      window.clearInterval(beatInterval.current)
      beatInterval.current = null
    }
    if (typeof window !== 'undefined' && isPlaying && bpm > 0) {
      beatInterval.current = window.setInterval(() => {
        setBeatPhase((value) => (value + 1) % 4)
      }, 60000 / bpm)
    } else {
      setBeatPhase(0)
    }

    return () => {
      if (beatInterval.current != null) {
        window.clearInterval(beatInterval.current)
      }
    }
  }, [bpm, isPlaying])

  const handleTransportToggle = useCallback(() => {
    void drumsApi.updateState({ transport: !isPlaying })
  }, [isPlaying])

  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    const nextTapTimes = [...tapTimes, now].slice(-6)
    setTapTimes(nextTapTimes)
    void drumsApi.tapTempo(now)
  }, [tapTimes])

  const handleModeNavigate = useCallback((mode: DrumMode) => {
    void drumsApi.updateState({ ui_mode: mode })
    setWorkspaceModalMode(mode)
    setWorkspaceModalOpen(true)
  }, [])

  const activeInstrumentIndex = useMemo(
    () => resolveActiveInstrumentIndex(activeKit, metering),
    [activeKit, metering],
  )

  const activeInstrument = activeKit?.instruments[activeInstrumentIndex]
  const activePattern = patternQuery.data as DrumPattern | undefined
  const visibleSteps = useMemo(
    () => (activePattern?.steps[activeInstrumentIndex] ?? []).slice(0, 16),
    [activeInstrumentIndex, activePattern],
  )
  const visibleStepCount = Math.min(activePattern?.length ?? 16, 16)
  const busLevels = (metering?.per_bus_peak ?? []).slice(0, 4)
  const footer = (
    <div style={CARD_STYLES.footer}>
      <span aria-label="Active kit name">Kit: {activeKit?.name ?? 'Unloaded'}</span>
      <span aria-label="Active pattern label">{formatPatternLabel(patternId, variation)}</span>
    </div>
  )
  const ModeIcon = modeMeta.icon

  const hero = (
    <div style={CARD_STYLES.hero}>
      <div style={CARD_STYLES.heroTop}>
        <div style={CARD_STYLES.modePill}>
          <ModeIcon size={14} />
          <span style={{ color: modeMeta.accent }}>{modeMeta.label}</span>
        </div>
        <div style={CARD_STYLES.transportCluster}>
          <button
            type="button"
            aria-label={isPlaying ? 'Stop drum transport' : 'Start drum transport'}
            onClick={handleTransportToggle}
            style={{ ...CARD_STYLES.transportButton, background: modeMeta.accent }}
          >
            {isPlaying ? <StopFilled size={16} /> : <PlayFilled size={16} />}
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button
            type="button"
            aria-label="Tap tempo"
            onClick={handleTapTempo}
            style={CARD_STYLES.secondaryButton}
          >
            Tap
          </button>
        </div>
      </div>

      <div style={CARD_STYLES.heroTop}>
        <div style={CARD_STYLES.bpmValue}>
          <span style={CARD_STYLES.bpmNumber}>{bpm}</span>
          <span style={CARD_STYLES.bpmMeta}>BPM</span>
        </div>
        <div style={CARD_STYLES.beatRow} aria-label="Beat indicator">
          {[0, 1, 2, 3].map((beat) => (
            <span
              key={beat}
              aria-hidden="true"
              style={{
                ...CARD_STYLES.beatDot,
                background: isPlaying && beat === beatPhase ? modeMeta.accent : 'rgba(255,255,255,0.12)',
                boxShadow: isPlaying && beat === beatPhase ? `0 0 10px ${modeMeta.accent}` : CARD_STYLES.beatDot.boxShadow,
              }}
            />
          ))}
        </div>
      </div>

      <div style={CARD_STYLES.detailRow}>
        <div style={CARD_STYLES.detailCard}>
          <span style={CARD_STYLES.detailLabel}>Pattern</span>
          <span style={CARD_STYLES.detailValue}>{formatPatternLabel(patternId, variation)}</span>
        </div>
        <div style={CARD_STYLES.detailCard}>
          <span style={CARD_STYLES.detailLabel}>Current Instrument</span>
          <span style={CARD_STYLES.detailValue}>{activeInstrument?.name ?? 'Pad 1'}</span>
        </div>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={modeMeta.accent ?? accentColor}
      compact={compact}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={hero}
      footer={footer}
      showPresetControls={false}
    >
      <div style={CARD_STYLES.body}>
        <section style={CARD_STYLES.section} aria-label="Current step overview">
          <div style={CARD_STYLES.sectionHeader}>
            <h4 style={CARD_STYLES.sectionTitle}>Current Instrument Steps</h4>
            <span style={CARD_STYLES.sectionMeta}>{visibleStepCount} visible</span>
          </div>
          <div style={CARD_STYLES.stepRow} aria-label={`${activeInstrument?.name ?? 'Current instrument'} step indicator`}>
            {Array.from({ length: 16 }, (_, index) => {
              const step = visibleSteps[index]
              const isActive = step?.active ?? false
              const isAccent = step?.accent ?? false
              const isCurrent = isPlaying && (beatPhase % 16) === index
              return (
                <span
                  key={index}
                  aria-label={`Step ${index + 1} ${isActive ? 'active' : 'inactive'}`}
                  style={{
                    ...CARD_STYLES.stepDot,
                    background: isActive ? modeMeta.accent : 'rgba(255,255,255,0.08)',
                    opacity: isAccent ? 1 : isActive ? 0.82 : 1,
                    borderColor: isCurrent ? '#f4f4f4' : isAccent ? '#f1c21b' : 'transparent',
                    boxShadow: isCurrent ? `0 0 0 1px ${modeMeta.accent}` : 'none',
                  }}
                />
              )
            })}
          </div>
        </section>

        <section style={CARD_STYLES.section} aria-label="Bus metering">
          <div style={CARD_STYLES.sectionHeader}>
            <h4 style={CARD_STYLES.sectionTitle}>Bus Metering</h4>
            <span style={CARD_STYLES.sectionMeta}>Buses 1-4</span>
          </div>
          <div style={CARD_STYLES.meterGrid}>
            {Array.from({ length: 4 }, (_, index) => {
              const level = clamp(busLevels[index] ?? 0, 0, 1)
              return (
                <div key={index} style={CARD_STYLES.meterStrip}>
                  <div style={CARD_STYLES.meterTrack} aria-label={`Bus ${index + 1} level`}>
                    <div
                      style={{
                        ...CARD_STYLES.meterFill,
                        height: `${Math.max(8, Math.round(level * 100))}%`,
                        background: `linear-gradient(180deg, ${modeMeta.accent}, rgba(255,255,255,0.16))`,
                      }}
                    />
                  </div>
                  <span style={CARD_STYLES.meterLabel}>Bus {index + 1}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section style={CARD_STYLES.section} aria-label="Mode routing">
          <div style={CARD_STYLES.sectionHeader}>
            <h4 style={CARD_STYLES.sectionTitle}>Open Full Workspace</h4>
            <span style={CARD_STYLES.sectionMeta}>Modal first, page optional</span>
          </div>
          <div style={CARD_STYLES.modeGrid}>
            {(Object.entries(MODE_META) as [DrumMode, (typeof MODE_META)[DrumMode]][]).map(([mode, meta]) => {
              const Icon = meta.icon
              return (
                <button
                  key={mode}
                  type="button"
                  aria-label={`Open ${meta.label} mode`}
                  onClick={() => handleModeNavigate(mode)}
                  style={{
                    ...CARD_STYLES.modeButton,
                    borderColor: currentMode === mode ? meta.accent : 'rgba(255,255,255,0.1)',
                    boxShadow: currentMode === mode ? `inset 0 0 0 1px ${meta.accent}` : 'none',
                  }}
                >
                  <span style={CARD_STYLES.modeLabel}>
                    <Icon size={14} style={{ color: meta.accent }} />
                    {meta.label}
                  </span>
                  <span style={CARD_STYLES.modeRoute}>{mode === currentMode ? 'Current mode' : 'Route to full page'}</span>
                </button>
              )
            })}
          </div>
          <div style={CARD_STYLES.workspaceActions}>
            <button
              type="button"
              aria-label="Open full drums page"
              onClick={() => navigateToDrums(currentMode)}
              style={CARD_STYLES.secondaryButton}
            >
              <Launch size={14} />
              Open /drums
            </button>
          </div>
        </section>
      </div>
      <DrumMachineWorkspaceModal
        open={workspaceModalOpen}
        mode={workspaceModalMode}
        onClose={() => setWorkspaceModalOpen(false)}
      />
    </PluginCardShell>
  )
}

export { DrumMachineCardBase as DrumMachineCard }
export default withMidiDialog(DrumMachineCardBase, DRUM_MACHINE_URI, DRUM_MACHINE_PARAMS)
