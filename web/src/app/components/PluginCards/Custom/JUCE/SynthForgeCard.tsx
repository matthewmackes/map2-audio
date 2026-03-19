/**
 * SynthForgeCard - Carbon-compliant JUCE SoundFont Sampler
 *
 * Uses InstrumentCategoryLayout for AXE-FX Edit structural parity.
 * Performance knobs (transpose, velocity curve, PB range, level) in layout performance slots.
 * Library browser, preset browser, keyboard, and part config in advancedSections.
 * Full MIDI mapping support via withMidiDialog.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Keyboard, Renew, Settings, MusicAdd, Catalog } from '@carbon/icons-react'

import { InstrumentCategoryLayout, type ParamSlot } from '../../Layouts/InstrumentCategoryLayout'
import { NumberInput } from '../../../Controls/NumberInput'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import {
  soundfontApi,
  synthforgeApi,
  type SynthForgePartConfig,
  type SynthForgePerformanceConfig,
} from '../../../../../map2/api'
import type { SoundFont } from '../../../../types/library'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../../map2/hooks/useWebSocket'

// ── Constants ──────────────────────────────────────────────

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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const OUTPUT_BUSES = ['main', 'aux_1', 'aux_2', 'aux_3', 'aux_4', 'aux_5', 'aux_6', 'aux_7', 'aux_8']
const KEYBOARD_MIN_NOTE = 36
const KEYBOARD_MAX_NOTE = 96
const KEYBOARD_BASE_NOTE = 48
const MAX_NOTE_EVENTS = 80
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

// ── Inline styles for keyboard and sub-panels ──────────────

const S = {
  panelHeading: {
    display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
    alignItems: 'baseline', marginBottom: 8,
  } as CSSProperties,
  headingLabel: {
    fontSize: '0.76rem', textTransform: 'uppercase' as const,
    letterSpacing: '0.11em', color: '#7dd3fc',
  } as CSSProperties,
  headingValue: { fontSize: '0.95rem', fontWeight: 700, color: '#ecfeff' } as CSSProperties,
  statusStrip: {
    display: 'flex', flexWrap: 'wrap' as const, gap: '0.75rem',
    color: 'rgba(220,252,231,0.72)', fontSize: '0.85rem', marginBottom: 8,
  } as CSSProperties,
  select: {
    minHeight: '2.6rem', border: '1px solid rgba(165,243,252,0.18)',
    borderRadius: 12, padding: '0.7rem 0.85rem',
    background: 'rgba(2,6,23,0.58)', color: '#ecfeff', width: '100%',
  } as CSSProperties,
  searchInput: {
    minHeight: '2.6rem', border: '1px solid rgba(165,243,252,0.18)',
    borderRadius: 12, padding: '0.7rem 0.85rem',
    background: 'rgba(2,6,23,0.58)', color: '#ecfeff', width: '100%', marginBottom: 8,
  } as CSSProperties,
  libraryList: {
    display: 'grid', gap: '0.55rem', maxHeight: '19rem', overflow: 'auto',
  } as CSSProperties,
  libraryItem: (selected: boolean) => ({
    display: 'grid', gap: '0.2rem', padding: '0.75rem 0.85rem', textAlign: 'left' as const,
    border: '1px solid ' + (selected ? 'rgba(153,246,228,0.6)' : 'rgba(103,232,249,0.2)'),
    borderRadius: 14, cursor: 'pointer',
    background: selected
      ? 'linear-gradient(180deg, rgba(17,94,89,0.92), rgba(15,118,110,0.68))'
      : 'rgba(15,23,42,0.8)',
    color: '#ecfeff', transition: 'all 140ms ease',
  } as CSSProperties),
  primaryBtn: (disabled: boolean) => ({
    minHeight: '2.9rem', fontWeight: 700, width: '100%', marginTop: 8,
    border: '1px solid rgba(103,232,249,0.2)', borderRadius: 14,
    background: disabled ? 'rgba(15,23,42,0.4)' : 'rgba(15,23,42,0.8)',
    color: disabled ? 'rgba(220,252,231,0.4)' : '#ecfeff',
    cursor: disabled ? 'default' : 'pointer',
  } as CSSProperties),
  toggleRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.6rem', marginTop: 8 } as CSSProperties,
  toggleBtn: (active: boolean) => ({
    minWidth: '6rem', minHeight: '2.5rem',
    border: '1px solid ' + (active ? 'rgba(153,246,228,0.6)' : 'rgba(103,232,249,0.2)'),
    borderRadius: 14, cursor: 'pointer',
    background: active
      ? 'linear-gradient(180deg, rgba(17,94,89,0.92), rgba(15,118,110,0.68))'
      : 'rgba(15,23,42,0.8)',
    color: '#ecfeff',
  } as CSSProperties),
  controlsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.75rem',
  } as CSSProperties,
  keyboard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(61, minmax(1.1rem, 1fr))',
    gap: '0.14rem', alignItems: 'end', overflow: 'auto',
  } as CSSProperties,
  whiteKey: (active: boolean, accent: string) => ({
    position: 'relative' as const, minHeight: '8rem',
    borderRadius: '0 0 10px 10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, #f8fafc, #dbeafe)',
    color: 'rgba(0,0,0,0.76)', cursor: 'pointer',
    boxShadow: active ? `inset 0 0 0 2px ${accent}, 0 0 18px rgba(56,214,196,0.28)` : 'none',
  } as CSSProperties),
  blackKey: (active: boolean, accent: string) => ({
    position: 'relative' as const, minHeight: '5.6rem',
    borderRadius: '0 0 10px 10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, #1e293b, #020617)',
    color: 'rgba(226,232,240,0.92)', cursor: 'pointer',
    boxShadow: active ? `inset 0 0 0 2px ${accent}, 0 0 18px rgba(56,214,196,0.28)` : 'none',
  } as CSSProperties),
  keyLabel: {
    position: 'absolute' as const, bottom: '0.35rem', left: '0.25rem', fontSize: '0.62rem',
  } as CSSProperties,
  activeNotes: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem', marginTop: 8 } as CSSProperties,
  noteChip: {
    display: 'inline-flex', gap: '0.45rem', alignItems: 'center',
    borderRadius: 999, padding: '0.4rem 0.7rem',
    background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(125,211,252,0.16)',
    fontSize: '0.82rem', color: '#ecfeff',
  } as CSSProperties,
  eventList: {
    display: 'grid', gap: '0.55rem', maxHeight: '19rem', overflow: 'auto', marginTop: 8,
  } as CSSProperties,
  event: (type: MidiEventType) => ({
    display: 'inline-flex', gap: '0.45rem', alignItems: 'center',
    borderRadius: 999, padding: '0.4rem 0.7rem',
    background: 'rgba(15,23,42,0.9)',
    border: '1px solid ' + (type === 'note_on' ? 'rgba(45,212,191,0.5)' : 'rgba(251,191,36,0.35)'),
    fontSize: '0.82rem', color: '#ecfeff',
  } as CSSProperties),
  empty: { color: 'rgba(220,252,231,0.72)', fontSize: '0.85rem' } as CSSProperties,
  footerStatus: {
    display: 'flex', flexWrap: 'wrap' as const, gap: '0.6rem',
    padding: '0.8rem 0', fontSize: '0.84rem',
  } as CSSProperties,
  labelGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 8,
  } as CSSProperties,
  label: {
    display: 'grid', gap: '0.35rem', fontSize: '0.78rem',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    color: 'rgba(220,252,231,0.72)',
  } as CSSProperties,
}

// ── Main Component ─────────────────────────────────────────

interface SynthForgeCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function SynthForgeCardBase({
  plugin,
  accentColor = '#38d6c4',
  compact = false,
  onOpenMidiMappings,
}: SynthForgeCardProps) {
  useWebSocketConnection()
  const queryClient = useQueryClient()

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
  const [activeNotes, setActiveNotes] = useState<Record<string, MidiNoteState>>({})
  const [noteEvents, setNoteEvents] = useState<MidiNoteEvent[]>([])
  const [noteApiError, setNoteApiError] = useState('')

  const qwertyHeldRef = useRef<Record<string, number>>({})
  const pointerHeldRef = useRef<Record<number, boolean>>({})

  const partsQuery = useQuery({
    queryKey: ['synthforge', 'parts'],
    queryFn: () => synthforgeApi.getParts(),
    refetchInterval: 2000,
  })

  const voicesQuery = useQuery({
    queryKey: ['synthforge', 'voices'],
    queryFn: () => synthforgeApi.getVoices(),
    refetchInterval: 600,
  })

  const statusQuery = useQuery({
    queryKey: ['synthforge', 'status', activePart],
    queryFn: () => synthforgeApi.getSfzStatus(activePart),
    refetchInterval: 1500,
  })

  const performanceQuery = useQuery({
    queryKey: ['synthforge', 'performance', activePart],
    queryFn: () => synthforgeApi.getPerformance(activePart),
    refetchInterval: 2000,
  })

  const libraryQuery = useQuery({
    queryKey: ['soundfonts', 'synthforge', 'sampler-library'],
    queryFn: () => soundfontApi.listSoundfonts({ limit: 300, include_presets: true }),
    staleTime: 20_000,
  })

  const presetsQuery = useQuery({
    queryKey: ['soundfonts', 'presets', selectedPath],
    queryFn: () => soundfontApi.getPresets(selectedPath),
    enabled: Boolean(selectedPath),
    staleTime: 20_000,
  })

  const setPartConfigMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgePartConfig }) =>
      synthforgeApi.setPartConfig(partIndex, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['synthforge', 'parts'] }),
  })

  const loadSoundFontMutation = useMutation({
    mutationFn: ({ partIndex, path, bank, program, presetName }: { partIndex: number; path: string; bank: number; program: number; presetName: string }) =>
      synthforgeApi.loadSoundFont(partIndex, path, bank, program, presetName),
    onSuccess: (_, variables) => {
      setSelectedPath(variables.path)
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'status', variables.partIndex] })
    },
  })

  const setPerformanceMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgePerformanceConfig }) =>
      synthforgeApi.setPerformance(partIndex, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'performance', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'status', variables.partIndex] })
    },
  })

  const currentPart = useMemo(() => {
    return partsQuery.data?.find((part) => part.part_index === activePart) ?? defaultPart(activePart)
  }, [activePart, partsQuery.data])

  const partChannel = currentPart.midi_channel >= 1 && currentPart.midi_channel <= 16 ? currentPart.midi_channel : activePart + 1

  const libraryItems = useMemo(() => {
    const all = (libraryQuery.data?.soundfonts ?? []) as SoundFont[]
    const lowered = search.trim().toLowerCase()
    return all.filter((item) => !lowered || item.name.toLowerCase().includes(lowered) || item.library.toLowerCase().includes(lowered))
  }, [libraryQuery.data, search])
  const totalLibraryCount = libraryQuery.data?.total ?? 0
  const compatibleLibraryCount = useMemo(() => {
    const all = (libraryQuery.data?.soundfonts ?? []) as SoundFont[]
    return all.filter((item) => item.format === 'sf2' || item.format === 'sf3' || item.format === 'sfz').length
  }, [libraryQuery.data])
  const selectedItem = useMemo(
    () => libraryItems.find((item) => item.path === selectedPath) ?? null,
    [libraryItems, selectedPath]
  )
  const isSelectedSoundFont = selectedItem?.format === 'sf2' || selectedItem?.format === 'sf3'
  const isSelectedSfz = selectedItem?.format === 'sfz'

  const presets = presetsQuery.data?.presets ?? []
  const banks = useMemo(() => Array.from(new Set(presets.map((preset) => preset.bank))).sort((a, b) => a - b), [presets])
  const filteredPresets = useMemo(() => presets.filter((preset) => preset.bank === selectedBank), [presets, selectedBank])

  const keyboardNotes = useMemo(
    () => Array.from({ length: KEYBOARD_MAX_NOTE - KEYBOARD_MIN_NOTE + 1 }, (_, index) => KEYBOARD_MIN_NOTE + index),
    []
  )

  useEffect(() => {
    const loadedPath = statusQuery.data?.soundfont_path ?? ''
    const loadedSfzPath = statusQuery.data?.sfz_path ?? ''
    if (loadedPath) {
      setSelectedPath(loadedPath)
      setSelectedBank(statusQuery.data?.active_bank ?? 0)
      setSelectedProgram(statusQuery.data?.active_program ?? 0)
    } else if (loadedSfzPath) {
      setSelectedPath(loadedSfzPath)
    }
  }, [statusQuery.data])

  useEffect(() => {
    if (!selectedPath && libraryItems.length > 0) {
      setSelectedPath(libraryItems[0].path)
    }
  }, [selectedPath, libraryItems])

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

  const registerNoteEvent = (type: MidiEventType, channel: number, note: number, velocity: number, source: NoteSource) => {
    const now = Date.now()
    const key = `${channel}:${note}`
    setActiveNotes((previous) => {
      const next = { ...previous }
      if (type === 'note_on' && velocity > 0) next[key] = { channel, note, velocity, source, updatedAt: now }
      else delete next[key]
      return next
    })
    setNoteEvents((previous) => [{ id: `${now}-${note}-${channel}-${type}`, type, channel, note, velocity, source, updatedAt: now }, ...previous].slice(0, MAX_NOTE_EVENTS))
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
      'external'
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

  const selectedPreset = filteredPresets.find((preset) => preset.program === selectedProgram)
  const activeVoiceCount = voicesQuery.data?.active_voices ?? 0
  const partVoiceCount = voicesQuery.data?.voices_per_part?.[activePart] ?? 0
  const activeVelocityByNote = new Map<number, number>()
  Object.values(activeNotes).forEach((entry) => activeVelocityByNote.set(entry.note, Math.max(activeVelocityByNote.get(entry.note) ?? 0, entry.velocity)))

  // ── Visualization (hero stats) ──
  const visualization = (
    <div style={{
      padding: 16, background: 'linear-gradient(135deg, #0a0a14 0%, #0f1424 100%)',
      borderRadius: 10, border: '1px solid #1e293b',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7dd3fc', marginBottom: 6 }}>
        SoundFont Sampler
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#ecfeff', marginBottom: 8 }}>SynthForge</div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(220,252,231,0.72)' }}>
        <span><strong style={{ color: '#ecfeff' }}>{activeVoiceCount}</strong> voices</span>
        <span><strong style={{ color: '#ecfeff' }}>{partVoiceCount}</strong> part</span>
        <span><strong style={{ color: '#ecfeff' }}>CH {partChannel}</strong> input</span>
      </div>
    </div>
  )

  // ── Performance params ──
  const performanceParams: ParamSlot[] = [
    {
      label: 'Transpose',
      value: performanceDraft.master_transpose,
      min: -36, max: 36, step: 1, defaultValue: 0,
      unit: 'st',
      onChange: v => setPerformanceDraft(prev => ({ ...prev, master_transpose: v })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.TRANSPOSE },
    },
    {
      label: 'Vel Curve',
      value: performanceDraft.velocity_curve,
      min: -1, max: 1, step: 0.05, defaultValue: 0,
      onChange: v => setPerformanceDraft(prev => ({ ...prev, velocity_curve: v })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.VELOCITY_CURVE },
    },
    {
      label: 'PB Range',
      value: performanceDraft.pitch_bend_range,
      min: 1, max: 48, step: 1, defaultValue: 2,
      unit: 'st',
      onChange: v => setPerformanceDraft(prev => ({ ...prev, pitch_bend_range: v })),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.PITCH_BEND_RANGE },
    },
    {
      label: 'Level',
      value: currentPart.level,
      min: 0, max: 1, step: 0.01, defaultValue: 1,
      onChange: v => updatePartConfig({ level: v }),
      midi: { pluginUri: SYNTHFORGE_URI, paramIndex: PARAM.LEVEL },
    },
  ]

  // ── Transport (part selector + apply) ──
  const transportContent = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={S.label}>
        <span>Part</span>
        <select style={S.select} value={activePart} onChange={(e) => setActivePart(Number(e.target.value))}>
          {Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>Part {i + 1}</option>)}
        </select>
      </div>
      <div style={S.label}>
        <span>MIDI</span>
        <select style={S.select} value={currentPart.midi_channel} onChange={(e) => updatePartConfig({ midi_channel: Number(e.target.value) })}>
          <option value={0}>OMNI</option>
          {Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>Channel {i + 1}</option>)}
        </select>
      </div>
      <div style={S.label}>
        <span>Output</span>
        <select style={S.select} value={currentPart.output_bus} onChange={(e) => updatePartConfig({ output_bus: e.target.value })}>
          {OUTPUT_BUSES.map((bus) => <option key={bus} value={bus}>{bus}</option>)}
        </select>
      </div>
      <div style={S.toggleRow}>
        <button style={S.toggleBtn(performanceDraft.mono_mode)} onClick={() => setPerformanceDraft(prev => ({ ...prev, mono_mode: !prev.mono_mode }))}>Mono</button>
        <button style={S.toggleBtn(performanceDraft.legato)} onClick={() => setPerformanceDraft(prev => ({ ...prev, legato: !prev.legato }))}>Legato</button>
        <button style={S.toggleBtn(currentPart.mute)} onClick={() => updatePartConfig({ mute: !currentPart.mute })}>Mute</button>
        <button style={S.toggleBtn(currentPart.solo)} onClick={() => updatePartConfig({ solo: !currentPart.solo })}>Solo</button>
      </div>
      <button
        style={S.primaryBtn(setPerformanceMutation.isPending)}
        disabled={setPerformanceMutation.isPending}
        onClick={() => setPerformanceMutation.mutate({ partIndex: activePart, config: performanceDraft })}
      >
        Apply Performance
      </button>
    </div>
  )

  // ── Advanced sections ──

  // Library browser
  const librarySection = (
    <div>
      <div style={S.statusStrip}>
        <span>Total library: <strong>{totalLibraryCount}</strong></span>
        <span>SF2/SF3 compatible: <strong>{compatibleLibraryCount}</strong></span>
        <span>Modes: <strong>SF2/SF3 + SFZ</strong></span>
      </div>
      <input
        style={S.searchInput}
        placeholder="Search SoundFonts and SFZ instruments..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={S.libraryList}>
        {libraryItems.map((item) => (
          <button
            key={item.path}
            style={S.libraryItem(selectedPath === item.path)}
            onClick={() => setSelectedPath(item.path)}
          >
            <span style={{ fontWeight: 700 }}>{item.name}</span>
            <span style={{ color: 'rgba(220,252,231,0.72)', fontSize: '0.8rem' }}>
              {item.library} / {item.format.toUpperCase()} / {item.format === 'sfz' ? 'SFZ instrument' : `${item.preset_count ?? 0} presets`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  // Preset browser
  const presetSection = (
    <div>
      <div style={S.statusStrip}>
        <span>Engine: <strong>{statusQuery.data?.engine || 'none'}</strong></span>
        <span>Playback: <strong>{statusQuery.data?.engine_available ? 'Ready' : 'Unavailable'}</strong></span>
        <span>Loaded: <strong>{statusQuery.data?.soundfont_format?.toUpperCase() || 'None'}</strong></span>
      </div>

      {isSelectedSoundFont ? (
        <>
          <div style={S.labelGrid}>
            <div style={S.label}>
              <span>Bank</span>
              <select style={S.select} value={selectedBank} onChange={(e) => setSelectedBank(Number(e.target.value))} disabled={banks.length === 0}>
                {banks.map((bank) => <option key={bank} value={bank}>Bank {bank}</option>)}
              </select>
            </div>
            <div style={S.label}>
              <span>Program</span>
              <select style={S.select} value={selectedProgram} onChange={(e) => setSelectedProgram(Number(e.target.value))} disabled={filteredPresets.length === 0}>
                {filteredPresets.map((preset) => <option key={`${preset.bank}:${preset.program}`} value={preset.program}>{preset.program} / {preset.name}</option>)}
              </select>
            </div>
          </div>
          <button
            style={S.primaryBtn(!selectedPath || !selectedPreset || loadSoundFontMutation.isPending)}
            disabled={!selectedPath || !selectedPreset || loadSoundFontMutation.isPending}
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
            Load {selectedPreset?.name || 'Preset'}
          </button>
          <div style={{ ...S.libraryList, marginTop: 8 }}>
            {filteredPresets.map((preset) => (
              <button
                key={`${preset.bank}:${preset.program}:${preset.name}`}
                style={S.libraryItem(preset.program === selectedProgram)}
                onClick={() => setSelectedProgram(preset.program)}
              >
                <span>{preset.program.toString().padStart(3, '0')}</span>
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </>
      ) : isSelectedSfz ? (
        <>
          <div style={S.statusStrip}>
            <span>Format: <strong>SFZ</strong></span>
            <span>Load path: <strong>Existing SFZ sampler backend</strong></span>
          </div>
          <button
            style={S.primaryBtn(!selectedPath || loadSoundFontMutation.isPending)}
            disabled={!selectedPath || loadSoundFontMutation.isPending}
            onClick={() => {
              if (!selectedPath) return
              void synthforgeApi.loadSfz(activePart, selectedPath).then(() => {
                queryClient.invalidateQueries({ queryKey: ['synthforge', 'status', activePart] })
              })
            }}
          >
            Load SFZ Instrument
          </button>
        </>
      ) : (
        <div style={S.empty}>Select a library item to load.</div>
      )}
    </div>
  )

  // Keyboard
  const keyboardSection = (
    <div>
      <p style={{ margin: '0 0 8px', color: 'rgba(220,252,231,0.72)' }}>
        Click keys higher for stronger velocity. Hardware MIDI and injected note activity mirror here in real time.
      </p>
      <div style={S.keyboard}>
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

      <div style={S.activeNotes}>
        {Object.values(activeNotes).map((item) => (
          <div key={`${item.channel}:${item.note}`} style={S.noteChip}>
            <strong>{noteLabel(item.note)}</strong>
            <span>CH {item.channel}</span>
            <span>VEL {item.velocity}</span>
            <span>{item.source}</span>
          </div>
        ))}
        {Object.keys(activeNotes).length === 0 && <div style={S.empty}>No active notes</div>}
      </div>

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
      </div>

      {(statusQuery.data?.last_error || (statusQuery.data?.warnings?.length ?? 0) > 0 || noteApiError) && (
        <div style={S.footerStatus}>
          {statusQuery.data?.last_error ? <span style={{ color: '#fca5a5' }}>{statusQuery.data.last_error}</span> : null}
          {statusQuery.data?.warnings?.map((warning: string) => <span key={warning} style={{ color: '#fde68a' }}>{warning}</span>)}
          {noteApiError ? <span style={{ color: '#fde68a' }}>{noteApiError}</span> : null}
        </div>
      )}
    </div>
  )

  const advancedSections = [
    {
      id: 'library',
      title: `Library (${libraryItems.length} visible)`,
      icon: <Catalog size={14} />,
      children: librarySection,
      defaultOpen: true,
    },
    {
      id: 'presets',
      title: `Presets — ${statusQuery.data?.active_preset_name || selectedItem?.name || 'Select instrument'}`,
      icon: <MusicAdd size={14} />,
      children: presetSection,
      defaultOpen: true,
    },
    {
      id: 'keyboard',
      title: 'Performance Piano',
      icon: <Keyboard size={14} />,
      children: keyboardSection,
      defaultOpen: false,
    },
  ]

  return (
    <InstrumentCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      transport={transportContent}
      performanceParams={performanceParams}
      advancedSections={advancedSections}
    />
  )
}

// ── Exports ────────────────────────────────────────────────

export { SynthForgeCardBase as SynthForgeCard }
export default withMidiDialog(SynthForgeCardBase, SYNTHFORGE_URI, SYNTHFORGE_PARAMS)
