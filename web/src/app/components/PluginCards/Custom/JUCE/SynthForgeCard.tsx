/**
 * SynthForgeCard - flagship workstation editor for the MAP2 sampler engine
 *
 * The live editor surfaces this card only when SynthForge is the sole
 * SynthForge-family block in the active chain. The backend remains globally
 * scoped today, so duplicate SynthForge blocks still fall back to the generic
 * parameter editor until the engine gains true per-instance state.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { InlineLoading, Tab, TabList, Tabs, Tag } from '@carbon/react'

import { CarbonParameterSection } from '../../Base/CarbonParameterSection'
import { InstrumentCategoryLayout, type ParamSlot } from '../../Layouts/InstrumentCategoryLayout'
import { NumberInput } from '../../../ParameterControl'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import {
  soundfontApi,
  synthforgeApi,
  type SynthForgeAnalyzerFrame,
  type SynthForgeBackendStatus,
  type SynthForgeFreezeStatus,
  type SynthForgeHotReloadStatus,
  type SynthForgeModMatrixRoute,
  type SynthForgeMpeConfig,
  type SynthForgePartConfig,
  type SynthForgePerformanceConfig,
  type SynthForgeScalaTuning,
  type SynthForgeStreamingConfig,
} from '../../../../../map2/api'
import type { SoundFont } from '../../../../types/library'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../../map2/hooks/useWebSocket'

const SYNTHFORGE_URI = 'map2://juce/synthforge'

const PARAM = {
  TRANSPOSE: 0,
  VELOCITY_CURVE: 1,
  PITCH_BEND_RANGE: 2,
  LEVEL: 3,
} as const

const SYNTHFORGE_PARAMS: PluginParamDef[] = [
  { index: PARAM.TRANSPOSE, name: 'Transpose', symbol: 'masterTranspose' },
  { index: PARAM.VELOCITY_CURVE, name: 'Velocity Curve', symbol: 'velocityCurve' },
  { index: PARAM.PITCH_BEND_RANGE, name: 'PB Range', symbol: 'pitchBendRange' },
  { index: PARAM.LEVEL, name: 'Level', symbol: 'level' },
]

type NoteSource = 'external' | 'on-screen' | 'qwerty'
type MidiEventType = 'note_on' | 'note_off'
type WorkspaceTab = 'sound' | 'rack' | 'play' | 'engine' | 'advanced'

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'sound', label: 'Sound' },
  { id: 'rack', label: 'Rack' },
  { id: 'play', label: 'Play' },
  { id: 'engine', label: 'Engine' },
  { id: 'advanced', label: 'Advanced' },
]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const OUTPUT_BUSES = ['main', 'aux_1', 'aux_2', 'aux_3', 'aux_4', 'aux_5', 'aux_6', 'aux_7', 'aux_8']
const KEYBOARD_MIN_NOTE = 36
const KEYBOARD_MAX_NOTE = 96
const KEYBOARD_BASE_NOTE = 48
const MAX_NOTE_EVENTS = 80
const DEFAULT_RENDER_DURATION_MS = 2000
const DEFAULT_STREAMING: SynthForgeStreamingConfig = {
  enabled: true,
  preload_size: 131072,
  max_voices: 64,
  interpolation: 'hermite',
  quality_live: 5,
  quality_freewheeling: 8,
  memory_limit_mb: 256,
}
const DEFAULT_SCALA: SynthForgeScalaTuning = {
  enabled: false,
  scala_path: '',
  root_key: 60,
  reference_hz: 440,
}
const DEFAULT_MPE: SynthForgeMpeConfig = {
  enabled: false,
  lower_zone_channels: 0,
  upper_zone_channels: 0,
  pitch_bend_range_semitones: 48,
}
const DEFAULT_HOT_RELOAD: SynthForgeHotReloadStatus = {
  enabled: false,
  interval_ms: 1000,
  pending_reload: false,
  reloaded: false,
  generation: 0,
  last_reload_iso: '',
  last_error: '',
}
const QWERTY_NOTE_OFFSETS: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
}

interface MidiNoteState {
  channel: number
  note: number
  velocity: number
  source: NoteSource
  updatedAt: number
}

interface MidiNoteEvent extends MidiNoteState {
  id: string
  type: MidiEventType
}

interface PanelFrameProps {
  title: string
  meta?: string
  action?: ReactNode
  children: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function noteLabel(note: number): string {
  const octave = Math.floor(note / 12) - 1
  return `${NOTE_NAMES[note % 12]}${octave}`
}

function isBlackNote(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(note % 12)
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function defaultPart(partIndex: number): SynthForgePartConfig {
  return {
    part_index: partIndex,
    midi_channel: partIndex + 1,
    output_bus: 'main',
    level: 1,
    pan: 0,
    mute: false,
    solo: false,
  }
}

function defaultRenderPath(partIndex: number): string {
  return `/tmp/synthforge-part-${partIndex + 1}.wav`
}

function pathTail(path: string): string {
  if (!path) return ''
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function peakPercent(value?: number): string {
  return `${Math.round(clamp((value ?? 0) * 100, 0, 100))}%`
}

function NumericField(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <NumberInput
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      unit={props.unit}
      onChange={props.onChange}
      size="small"
      accentColor="var(--interactive)"
      className="synthforge-number-input"
    />
  )
}

function TextField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{props.label}</span>
      <input
        style={S.input}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField(props: {
  label: string
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{props.label}</span>
      <select style={S.select} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.children}
      </select>
    </label>
  )
}

function PanelFrame({ title, meta, action, children }: PanelFrameProps) {
  return (
    <section style={S.panel}>
      <div style={S.panelHeader}>
        <div style={S.panelHeading}>
          <h4 style={S.panelTitle}>{title}</h4>
          {meta ? <span style={S.panelMeta}>{meta}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const S = {
  hero: {
    display: 'grid',
    gap: '1rem',
    padding: '1.1rem',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18,
    background:
      'radial-gradient(circle at top right, rgba(34,197,94,0.18), transparent 34%), ' +
      'radial-gradient(circle at bottom left, rgba(59,130,246,0.18), transparent 32%), ' +
      'linear-gradient(145deg, rgba(7,12,20,0.98), rgba(18,24,38,0.94))',
  } as CSSProperties,
  heroTop: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.7fr) minmax(15rem, 0.9fr)',
    gap: '1rem',
    alignItems: 'stretch',
  } as CSSProperties,
  heroCopy: {
    display: 'grid',
    gap: '0.7rem',
    minWidth: 0,
  } as CSSProperties,
  eyebrow: {
    fontSize: '0.74rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: '#8bd5ca',
  } as CSSProperties,
  heroTitleRow: {
    display: 'flex',
    gap: '0.55rem',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  heroTitle: {
    margin: 0,
    fontSize: '1.95rem',
    lineHeight: 1,
    fontWeight: 800,
    color: '#f8fafc',
    letterSpacing: '-0.04em',
  } as CSSProperties,
  heroLead: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#f8fafc',
  } as CSSProperties,
  heroSub: {
    margin: 0,
    fontSize: '0.88rem',
    color: 'rgba(226,232,240,0.8)',
    lineHeight: 1.5,
  } as CSSProperties,
  metricRail: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(8.25rem, 1fr))',
    gap: '0.75rem',
  } as CSSProperties,
  metricTile: {
    display: 'grid',
    gap: '0.25rem',
    padding: '0.8rem 0.9rem',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(15,23,42,0.66)',
  } as CSSProperties,
  metricLabel: {
    fontSize: '0.68rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'rgba(191,219,254,0.68)',
  } as CSSProperties,
  metricValue: {
    fontSize: '1.08rem',
    fontWeight: 700,
    color: '#f8fafc',
  } as CSSProperties,
  meterCluster: {
    display: 'grid',
    gap: '0.75rem',
    alignContent: 'start',
  } as CSSProperties,
  meterCard: {
    display: 'grid',
    gap: '0.55rem',
    padding: '0.9rem',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(2,6,23,0.72)',
  } as CSSProperties,
  meterRow: {
    display: 'grid',
    gridTemplateColumns: '3rem minmax(0, 1fr) 3rem',
    gap: '0.65rem',
    alignItems: 'center',
  } as CSSProperties,
  meterTrack: {
    height: 10,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  } as CSSProperties,
  meterFill: (tone: 'left' | 'right') => ({
    height: '100%',
    borderRadius: 999,
    background: tone === 'left'
      ? 'linear-gradient(90deg, #22c55e, #38bdf8)'
      : 'linear-gradient(90deg, #f59e0b, #ef4444)',
  } as CSSProperties),
  meterLabel: {
    fontSize: '0.74rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: '#cbd5e1',
  } as CSSProperties,
  meterValue: {
    fontSize: '0.78rem',
    color: '#e2e8f0',
    textAlign: 'right' as const,
  } as CSSProperties,
  partStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(16, minmax(3.3rem, 1fr))',
    gap: '0.45rem',
    overflowX: 'auto' as const,
    paddingBottom: 2,
  } as CSSProperties,
  partPill: (active: boolean) => ({
    display: 'grid',
    gap: '0.2rem',
    justifyItems: 'center' as const,
    padding: '0.55rem 0.25rem',
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(191,219,254,0.58)' : 'rgba(148,163,184,0.16)'}`,
    background: active
      ? 'linear-gradient(180deg, rgba(15,118,110,0.9), rgba(17,94,89,0.78))'
      : 'rgba(15,23,42,0.6)',
    color: '#f8fafc',
    cursor: 'pointer',
    minHeight: '4rem',
  } as CSSProperties),
  partPillSub: {
    fontSize: '0.66rem',
    color: 'rgba(226,232,240,0.72)',
  } as CSSProperties,
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
    gap: '0.75rem',
  } as CSSProperties,
  dualGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
    gap: '0.9rem',
  } as CSSProperties,
  triGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
    gap: '0.9rem',
  } as CSSProperties,
  field: {
    display: 'grid',
    gap: '0.35rem',
  } as CSSProperties,
  fieldLabel: {
    fontSize: '0.72rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'rgba(203,213,225,0.72)',
  } as CSSProperties,
  input: {
    minHeight: '2.75rem',
    padding: '0.72rem 0.86rem',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(2,6,23,0.62)',
    color: '#f8fafc',
    width: '100%',
  } as CSSProperties,
  select: {
    minHeight: '2.75rem',
    padding: '0.72rem 0.86rem',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(2,6,23,0.62)',
    color: '#f8fafc',
    width: '100%',
  } as CSSProperties,
  actionRow: {
    display: 'flex',
    gap: '0.7rem',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as CSSProperties,
  toggleRow: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as CSSProperties,
  actionButton: (active: boolean, tone: 'primary' | 'secondary' = 'secondary') => ({
    minHeight: '2.7rem',
    padding: '0.7rem 1rem',
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(148,250,165,0.45)' : tone === 'primary' ? 'rgba(125,211,252,0.38)' : 'rgba(148,163,184,0.18)'}`,
    background: active
      ? 'linear-gradient(180deg, rgba(21,128,61,0.9), rgba(22,101,52,0.78))'
      : tone === 'primary'
        ? 'linear-gradient(180deg, rgba(15,118,110,0.92), rgba(17,94,89,0.8))'
        : 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    fontWeight: 700,
    cursor: 'pointer',
  } as CSSProperties),
  workstation: {
    display: 'grid',
    gap: '0.9rem',
  } as CSSProperties,
  workstationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.8rem',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  workstationCopy: {
    display: 'grid',
    gap: '0.2rem',
  } as CSSProperties,
  workstationLead: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: '#f8fafc',
  } as CSSProperties,
  workstationSub: {
    margin: 0,
    fontSize: '0.84rem',
    color: 'rgba(203,213,225,0.72)',
  } as CSSProperties,
  workspaceBody: {
    display: 'grid',
    gap: '0.9rem',
  } as CSSProperties,
  panel: {
    display: 'grid',
    gap: '0.8rem',
    padding: '1rem',
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(15,23,42,0.58)',
  } as CSSProperties,
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.8rem',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  panelHeading: {
    display: 'grid',
    gap: '0.18rem',
  } as CSSProperties,
  panelTitle: {
    margin: 0,
    fontSize: '0.92rem',
    fontWeight: 700,
    color: '#f8fafc',
  } as CSSProperties,
  panelMeta: {
    fontSize: '0.78rem',
    color: 'rgba(203,213,225,0.7)',
  } as CSSProperties,
  list: {
    display: 'grid',
    gap: '0.55rem',
    maxHeight: '20rem',
    overflow: 'auto',
  } as CSSProperties,
  selectableRow: (selected: boolean) => ({
    display: 'grid',
    gap: '0.25rem',
    width: '100%',
    textAlign: 'left' as const,
    padding: '0.82rem 0.9rem',
    borderRadius: 16,
    border: `1px solid ${selected ? 'rgba(125,211,252,0.5)' : 'rgba(148,163,184,0.16)'}`,
    background: selected
      ? 'linear-gradient(180deg, rgba(15,118,110,0.86), rgba(15,23,42,0.9))'
      : 'rgba(2,6,23,0.54)',
    color: '#f8fafc',
    cursor: 'pointer',
  } as CSSProperties),
  selectableMeta: {
    fontSize: '0.78rem',
    color: 'rgba(226,232,240,0.7)',
  } as CSSProperties,
  rackGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
    gap: '0.75rem',
  } as CSSProperties,
  rackTile: (active: boolean) => ({
    display: 'grid',
    gap: '0.45rem',
    padding: '0.85rem',
    borderRadius: 16,
    border: `1px solid ${active ? 'rgba(56,189,248,0.46)' : 'rgba(148,163,184,0.16)'}`,
    background: active
      ? 'linear-gradient(180deg, rgba(30,64,175,0.28), rgba(15,23,42,0.9))'
      : 'rgba(2,6,23,0.48)',
    cursor: 'pointer',
  } as CSSProperties),
  rackTileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.55rem',
    alignItems: 'center',
  } as CSSProperties,
  rackTileValue: {
    fontSize: '0.84rem',
    color: '#f8fafc',
    fontWeight: 700,
  } as CSSProperties,
  tinyMeta: {
    fontSize: '0.72rem',
    color: 'rgba(203,213,225,0.7)',
  } as CSSProperties,
  keyboard: (compact: boolean) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(61, minmax(${compact ? '0.9rem' : '1.15rem'}, 1fr))`,
    gap: '0.14rem',
    alignItems: 'end',
    overflow: 'auto',
  } as CSSProperties),
  whiteKey: (active: boolean, accent: string) => ({
    position: 'relative' as const,
    minHeight: '8rem',
    borderRadius: '0 0 10px 10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, #f8fafc, #dbeafe)',
    color: 'rgba(0,0,0,0.76)',
    cursor: 'pointer',
    boxShadow: active ? `inset 0 0 0 2px ${accent}, 0 0 18px rgba(56,214,196,0.28)` : 'none',
  } as CSSProperties),
  blackKey: (active: boolean, accent: string) => ({
    position: 'relative' as const,
    minHeight: '5.7rem',
    borderRadius: '0 0 10px 10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, #1e293b, #020617)',
    color: 'rgba(226,232,240,0.92)',
    cursor: 'pointer',
    boxShadow: active ? `inset 0 0 0 2px ${accent}, 0 0 18px rgba(56,214,196,0.28)` : 'none',
  } as CSSProperties),
  keyLabel: {
    position: 'absolute' as const,
    bottom: '0.35rem',
    left: '0.25rem',
    fontSize: '0.62rem',
  } as CSSProperties,
  chipRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  noteChip: {
    display: 'inline-flex',
    gap: '0.4rem',
    alignItems: 'center',
    padding: '0.45rem 0.72rem',
    borderRadius: 999,
    border: '1px solid rgba(125,211,252,0.18)',
    background: 'rgba(2,6,23,0.66)',
    color: '#f8fafc',
    fontSize: '0.8rem',
  } as CSSProperties,
  eventList: {
    display: 'grid',
    gap: '0.5rem',
    maxHeight: '15rem',
    overflow: 'auto',
  } as CSSProperties,
  event: (type: MidiEventType) => ({
    display: 'inline-flex',
    gap: '0.45rem',
    alignItems: 'center',
    padding: '0.45rem 0.72rem',
    borderRadius: 999,
    border: `1px solid ${type === 'note_on' ? 'rgba(45,212,191,0.4)' : 'rgba(251,191,36,0.35)'}`,
    background: 'rgba(2,6,23,0.66)',
    color: '#f8fafc',
    fontSize: '0.8rem',
  } as CSSProperties),
  analyzerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
    gap: '0.75rem',
  } as CSSProperties,
  analyzerCard: {
    display: 'grid',
    gap: '0.4rem',
    padding: '0.8rem',
    borderRadius: 14,
    background: 'rgba(2,6,23,0.54)',
    border: '1px solid rgba(148,163,184,0.14)',
  } as CSSProperties,
  statusList: {
    display: 'grid',
    gap: '0.45rem',
  } as CSSProperties,
  routeRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 7rem auto auto auto',
    gap: '0.55rem',
    alignItems: 'end',
  } as CSSProperties,
  routeInput: {
    minHeight: '2.5rem',
    padding: '0.62rem 0.75rem',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(2,6,23,0.62)',
    color: '#f8fafc',
    width: '100%',
  } as CSSProperties,
  checkboxLabel: {
    display: 'inline-flex',
    gap: '0.35rem',
    alignItems: 'center',
    fontSize: '0.8rem',
    color: '#e2e8f0',
    minHeight: '2.5rem',
  } as CSSProperties,
  warningRow: {
    display: 'flex',
    gap: '0.55rem',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as CSSProperties,
  empty: {
    fontSize: '0.84rem',
    color: 'rgba(203,213,225,0.72)',
  } as CSSProperties,
  footerStatus: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    fontSize: '0.82rem',
  } as CSSProperties,
} as const

interface SynthForgeCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function SynthForgeCardBase({
  plugin,
  accentColor = '#38d6c4',
  compact = false,
  onBypassToggle,
  onOpenMidiMappings,
}: SynthForgeCardProps) {
  useWebSocketConnection()

  const queryClient = useQueryClient()
  const [workspace, setWorkspace] = useState<WorkspaceTab>('sound')
  const [activePart, setActivePart] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedBank, setSelectedBank] = useState(0)
  const [selectedProgram, setSelectedProgram] = useState(0)
  const [performanceDraft, setPerformanceDraft] = useState<SynthForgePerformanceConfig>({
    master_transpose: 0,
    velocity_curve: 0,
    pitch_bend_range: 2,
    mono_mode: false,
    legato: false,
  })
  const [streamingDraft, setStreamingDraft] = useState<SynthForgeStreamingConfig>(DEFAULT_STREAMING)
  const [hotReloadDraft, setHotReloadDraft] = useState<SynthForgeHotReloadStatus>(DEFAULT_HOT_RELOAD)
  const [scalaDraft, setScalaDraft] = useState<SynthForgeScalaTuning>(DEFAULT_SCALA)
  const [mpeDraft, setMpeDraft] = useState<SynthForgeMpeConfig>(DEFAULT_MPE)
  const [modMatrixDraft, setModMatrixDraft] = useState<SynthForgeModMatrixRoute[]>([])
  const [patchDraft, setPatchDraft] = useState({ bank: 0, program: 0, name: 'Part 1 Patch' })
  const [renderDraft, setRenderDraft] = useState({ outputPath: defaultRenderPath(0), durationMs: DEFAULT_RENDER_DURATION_MS })
  const [activeNotes, setActiveNotes] = useState<Record<string, MidiNoteState>>({})
  const [noteEvents, setNoteEvents] = useState<MidiNoteEvent[]>([])
  const [noteApiError, setNoteApiError] = useState('')

  const qwertyHeldRef = useRef<Record<string, number>>({})
  const pointerHeldRef = useRef<Record<number, boolean>>({})

  const partsQuery = useQuery({
    queryKey: ['synthforge', 'parts'],
    queryFn: () => synthforgeApi.getParts(),
  })

  const voicesQuery = useQuery({
    queryKey: ['synthforge', 'voices'],
    queryFn: () => synthforgeApi.getVoices(),
    refetchInterval: 900,
  })

  const statusQuery = useQuery({
    queryKey: ['synthforge', 'status', activePart],
    queryFn: () => synthforgeApi.getSfzStatus(activePart),
    refetchInterval: 1500,
  })

  const performanceQuery = useQuery({
    queryKey: ['synthforge', 'performance', activePart],
    queryFn: () => synthforgeApi.getPerformance(activePart),
  })

  const analyzerQuery = useQuery({
    queryKey: ['synthforge', 'analyzer', activePart],
    queryFn: () => synthforgeApi.getPartAnalyzerFrame(activePart),
    refetchInterval: 900,
  })

  const libraryQuery = useQuery({
    queryKey: ['soundfonts', 'synthforge', 'sampler-library'],
    queryFn: () => soundfontApi.listSoundfonts({ limit: 300, include_presets: true }),
    staleTime: 20_000,
  })

  const allLibraryItems = useMemo(() => (libraryQuery.data?.soundfonts ?? []) as SoundFont[], [libraryQuery.data])
  const selectedItem = useMemo(
    () => allLibraryItems.find((item) => item.path === selectedPath) ?? null,
    [allLibraryItems, selectedPath],
  )
  const isSelectedSoundFont = useMemo(() => {
    if (selectedItem) return selectedItem.format === 'sf2' || selectedItem.format === 'sf3'
    return selectedPath.toLowerCase().endsWith('.sf2') || selectedPath.toLowerCase().endsWith('.sf3')
  }, [selectedItem, selectedPath])
  const isSelectedSfz = useMemo(() => {
    if (selectedItem) return selectedItem.format === 'sfz'
    return selectedPath.toLowerCase().endsWith('.sfz')
  }, [selectedItem, selectedPath])

  const presetsQuery = useQuery({
    queryKey: ['soundfonts', 'presets', selectedPath],
    queryFn: () => soundfontApi.getPresets(selectedPath),
    enabled: Boolean(selectedPath) && isSelectedSoundFont,
    staleTime: 20_000,
  })

  const patchesQuery = useQuery({
    queryKey: ['synthforge', 'patches'],
    queryFn: () => synthforgeApi.getPatches(),
    enabled: workspace === 'sound',
    staleTime: 20_000,
  })

  const backendQuery = useQuery({
    queryKey: ['synthforge', 'backend', activePart],
    queryFn: () => synthforgeApi.getPartBackendStatus(activePart),
    enabled: workspace === 'engine' || workspace === 'advanced',
  })

  const streamingQuery = useQuery({
    queryKey: ['synthforge', 'streaming', activePart],
    queryFn: () => synthforgeApi.getStreamingConfig(activePart),
    enabled: workspace === 'engine' || workspace === 'advanced',
  })

  const hotReloadQuery = useQuery({
    queryKey: ['synthforge', 'hotReload', activePart],
    queryFn: () => synthforgeApi.getHotReload(activePart),
    enabled: workspace === 'engine' || workspace === 'advanced',
  })

  const scalaQuery = useQuery({
    queryKey: ['synthforge', 'scala', activePart],
    queryFn: () => synthforgeApi.getScalaTuning(activePart),
    enabled: workspace === 'advanced',
  })

  const mpeQuery = useQuery({
    queryKey: ['synthforge', 'mpe', activePart],
    queryFn: () => synthforgeApi.getMpeConfig(activePart),
    enabled: workspace === 'advanced',
  })

  const modMatrixQuery = useQuery({
    queryKey: ['synthforge', 'modMatrix', activePart],
    queryFn: () => synthforgeApi.getModMatrixRoutes(activePart),
    enabled: workspace === 'advanced',
  })

  const freezeQuery = useQuery({
    queryKey: ['synthforge', 'freeze', activePart],
    queryFn: () => synthforgeApi.getFreezeStatus(activePart),
    enabled: workspace === 'engine' || workspace === 'advanced',
  })

  const currentPart = useMemo(() => {
    return partsQuery.data?.find((part) => part.part_index === activePart) ?? defaultPart(activePart)
  }, [activePart, partsQuery.data])

  const partChannel = currentPart.midi_channel >= 1 && currentPart.midi_channel <= 16 ? currentPart.midi_channel : activePart + 1

  const libraryItems = useMemo(() => {
    const lowered = search.trim().toLowerCase()
    return allLibraryItems.filter((item) => !lowered || item.name.toLowerCase().includes(lowered) || item.library.toLowerCase().includes(lowered))
  }, [allLibraryItems, search])

  const compatibleLibraryCount = useMemo(
    () => allLibraryItems.filter((item) => item.format === 'sf2' || item.format === 'sf3' || item.format === 'sfz').length,
    [allLibraryItems],
  )

  const presets = presetsQuery.data?.presets ?? []
  const banks = useMemo(
    () => Array.from(new Set(presets.map((preset) => preset.bank))).sort((a, b) => a - b),
    [presets],
  )
  const filteredPresets = useMemo(
    () => presets.filter((preset) => preset.bank === selectedBank),
    [presets, selectedBank],
  )
  const selectedPreset = filteredPresets.find((preset) => preset.program === selectedProgram)

  const keyboardNotes = useMemo(
    () => Array.from({ length: KEYBOARD_MAX_NOTE - KEYBOARD_MIN_NOTE + 1 }, (_, index) => KEYBOARD_MIN_NOTE + index),
    [],
  )

  const activeVelocityByNote = useMemo(() => {
    const velocities = new Map<number, number>()
    Object.values(activeNotes).forEach((entry) => {
      velocities.set(entry.note, Math.max(velocities.get(entry.note) ?? 0, entry.velocity))
    })
    return velocities
  }, [activeNotes])

  const activeVoiceCount = voicesQuery.data?.active_voices ?? 0
  const peakVoiceCount = voicesQuery.data?.peak_voices ?? 0
  const partVoiceCount = voicesQuery.data?.voices_per_part?.[activePart] ?? 0
  const cpuPercent = voicesQuery.data?.cpu_percent ?? 0
  const analyzerFrame: SynthForgeAnalyzerFrame | undefined = analyzerQuery.data
  const backendStatus: SynthForgeBackendStatus | undefined = backendQuery.data
  const freezeStatus: SynthForgeFreezeStatus | undefined = freezeQuery.data

  const loadedDisplayName = statusQuery.data?.active_preset_name
    || selectedPreset?.name
    || selectedItem?.name
    || pathTail(statusQuery.data?.soundfont_path || statusQuery.data?.sfz_path || selectedPath)
    || 'No instrument loaded'
  const loadedPath = statusQuery.data?.soundfont_path || statusQuery.data?.sfz_path || selectedPath

  const isBusy = [
    partsQuery.isPending,
    statusQuery.isPending,
    performanceQuery.isPending,
  ].some(Boolean) || [
    voicesQuery.isPending,
    libraryQuery.isPending && workspace === 'sound',
  ].some(Boolean)

  const invalidatePartQueries = (partIndex: number) => {
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'parts'] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'voices'] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'status', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'performance', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'analyzer', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'backend', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'streaming', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'hotReload', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'scala', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'mpe', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'modMatrix', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'freeze', partIndex] })
    queryClient.invalidateQueries({ queryKey: ['synthforge', 'patches'] })
  }

  const setPartConfigMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgePartConfig }) =>
      synthforgeApi.setPartConfig(partIndex, config),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const loadSoundFontMutation = useMutation({
    mutationFn: ({ partIndex, path, bank, program, presetName }: { partIndex: number; path: string; bank: number; program: number; presetName: string }) =>
      synthforgeApi.loadSoundFont(partIndex, path, bank, program, presetName),
    onSuccess: (_, variables) => {
      setSelectedPath(variables.path)
      invalidatePartQueries(variables.partIndex)
    },
  })

  const loadSfzMutation = useMutation({
    mutationFn: ({ partIndex, path }: { partIndex: number; path: string }) =>
      synthforgeApi.loadSfz(partIndex, path),
    onSuccess: (_, variables) => {
      setSelectedPath(variables.path)
      invalidatePartQueries(variables.partIndex)
    },
  })

  const setPerformanceMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgePerformanceConfig }) =>
      synthforgeApi.setPerformance(partIndex, config),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const loadPatchMutation = useMutation({
    mutationFn: ({ partIndex, bank, program }: { partIndex: number; bank: number; program: number }) =>
      synthforgeApi.loadPatch(partIndex, bank, program),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const savePatchMutation = useMutation({
    mutationFn: ({ partIndex, bank, program, name }: { partIndex: number; bank: number; program: number; name: string }) =>
      synthforgeApi.savePatch(partIndex, bank, program, name),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setSamplerBackendMutation = useMutation({
    mutationFn: ({ partIndex, backend }: { partIndex: number; backend: 'native' | 'sfizz' }) =>
      synthforgeApi.setSamplerBackend(partIndex, backend),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setStreamingMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgeStreamingConfig }) =>
      synthforgeApi.setStreamingConfig(partIndex, config),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setHotReloadMutation = useMutation({
    mutationFn: ({ partIndex, enabled, intervalMs }: { partIndex: number; enabled: boolean; intervalMs: number }) =>
      synthforgeApi.setHotReload(partIndex, enabled, intervalMs),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const reloadSfzMutation = useMutation({
    mutationFn: (partIndex: number) => synthforgeApi.reloadSfzIfChanged(partIndex),
    onSuccess: (_, partIndex) => invalidatePartQueries(partIndex),
  })

  const loadScalaMutation = useMutation({
    mutationFn: ({ partIndex, scalaPath, rootKey, referenceHz }: { partIndex: number; scalaPath: string; rootKey: number; referenceHz: number }) =>
      synthforgeApi.loadScalaTuning(partIndex, scalaPath, rootKey, referenceHz),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setMpeMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgeMpeConfig }) =>
      synthforgeApi.setMpeConfig(partIndex, config),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setModMatrixMutation = useMutation({
    mutationFn: ({ partIndex, routes }: { partIndex: number; routes: SynthForgeModMatrixRoute[] }) =>
      synthforgeApi.setModMatrixRoutes(partIndex, routes),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const setFreezeMutation = useMutation({
    mutationFn: ({ partIndex, enabled }: { partIndex: number; enabled: boolean }) =>
      synthforgeApi.setFreeze(partIndex, enabled),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  const renderPartMutation = useMutation({
    mutationFn: ({ partIndex, outputPath, durationMs }: { partIndex: number; outputPath: string; durationMs: number }) =>
      synthforgeApi.renderPartToFile(partIndex, outputPath, durationMs),
    onSuccess: (_, variables) => invalidatePartQueries(variables.partIndex),
  })

  useEffect(() => {
    const loadedSoundFontPath = statusQuery.data?.soundfont_path ?? ''
    const loadedSfzPath = statusQuery.data?.sfz_path ?? ''
    if (loadedSoundFontPath) {
      setSelectedPath(loadedSoundFontPath)
      setSelectedBank(statusQuery.data?.active_bank ?? 0)
      setSelectedProgram(statusQuery.data?.active_program ?? 0)
    } else if (loadedSfzPath) {
      setSelectedPath(loadedSfzPath)
    }
  }, [statusQuery.data])

  useEffect(() => {
    if (!selectedPath && allLibraryItems.length > 0) {
      setSelectedPath(allLibraryItems[0].path)
    }
  }, [allLibraryItems, selectedPath])

  useEffect(() => {
    if (banks.length > 0 && !banks.includes(selectedBank)) {
      setSelectedBank(banks[0])
    }
  }, [banks, selectedBank])

  useEffect(() => {
    if (filteredPresets.length > 0 && !filteredPresets.some((preset) => preset.program === selectedProgram)) {
      setSelectedProgram(filteredPresets[0].program)
    }
  }, [filteredPresets, selectedProgram])

  useEffect(() => {
    if (performanceQuery.data) {
      setPerformanceDraft(performanceQuery.data)
    }
  }, [performanceQuery.data])

  useEffect(() => {
    if (streamingQuery.data) {
      setStreamingDraft(streamingQuery.data)
    }
  }, [streamingQuery.data])

  useEffect(() => {
    if (hotReloadQuery.data) {
      setHotReloadDraft(hotReloadQuery.data)
    }
  }, [hotReloadQuery.data])

  useEffect(() => {
    if (scalaQuery.data) {
      setScalaDraft(scalaQuery.data)
    }
  }, [scalaQuery.data])

  useEffect(() => {
    if (mpeQuery.data) {
      setMpeDraft(mpeQuery.data)
    }
  }, [mpeQuery.data])

  useEffect(() => {
    if (modMatrixQuery.data) {
      setModMatrixDraft(modMatrixQuery.data)
    }
  }, [modMatrixQuery.data])

  useEffect(() => {
    setPatchDraft({
      bank: 0,
      program: activePart,
      name: `Part ${activePart + 1} Patch`,
    })
    setRenderDraft({
      outputPath: defaultRenderPath(activePart),
      durationMs: DEFAULT_RENDER_DURATION_MS,
    })
  }, [activePart])

  const registerNoteEvent = (type: MidiEventType, channel: number, note: number, velocity: number, source: NoteSource) => {
    const now = Date.now()
    const key = `${channel}:${note}`

    setActiveNotes((previous) => {
      const next = { ...previous }
      if (type === 'note_on' && velocity > 0) {
        next[key] = { channel, note, velocity, source, updatedAt: now }
      } else {
        delete next[key]
      }
      return next
    })

    setNoteEvents((previous) => [
      { id: `${now}-${note}-${channel}-${type}`, type, channel, note, velocity, source, updatedAt: now },
      ...previous,
    ].slice(0, MAX_NOTE_EVENTS))
  }

  const sendNoteOn = async (note: number, source: NoteSource, velocity: number) => {
    registerNoteEvent('note_on', partChannel, note, velocity, source)
    try {
      await synthforgeApi.noteOn(partChannel, note, velocity)
      setNoteApiError('')
    } catch {
      setNoteApiError('MIDI note injection unavailable.')
    }
  }

  const sendNoteOff = async (note: number, source: NoteSource) => {
    registerNoteEvent('note_off', partChannel, note, 0, source)
    try {
      await synthforgeApi.noteOff(partChannel, note, 0)
      setNoteApiError('')
    } catch {
      setNoteApiError('MIDI note injection unavailable.')
    }
  }

  useWebSocketTopic('midi_activity', (_topic, message) => {
    if (message.type !== 'midi_message') return
    const payload = message.data ?? {}
    const type = String(payload.type ?? '')
    if (type !== 'note_on' && type !== 'note_off') return

    registerNoteEvent(
      type === 'note_on' && Number(payload.data2 ?? 0) === 0 ? 'note_off' : (type as MidiEventType),
      Number(payload.channel),
      Number(payload.data1),
      Number(payload.data2 ?? 0),
      'external',
    )
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return
      const offset = QWERTY_NOTE_OFFSETS[event.key.toLowerCase()]
      if (offset === undefined || qwertyHeldRef.current[event.key]) return

      const note = clamp(KEYBOARD_BASE_NOTE + offset, 0, 127)
      qwertyHeldRef.current[event.key] = note
      void sendNoteOn(note, 'qwerty', 108)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const note = qwertyHeldRef.current[event.key]
      if (note === undefined) return
      delete qwertyHeldRef.current[event.key]
      void sendNoteOff(note, 'qwerty')
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [partChannel])

  const updatePartConfig = (patch: Partial<SynthForgePartConfig>) => {
    setPartConfigMutation.mutate({
      partIndex: activePart,
      config: { ...currentPart, ...patch, part_index: activePart },
    })
  }

  const handlePointerDown = (note: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerHeldRef.current[note]) return
    pointerHeldRef.current[note] = true
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = 1 - clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1)
    const velocity = clamp(Math.round(24 + (ratio * 103)), 1, 127)
    void sendNoteOn(note, 'on-screen', velocity)
  }

  const handlePointerUp = (note: number) => {
    if (!pointerHeldRef.current[note]) return
    delete pointerHeldRef.current[note]
    void sendNoteOff(note, 'on-screen')
  }

  const performanceParams: ParamSlot[] = [
    {
      label: 'Transpose',
      value: performanceDraft.master_transpose,
      min: -36, max: 36, step: 1, defaultValue: 0,
      unit: 'st',
      onChange: (value) => setPerformanceDraft((previous) => ({ ...previous, master_transpose: value })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.TRANSPOSE },
    },
    {
      label: 'Vel Curve',
      value: performanceDraft.velocity_curve,
      min: -1, max: 1, step: 0.05, defaultValue: 0,
      onChange: (value) => setPerformanceDraft((previous) => ({ ...previous, velocity_curve: value })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.VELOCITY_CURVE },
    },
    {
      label: 'PB Range',
      value: performanceDraft.pitch_bend_range,
      min: 1, max: 48, step: 1, defaultValue: 2,
      unit: 'st',
      onChange: (value) => setPerformanceDraft((previous) => ({ ...previous, pitch_bend_range: value })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.PITCH_BEND_RANGE },
    },
    {
      label: 'Level',
      value: currentPart.level,
      min: 0, max: 1, step: 0.01, defaultValue: 1,
      onChange: (value) => updatePartConfig({ level: value }),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.LEVEL },
    },
  ]

  const visualization = (
    <div style={S.hero}>
      <div style={S.heroTop}>
        <div style={S.heroCopy}>
          <span style={S.eyebrow}>SynthForge Workstation</span>
          <div style={S.heroTitleRow}>
            <h3 style={S.heroTitle}>SynthForge</h3>
            <Tag type={statusQuery.data?.engine_available ? 'green' : 'red'}>{statusQuery.data?.engine_available ? 'Ready' : 'Offline'}</Tag>
            <Tag type="cool-gray">{statusQuery.data?.soundfont_format?.toUpperCase() || (statusQuery.data?.sfz_path ? 'SFZ' : 'Empty')}</Tag>
          </div>
          <p style={S.heroLead}>{loadedDisplayName}</p>
          <p style={S.heroSub}>
            Part {activePart + 1} on CH {partChannel} routed to {currentPart.output_bus}.{' '}
            {loadedPath ? `Loaded from ${pathTail(loadedPath)}.` : 'Choose a SoundFont, SFZ, or stored patch to begin.'}
          </p>
          <div style={S.metricRail}>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>Voices</span>
              <span style={S.metricValue}>{activeVoiceCount}</span>
            </div>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>Part Voices</span>
              <span style={S.metricValue}>{partVoiceCount}</span>
            </div>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>CPU</span>
              <span style={S.metricValue}>{cpuPercent.toFixed(1)}%</span>
            </div>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>Regions</span>
              <span style={S.metricValue}>{statusQuery.data?.region_count ?? 0}</span>
            </div>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>Samples</span>
              <span style={S.metricValue}>{statusQuery.data?.loaded_sample_count ?? 0}</span>
            </div>
            <div style={S.metricTile}>
              <span style={S.metricLabel}>Peak Voices</span>
              <span style={S.metricValue}>{peakVoiceCount}</span>
            </div>
          </div>
        </div>

        <div style={S.meterCluster}>
          <div style={S.meterCard}>
            <div style={S.meterRow}>
              <span style={S.meterLabel}>Left</span>
              <div style={S.meterTrack}>
                <div style={{ ...S.meterFill('left'), width: peakPercent(analyzerFrame?.peak_left) }} />
              </div>
              <span style={S.meterValue}>{peakPercent(analyzerFrame?.peak_left)}</span>
            </div>
            <div style={S.meterRow}>
              <span style={S.meterLabel}>Right</span>
              <div style={S.meterTrack}>
                <div style={{ ...S.meterFill('right'), width: peakPercent(analyzerFrame?.peak_right) }} />
              </div>
              <span style={S.meterValue}>{peakPercent(analyzerFrame?.peak_right)}</span>
            </div>
            <div style={S.footerStatus}>
              <span>MIDI events: {analyzerFrame?.midi_events ?? 0}</span>
              <span>Active voices: {analyzerFrame?.active_voices ?? 0}</span>
            </div>
          </div>
          <div style={S.meterCard}>
            <span style={S.metricLabel}>Loaded Source</span>
            <span style={S.metricValue}>{selectedItem?.library || statusQuery.data?.engine || 'Sampler engine'}</span>
            <span style={S.heroSub}>
              {selectedItem ? `${selectedItem.format.toUpperCase()} • ${formatBytes(selectedItem.size)}` : (loadedPath || 'Waiting for instrument selection')}
            </span>
          </div>
        </div>
      </div>

      <div style={S.partStrip}>
        {Array.from({ length: 16 }, (_, index) => {
          const part = partsQuery.data?.find((entry) => entry.part_index === index) ?? defaultPart(index)
          const voices = voicesQuery.data?.voices_per_part?.[index] ?? 0
          return (
            <button key={index} style={S.partPill(index === activePart)} onClick={() => setActivePart(index)}>
              <strong>P{index + 1}</strong>
              <span style={S.partPillSub}>CH {part.midi_channel === 0 ? 'OMNI' : part.midi_channel}</span>
              <span style={S.partPillSub}>{voices}v</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const transportContent = (
    <div style={{ display: 'grid', gap: '0.95rem' }}>
      <div style={S.fieldGrid}>
        <SelectField label="Part" value={activePart} onChange={(value) => setActivePart(Number(value))}>
          {Array.from({ length: 16 }, (_, index) => <option key={index} value={index}>Part {index + 1}</option>)}
        </SelectField>
        <SelectField label="MIDI Channel" value={currentPart.midi_channel} onChange={(value) => updatePartConfig({ midi_channel: Number(value) })}>
          <option value={0}>OMNI</option>
          {Array.from({ length: 16 }, (_, index) => <option key={index + 1} value={index + 1}>Channel {index + 1}</option>)}
        </SelectField>
        <SelectField label="Output Bus" value={currentPart.output_bus} onChange={(value) => updatePartConfig({ output_bus: value })}>
          {OUTPUT_BUSES.map((bus) => <option key={bus} value={bus}>{bus}</option>)}
        </SelectField>
        <NumericField label="Pan" value={currentPart.pan} min={-1} max={1} step={0.01} onChange={(value) => updatePartConfig({ pan: value })} />
      </div>

      <div style={S.toggleRow}>
        <button style={S.actionButton(performanceDraft.mono_mode)} onClick={() => setPerformanceDraft((previous) => ({ ...previous, mono_mode: !previous.mono_mode }))}>Mono</button>
        <button style={S.actionButton(performanceDraft.legato)} onClick={() => setPerformanceDraft((previous) => ({ ...previous, legato: !previous.legato }))}>Legato</button>
        <button style={S.actionButton(currentPart.mute)} onClick={() => updatePartConfig({ mute: !currentPart.mute })}>Mute</button>
        <button style={S.actionButton(currentPart.solo)} onClick={() => updatePartConfig({ solo: !currentPart.solo })}>Solo</button>
        <button
          style={S.actionButton(false, 'primary')}
          disabled={setPerformanceMutation.isPending}
          onClick={() => setPerformanceMutation.mutate({ partIndex: activePart, config: performanceDraft })}
        >
          {setPerformanceMutation.isPending ? 'Applying…' : 'Apply Performance'}
        </button>
      </div>
    </div>
  )

  const soundWorkspace = (
    <div style={S.dualGrid}>
      <PanelFrame
        title="Library Browser"
        meta={`${libraryItems.length}/${allLibraryItems.length || 0} visible • ${compatibleLibraryCount} compatible`}
      >
        <TextField label="Search Library" value={search} onChange={setSearch} placeholder="Search SoundFonts and SFZ instruments" />
        <div style={S.list}>
          {libraryItems.map((item) => (
            <button key={item.path} style={S.selectableRow(selectedPath === item.path)} onClick={() => setSelectedPath(item.path)}>
              <strong>{item.name}</strong>
              <span style={S.selectableMeta}>
                {item.library} • {item.format.toUpperCase()} • {item.format === 'sfz' ? 'SFZ instrument' : `${item.preset_count ?? 0} presets`} • {formatBytes(item.size)}
              </span>
            </button>
          ))}
          {libraryItems.length === 0 && <div style={S.empty}>No SoundFonts or SFZ instruments match the current search.</div>}
        </div>
      </PanelFrame>

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <PanelFrame
          title="Instrument Detail"
          meta={selectedItem ? `${selectedItem.library} • ${selectedItem.category}` : 'Current selection'}
          action={(loadSoundFontMutation.isPending || loadSfzMutation.isPending) ? <InlineLoading description="Loading instrument" status="active" /> : null}
        >
          <div style={S.statusList}>
            <span style={S.metricLabel}>Selected</span>
            <span style={S.metricValue}>{selectedItem?.name || pathTail(selectedPath) || 'No item selected'}</span>
            <span style={S.heroSub}>
              {selectedItem ? `${selectedItem.format.toUpperCase()} asset from ${selectedItem.library}` : 'Select a library item to choose a SoundFont preset, SFZ instrument, or saved patch.'}
            </span>
          </div>

          {isSelectedSoundFont ? (
            <>
              <div style={S.fieldGrid}>
                <SelectField label="Bank" value={selectedBank} onChange={(value) => setSelectedBank(Number(value))}>
                  {banks.map((bank) => <option key={bank} value={bank}>Bank {bank}</option>)}
                </SelectField>
                <SelectField label="Program" value={selectedProgram} onChange={(value) => setSelectedProgram(Number(value))}>
                  {filteredPresets.map((preset) => (
                    <option key={`${preset.bank}:${preset.program}`} value={preset.program}>
                      {preset.program.toString().padStart(3, '0')} • {preset.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div style={S.actionRow}>
                <button
                  style={S.actionButton(false, 'primary')}
                  disabled={!selectedPreset || loadSoundFontMutation.isPending}
                  onClick={() => {
                    if (!selectedPreset) return
                    loadSoundFontMutation.mutate({
                      partIndex: activePart,
                      path: selectedPath,
                      bank: selectedPreset.bank,
                      program: selectedPreset.program,
                      presetName: selectedPreset.name,
                    })
                  }}
                >
                  {selectedPreset ? `Load ${selectedPreset.name}` : 'Load Preset'}
                </button>
              </div>
              <div style={S.list}>
                {filteredPresets.map((preset) => (
                  <button
                    key={`${preset.bank}:${preset.program}:${preset.name}`}
                    style={S.selectableRow(selectedProgram === preset.program)}
                    onClick={() => setSelectedProgram(preset.program)}
                  >
                    <strong>{preset.program.toString().padStart(3, '0')} • {preset.name}</strong>
                    <span style={S.selectableMeta}>Bank {preset.bank}</span>
                  </button>
                ))}
              </div>
            </>
          ) : isSelectedSfz ? (
            <div style={S.actionRow}>
              <button
                style={S.actionButton(false, 'primary')}
                disabled={!selectedPath || loadSfzMutation.isPending}
                onClick={() => {
                  if (!selectedPath) return
                  loadSfzMutation.mutate({ partIndex: activePart, path: selectedPath })
                }}
              >
                Load SFZ Instrument
              </button>
            </div>
          ) : (
            <div style={S.empty}>Select a compatible `.sf2`, `.sf3`, or `.sfz` asset.</div>
          )}
        </PanelFrame>

        <PanelFrame title="Stored Patches" meta={`${patchesQuery.data?.length ?? 0} patches`}>
          <div style={S.list}>
            {(patchesQuery.data ?? []).map((patch) => (
              <button
                key={`${patch.bank}:${patch.program}:${patch.name}`}
                style={S.selectableRow(false)}
                onClick={() => loadPatchMutation.mutate({ partIndex: activePart, bank: patch.bank, program: patch.program })}
              >
                <strong>{patch.bank}:{patch.program.toString().padStart(3, '0')} • {patch.name}</strong>
                <span style={S.selectableMeta}>{patch.category} • {patch.author}</span>
              </button>
            ))}
            {(patchesQuery.data?.length ?? 0) === 0 && <div style={S.empty}>No stored SynthForge patches are available yet.</div>}
          </div>
          <div style={S.fieldGrid}>
            <NumericField label="Patch Bank" value={patchDraft.bank} min={0} max={16384} step={1} onChange={(value) => setPatchDraft((previous) => ({ ...previous, bank: value }))} />
            <NumericField label="Patch Program" value={patchDraft.program} min={0} max={16384} step={1} onChange={(value) => setPatchDraft((previous) => ({ ...previous, program: value }))} />
            <TextField label="Patch Name" value={patchDraft.name} onChange={(value) => setPatchDraft((previous) => ({ ...previous, name: value }))} placeholder="Lead Split" />
          </div>
          <div style={S.actionRow}>
            <button
              style={S.actionButton(false, 'primary')}
              disabled={savePatchMutation.isPending || patchDraft.name.trim().length === 0}
              onClick={() => savePatchMutation.mutate({
                partIndex: activePart,
                bank: patchDraft.bank,
                program: patchDraft.program,
                name: patchDraft.name.trim(),
              })}
            >
              {savePatchMutation.isPending ? 'Saving…' : 'Save Patch'}
            </button>
          </div>
        </PanelFrame>
      </div>
    </div>
  )

  const rackWorkspace = (
    <div style={S.dualGrid}>
      <PanelFrame title="16-Part Rack" meta="Quick-select and monitor multitimbral parts">
        <div style={S.rackGrid}>
          {Array.from({ length: 16 }, (_, index) => {
            const part = partsQuery.data?.find((entry) => entry.part_index === index) ?? defaultPart(index)
            const voices = voicesQuery.data?.voices_per_part?.[index] ?? 0
            return (
              <button key={index} style={S.rackTile(index === activePart)} onClick={() => setActivePart(index)}>
                <div style={S.rackTileHeader}>
                  <strong style={S.rackTileValue}>Part {index + 1}</strong>
                  <span style={S.tinyMeta}>{voices} voices</span>
                </div>
                <span style={S.tinyMeta}>CH {part.midi_channel === 0 ? 'OMNI' : part.midi_channel} • {part.output_bus}</span>
                <span style={S.tinyMeta}>Level {Math.round(part.level * 100)}% • Pan {part.pan.toFixed(2)}</span>
                <span style={S.tinyMeta}>
                  {part.mute ? 'Muted' : part.solo ? 'Solo' : 'Ready'}
                </span>
              </button>
            )
          })}
        </div>
      </PanelFrame>

      <PanelFrame title={`Part ${activePart + 1} Editor`} meta={`CH ${partChannel} • ${currentPart.output_bus}`}>
        <div style={S.fieldGrid}>
          <NumericField label="Level" value={currentPart.level} min={0} max={1} step={0.01} onChange={(value) => updatePartConfig({ level: value })} />
          <NumericField label="Pan" value={currentPart.pan} min={-1} max={1} step={0.01} onChange={(value) => updatePartConfig({ pan: value })} />
          <SelectField label="MIDI Channel" value={currentPart.midi_channel} onChange={(value) => updatePartConfig({ midi_channel: Number(value) })}>
            <option value={0}>OMNI</option>
            {Array.from({ length: 16 }, (_, index) => <option key={index + 1} value={index + 1}>Channel {index + 1}</option>)}
          </SelectField>
          <SelectField label="Output Bus" value={currentPart.output_bus} onChange={(value) => updatePartConfig({ output_bus: value })}>
            {OUTPUT_BUSES.map((bus) => <option key={bus} value={bus}>{bus}</option>)}
          </SelectField>
        </div>
        <div style={S.toggleRow}>
          <button style={S.actionButton(currentPart.mute)} onClick={() => updatePartConfig({ mute: !currentPart.mute })}>Mute</button>
          <button style={S.actionButton(currentPart.solo)} onClick={() => updatePartConfig({ solo: !currentPart.solo })}>Solo</button>
        </div>
        <div style={S.analyzerGrid}>
          <div style={S.analyzerCard}>
            <span style={S.metricLabel}>Instrument</span>
            <strong style={S.rackTileValue}>{loadedDisplayName}</strong>
            <span style={S.tinyMeta}>{pathTail(loadedPath)}</span>
          </div>
          <div style={S.analyzerCard}>
            <span style={S.metricLabel}>Part Voices</span>
            <strong style={S.rackTileValue}>{partVoiceCount}</strong>
            <span style={S.tinyMeta}>Peak system voices {peakVoiceCount}</span>
          </div>
        </div>
      </PanelFrame>
    </div>
  )

  const playWorkspace = (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <PanelFrame title="Performance Keyboard" meta="Mouse velocity follows click height. QWERTY mirror: Z-M and Q-U rows.">
        <div style={S.keyboard(compact)}>
          {keyboardNotes.map((note) => {
            const velocity = activeVelocityByNote.get(note) ?? 0
            const black = isBlackNote(note)
            return (
              <button
                key={note}
                style={black ? S.blackKey(velocity > 0, accentColor) : S.whiteKey(velocity > 0, accentColor)}
                onPointerDown={handlePointerDown(note)}
                onPointerUp={() => handlePointerUp(note)}
                onPointerLeave={() => handlePointerUp(note)}
                onPointerCancel={() => handlePointerUp(note)}
                title={`${noteLabel(note)} (${note})`}
              >
                <span style={S.keyLabel}>{noteLabel(note)}</span>
              </button>
            )
          })}
        </div>
      </PanelFrame>

      <div style={S.dualGrid}>
        <PanelFrame title="Active Notes" meta={`${Object.keys(activeNotes).length} currently active`}>
          <div style={S.chipRow}>
            {Object.values(activeNotes).map((item) => (
              <div key={`${item.channel}:${item.note}`} style={S.noteChip}>
                <strong>{noteLabel(item.note)}</strong>
                <span>CH {item.channel}</span>
                <span>VEL {item.velocity}</span>
                <span>{item.source}</span>
              </div>
            ))}
            {Object.keys(activeNotes).length === 0 && <div style={S.empty}>No active notes. Play from the on-screen keyboard or an external controller.</div>}
          </div>
        </PanelFrame>

        <PanelFrame title="MIDI Event Log" meta="Most recent note activity across external and injected sources">
          <div style={S.eventList}>
            {noteEvents.map((event) => (
              <div key={event.id} style={S.event(event.type)}>
                <strong>{event.type === 'note_on' ? 'ON' : 'OFF'}</strong>
                <span>{noteLabel(event.note)}</span>
                <span>CH {event.channel}</span>
                <span>VEL {event.velocity}</span>
                <span>{event.source}</span>
              </div>
            ))}
            {noteEvents.length === 0 && <div style={S.empty}>No MIDI note events captured yet.</div>}
          </div>
        </PanelFrame>
      </div>
    </div>
  )

  const engineWorkspace = (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={S.dualGrid}>
        <PanelFrame title="Sampler Backend" meta={backendStatus ? `Backend ${backendStatus.backend}` : 'Backend configuration'}>
          <div style={S.fieldGrid}>
            <SelectField
              label="Playback Backend"
              value={backendStatus?.backend || 'native'}
              onChange={(value) => setSamplerBackendMutation.mutate({ partIndex: activePart, backend: value as 'native' | 'sfizz' })}
            >
              <option value="native">Native</option>
              <option value="sfizz">Sfizz</option>
            </SelectField>
          </div>
          <div style={S.statusList}>
            <span style={S.tinyMeta}>Sfizz available: {backendStatus?.sfizz_available ? 'Yes' : 'No'}</span>
            <span style={S.tinyMeta}>Sfizz loaded: {backendStatus?.sfizz_loaded ? 'Yes' : 'No'}</span>
            <span style={S.tinyMeta}>Groups: {backendStatus?.group_count ?? 0} • Preloaded samples: {backendStatus?.preloaded_samples ?? 0}</span>
          </div>
        </PanelFrame>

        <PanelFrame title="Analyzer" meta="Active part output and callback activity">
          <div style={S.analyzerGrid}>
            <div style={S.analyzerCard}>
              <span style={S.metricLabel}>Peak L</span>
              <strong style={S.rackTileValue}>{peakPercent(analyzerFrame?.peak_left)}</strong>
              <span style={S.tinyMeta}>RMS {peakPercent(analyzerFrame?.rms_left)}</span>
            </div>
            <div style={S.analyzerCard}>
              <span style={S.metricLabel}>Peak R</span>
              <strong style={S.rackTileValue}>{peakPercent(analyzerFrame?.peak_right)}</strong>
              <span style={S.tinyMeta}>RMS {peakPercent(analyzerFrame?.rms_right)}</span>
            </div>
            <div style={S.analyzerCard}>
              <span style={S.metricLabel}>MIDI Events</span>
              <strong style={S.rackTileValue}>{analyzerFrame?.midi_events ?? 0}</strong>
              <span style={S.tinyMeta}>Active voices {analyzerFrame?.active_voices ?? 0}</span>
            </div>
          </div>
        </PanelFrame>
      </div>

      <div style={S.dualGrid}>
        <PanelFrame title="Streaming & Interpolation" meta="Voice limits, preload, and resampling quality">
          <div style={S.fieldGrid}>
            <NumericField label="Preload" value={streamingDraft.preload_size} min={16384} max={16777216} step={1024} onChange={(value) => setStreamingDraft((previous) => ({ ...previous, preload_size: value }))} />
            <NumericField label="Max Voices" value={streamingDraft.max_voices} min={8} max={512} step={1} onChange={(value) => setStreamingDraft((previous) => ({ ...previous, max_voices: value }))} />
            <SelectField label="Interpolation" value={streamingDraft.interpolation} onChange={(value) => setStreamingDraft((previous) => ({ ...previous, interpolation: value as SynthForgeStreamingConfig['interpolation'] }))}>
              <option value="linear">Linear</option>
              <option value="hermite">Hermite</option>
              <option value="sinc">Sinc</option>
            </SelectField>
            <NumericField label="Memory Limit" value={streamingDraft.memory_limit_mb} min={64} max={8192} step={1} unit="MB" onChange={(value) => setStreamingDraft((previous) => ({ ...previous, memory_limit_mb: value }))} />
            <NumericField label="Live Quality" value={streamingDraft.quality_live} min={0} max={10} step={1} onChange={(value) => setStreamingDraft((previous) => ({ ...previous, quality_live: value }))} />
            <NumericField label="Offline Quality" value={streamingDraft.quality_freewheeling} min={0} max={10} step={1} onChange={(value) => setStreamingDraft((previous) => ({ ...previous, quality_freewheeling: value }))} />
          </div>
          <div style={S.toggleRow}>
            <button style={S.actionButton(streamingDraft.enabled)} onClick={() => setStreamingDraft((previous) => ({ ...previous, enabled: !previous.enabled }))}>
              {streamingDraft.enabled ? 'Streaming On' : 'Streaming Off'}
            </button>
            <button
              style={S.actionButton(false, 'primary')}
              disabled={setStreamingMutation.isPending}
              onClick={() => setStreamingMutation.mutate({ partIndex: activePart, config: streamingDraft })}
            >
              {setStreamingMutation.isPending ? 'Saving…' : 'Save Streaming'}
            </button>
          </div>
        </PanelFrame>

        <PanelFrame title="Hot Reload & Freeze" meta="Sampler refresh and capture workflow">
          <div style={S.fieldGrid}>
            <NumericField label="Hot Reload Interval" value={hotReloadDraft.interval_ms} min={100} max={10000} step={100} unit="ms" onChange={(value) => setHotReloadDraft((previous) => ({ ...previous, interval_ms: value }))} />
            <NumericField label="Render Length" value={renderDraft.durationMs} min={100} max={120000} step={100} unit="ms" onChange={(value) => setRenderDraft((previous) => ({ ...previous, durationMs: value }))} />
          </div>
          <TextField label="Render Output" value={renderDraft.outputPath} onChange={(value) => setRenderDraft((previous) => ({ ...previous, outputPath: value }))} placeholder={defaultRenderPath(activePart)} />
          <div style={S.toggleRow}>
            <button style={S.actionButton(hotReloadDraft.enabled)} onClick={() => setHotReloadDraft((previous) => ({ ...previous, enabled: !previous.enabled }))}>
              {hotReloadDraft.enabled ? 'Hot Reload On' : 'Hot Reload Off'}
            </button>
            <button
              style={S.actionButton(false)}
              disabled={setHotReloadMutation.isPending}
              onClick={() => setHotReloadMutation.mutate({ partIndex: activePart, enabled: hotReloadDraft.enabled, intervalMs: hotReloadDraft.interval_ms })}
            >
              {setHotReloadMutation.isPending ? 'Saving…' : 'Save Hot Reload'}
            </button>
            <button
              style={S.actionButton(false)}
              disabled={reloadSfzMutation.isPending}
              onClick={() => reloadSfzMutation.mutate(activePart)}
            >
              {reloadSfzMutation.isPending ? 'Reloading…' : 'Reload If Changed'}
            </button>
            <button
              style={S.actionButton(Boolean(freezeStatus?.freeze_enabled))}
              disabled={setFreezeMutation.isPending}
              onClick={() => setFreezeMutation.mutate({ partIndex: activePart, enabled: !(freezeStatus?.freeze_enabled ?? false) })}
            >
              {freezeStatus?.freeze_enabled ? 'Disable Freeze' : 'Enable Freeze'}
            </button>
            <button
              style={S.actionButton(false, 'primary')}
              disabled={renderPartMutation.isPending || renderDraft.outputPath.trim().length === 0}
              onClick={() => renderPartMutation.mutate({ partIndex: activePart, outputPath: renderDraft.outputPath.trim(), durationMs: renderDraft.durationMs })}
            >
              {renderPartMutation.isPending ? 'Rendering…' : 'Render Part'}
            </button>
          </div>
          <div style={S.statusList}>
            <span style={S.tinyMeta}>Pending reload: {hotReloadDraft.pending_reload ? 'Yes' : 'No'}</span>
            <span style={S.tinyMeta}>Frozen signal ready: {freezeStatus?.frozen_signal_ready ? 'Yes' : 'No'}</span>
            {freezeStatus?.render_path ? <span style={S.tinyMeta}>Last render: {freezeStatus.render_path}</span> : null}
          </div>
        </PanelFrame>
      </div>

      <PanelFrame title="Backend Diagnostics" meta="Warnings and unsupported opcode visibility">
        <div style={S.warningRow}>
          {(backendStatus?.unsupported_opcodes ?? []).map((opcode) => <Tag key={`unsupported-${opcode}`} type="red">{opcode}</Tag>)}
          {(backendStatus?.unknown_opcodes ?? []).map((opcode) => <Tag key={`unknown-${opcode}`} type="warm-gray">{opcode}</Tag>)}
          {(statusQuery.data?.warnings ?? []).map((warning) => <Tag key={warning} type="warm-gray">{warning}</Tag>)}
          {(backendStatus?.unsupported_opcodes?.length ?? 0) === 0 && (backendStatus?.unknown_opcodes?.length ?? 0) === 0 && (statusQuery.data?.warnings?.length ?? 0) === 0
            ? <div style={S.empty}>No sampler backend warnings for the active part.</div>
            : null}
        </div>
      </PanelFrame>
    </div>
  )

  const advancedWorkspace = (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={S.dualGrid}>
        <PanelFrame title="Scala Tuning" meta="Alternate tuning for the active part">
          <TextField label="Scala File" value={scalaDraft.scala_path} onChange={(value) => setScalaDraft((previous) => ({ ...previous, scala_path: value }))} placeholder="/path/to/scale.scl" />
          <div style={S.fieldGrid}>
            <NumericField label="Root Key" value={scalaDraft.root_key} min={0} max={127} step={1} onChange={(value) => setScalaDraft((previous) => ({ ...previous, root_key: value }))} />
            <NumericField label="Reference" value={scalaDraft.reference_hz} min={300} max={500} step={0.1} unit="Hz" onChange={(value) => setScalaDraft((previous) => ({ ...previous, reference_hz: value }))} />
          </div>
          <div style={S.actionRow}>
            <button
              style={S.actionButton(false, 'primary')}
              disabled={loadScalaMutation.isPending || scalaDraft.scala_path.trim().length === 0}
              onClick={() => loadScalaMutation.mutate({
                partIndex: activePart,
                scalaPath: scalaDraft.scala_path.trim(),
                rootKey: scalaDraft.root_key,
                referenceHz: scalaDraft.reference_hz,
              })}
            >
              {loadScalaMutation.isPending ? 'Loading…' : 'Load Scala Tuning'}
            </button>
          </div>
        </PanelFrame>

        <PanelFrame title="MPE & Expression" meta="Keyboard expression zones and pitch bend range">
          <div style={S.fieldGrid}>
            <NumericField label="Lower Zone" value={mpeDraft.lower_zone_channels} min={0} max={15} step={1} onChange={(value) => setMpeDraft((previous) => ({ ...previous, lower_zone_channels: value }))} />
            <NumericField label="Upper Zone" value={mpeDraft.upper_zone_channels} min={0} max={15} step={1} onChange={(value) => setMpeDraft((previous) => ({ ...previous, upper_zone_channels: value }))} />
            <NumericField label="Pitch Bend" value={mpeDraft.pitch_bend_range_semitones} min={1} max={96} step={1} unit="st" onChange={(value) => setMpeDraft((previous) => ({ ...previous, pitch_bend_range_semitones: value }))} />
          </div>
          <div style={S.toggleRow}>
            <button style={S.actionButton(mpeDraft.enabled)} onClick={() => setMpeDraft((previous) => ({ ...previous, enabled: !previous.enabled }))}>
              {mpeDraft.enabled ? 'MPE On' : 'MPE Off'}
            </button>
            <button
              style={S.actionButton(false, 'primary')}
              disabled={setMpeMutation.isPending}
              onClick={() => setMpeMutation.mutate({ partIndex: activePart, config: mpeDraft })}
            >
              {setMpeMutation.isPending ? 'Saving…' : 'Save MPE'}
            </button>
          </div>
        </PanelFrame>
      </div>

      <PanelFrame title="Mod Matrix" meta="Live routing for modulation sources and destinations">
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {modMatrixDraft.map((route, index) => (
            <div key={`${route.source}-${route.destination}-${index}`} style={S.routeRow}>
              <input style={S.routeInput} value={route.source} placeholder="Source" onChange={(event) => {
                const next = [...modMatrixDraft]
                next[index] = { ...route, source: event.target.value }
                setModMatrixDraft(next)
              }} />
              <input style={S.routeInput} value={route.destination} placeholder="Destination" onChange={(event) => {
                const next = [...modMatrixDraft]
                next[index] = { ...route, destination: event.target.value }
                setModMatrixDraft(next)
              }} />
              <NumberInput
                label="Amount"
                value={route.amount}
                min={-1}
                max={1}
                step={0.01}
                onChange={(value) => {
                  const next = [...modMatrixDraft]
                  next[index] = { ...route, amount: value }
                  setModMatrixDraft(next)
                }}
                size="small"
                accentColor="var(--interactive)"
              />
              <label style={S.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={route.bipolar}
                  onChange={(event) => {
                    const next = [...modMatrixDraft]
                    next[index] = { ...route, bipolar: event.target.checked }
                    setModMatrixDraft(next)
                  }}
                />
                Bipolar
              </label>
              <label style={S.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={route.enabled}
                  onChange={(event) => {
                    const next = [...modMatrixDraft]
                    next[index] = { ...route, enabled: event.target.checked }
                    setModMatrixDraft(next)
                  }}
                />
                Enabled
              </label>
              <button
                style={S.actionButton(false)}
                onClick={() => setModMatrixDraft((previous) => previous.filter((_, routeIndex) => routeIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          {modMatrixDraft.length === 0 && <div style={S.empty}>No modulation routes are configured for the active part.</div>}
        </div>
        <div style={S.actionRow}>
          <button
            style={S.actionButton(false)}
            onClick={() => setModMatrixDraft((previous) => [...previous, {
              source: '',
              destination: '',
              amount: 0,
              bipolar: false,
              enabled: true,
            }])}
          >
            Add Route
          </button>
          <button
            style={S.actionButton(false, 'primary')}
            disabled={setModMatrixMutation.isPending}
            onClick={() => setModMatrixMutation.mutate({
              partIndex: activePart,
              routes: modMatrixDraft.filter((route) => route.source.trim() && route.destination.trim()),
            })}
          >
            {setModMatrixMutation.isPending ? 'Saving…' : 'Save Routes'}
          </button>
        </div>
      </PanelFrame>
    </div>
  )

  const workstationContent = (
    <CarbonParameterSection title="Workstation" accentColor={accentColor}>
      <div style={S.workstation}>
        <div style={S.workstationHeader}>
          <div style={S.workstationCopy}>
            <p style={S.workstationLead}>Professional keyboard workflow</p>
            <p style={S.workstationSub}>
              Sound selection, multitimbral rack control, live play interaction, engine management, and advanced synthesis operations for the active part.
            </p>
          </div>
          {isBusy ? <InlineLoading description="Refreshing SynthForge state" status="active" /> : null}
        </div>

        <Tabs
          selectedIndex={Math.max(0, WORKSPACE_TABS.findIndex((tab) => tab.id === workspace))}
          onChange={({ selectedIndex }) => setWorkspace(WORKSPACE_TABS[selectedIndex]?.id ?? 'sound')}
        >
          <TabList aria-label="SynthForge workstation tabs" contained>
            {WORKSPACE_TABS.map((tab) => <Tab key={tab.id}>{tab.label}</Tab>)}
          </TabList>
        </Tabs>

        <div style={S.workspaceBody}>
          {workspace === 'sound' ? soundWorkspace : null}
          {workspace === 'rack' ? rackWorkspace : null}
          {workspace === 'play' ? playWorkspace : null}
          {workspace === 'engine' ? engineWorkspace : null}
          {workspace === 'advanced' ? advancedWorkspace : null}
        </div>
      </div>
    </CarbonParameterSection>
  )

  const statusFooter = (
    <div style={S.footerStatus}>
      {statusQuery.data?.last_error ? <span style={{ color: '#fca5a5' }}>{statusQuery.data.last_error}</span> : null}
      {hotReloadDraft.last_error ? <span style={{ color: '#fde68a' }}>{hotReloadDraft.last_error}</span> : null}
      {freezeStatus?.last_error ? <span style={{ color: '#fca5a5' }}>{freezeStatus.last_error}</span> : null}
      {noteApiError ? <span style={{ color: '#fde68a' }}>{noteApiError}</span> : null}
      {!statusQuery.data?.last_error && !hotReloadDraft.last_error && !freezeStatus?.last_error && !noteApiError
        ? <span style={{ color: 'rgba(203,213,225,0.72)' }}>Active part: P{activePart + 1} • Backend {backendStatus?.backend || statusQuery.data?.engine || 'native'} • CPU {cpuPercent.toFixed(1)}%</span>
        : null}
    </div>
  )

  return (
    <InstrumentCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      cardWidth={560}
      bypassed={Boolean(plugin.bypassed)}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      transport={transportContent}
      performanceParams={performanceParams}
      extraContent={
        <>
          {workstationContent}
          {statusFooter}
        </>
      }
    />
  )
}

export { SynthForgeCardBase as SynthForgeCard }
export default withMidiDialog(SynthForgeCardBase, SYNTHFORGE_URI, SYNTHFORGE_PARAMS)
