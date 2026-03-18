import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsClockwise, PianoKeys } from '@phosphor-icons/react'

import { PluginCardShell } from '../../Base/PluginCardShell'
import { NumberInput } from '../../../Controls/NumberInput'
import type { PluginCardProps } from '../../types'
import {
  soundfontApi,
  synthforgeApi,
  type SynthForgePartConfig,
  type SynthForgePerformanceConfig,
} from '../../../../../map2/api'
import type { SoundFont, SoundFontPreset } from '../../../../types/library'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../../map2/hooks/useWebSocket'
import './SynthForgeCard.css'

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

export function SynthForgeCard({ plugin, accentColor = '#38d6c4', compact = false }: PluginCardProps) {
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

  const soundfonts = useMemo(() => {
    const all = (libraryQuery.data?.soundfonts ?? []) as SoundFont[]
    const lowered = search.trim().toLowerCase()
    return all
      .filter((item) => item.format === 'sf2' || item.format === 'sf3')
      .filter((item) => !lowered || item.name.toLowerCase().includes(lowered) || item.library.toLowerCase().includes(lowered))
  }, [libraryQuery.data, search])

  const presets = presetsQuery.data?.presets ?? []
  const banks = useMemo(() => Array.from(new Set(presets.map((preset) => preset.bank))).sort((a, b) => a - b), [presets])
  const filteredPresets = useMemo(() => presets.filter((preset) => preset.bank === selectedBank), [presets, selectedBank])

  const keyboardNotes = useMemo(
    () => Array.from({ length: KEYBOARD_MAX_NOTE - KEYBOARD_MIN_NOTE + 1 }, (_, index) => KEYBOARD_MIN_NOTE + index),
    []
  )

  useEffect(() => {
    const loadedPath = statusQuery.data?.soundfont_path ?? ''
    if (loadedPath) {
      setSelectedPath(loadedPath)
      setSelectedBank(statusQuery.data?.active_bank ?? 0)
      setSelectedProgram(statusQuery.data?.active_program ?? 0)
    }
  }, [statusQuery.data])

  useEffect(() => {
    if (!selectedPath && soundfonts.length > 0) {
      setSelectedPath(soundfonts[0].path)
    }
  }, [selectedPath, soundfonts])

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

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      showBypass={false}
      showPresetControls={false}
      showMoreMenu={false}
      className="synthforge-shell"
    >
      <div className="synthforge-card">
        <div className="synthforge-hero">
          <div>
            <span className="synthforge-kicker">SoundFont Sampler</span>
            <h3>SynthForge</h3>
            <p>
              SoundFont 2/3 browsing, bank/program recall, velocity-first piano control, and hardware MIDI workflow.
            </p>
          </div>
          <div className="synthforge-hero-stats">
            <span><strong>{activeVoiceCount}</strong> voices</span>
            <span><strong>{partVoiceCount}</strong> part</span>
            <span><strong>CH {partChannel}</strong> input</span>
          </div>
        </div>

        <div className="synthforge-toolbar">
          <label>
            Part
            <select value={activePart} onChange={(event) => setActivePart(Number(event.target.value))}>
              {Array.from({ length: 16 }, (_, index) => <option key={index} value={index}>Part {index + 1}</option>)}
            </select>
          </label>
          <label>
            MIDI
            <select value={currentPart.midi_channel} onChange={(event) => updatePartConfig({ midi_channel: Number(event.target.value) })}>
              <option value={0}>OMNI</option>
              {Array.from({ length: 16 }, (_, index) => <option key={index + 1} value={index + 1}>Channel {index + 1}</option>)}
            </select>
          </label>
          <label>
            Output
            <select value={currentPart.output_bus} onChange={(event) => updatePartConfig({ output_bus: event.target.value })}>
              {OUTPUT_BUSES.map((bus) => <option key={bus} value={bus}>{bus}</option>)}
            </select>
          </label>
          <button
            className="synthforge-refresh"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['soundfonts', 'synthforge', 'sampler-library'] })
              if (selectedPath) queryClient.invalidateQueries({ queryKey: ['soundfonts', 'presets', selectedPath] })
            }}
            title="Refresh SoundFont library and preset metadata"
          >
            <ArrowsClockwise size={14} weight="duotone" />
          </button>
        </div>

        <div className="synthforge-grid">
          <section className="synthforge-panel">
            <div className="synthforge-panel-heading">
              <span>Library</span>
              <strong>{soundfonts.length} SoundFonts</strong>
            </div>
            <input
              className="synthforge-search"
              placeholder="Search piano, strings, library..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="synthforge-library-list">
              {soundfonts.map((item) => (
                <button
                  key={item.path}
                  className={['synthforge-library-item', selectedPath === item.path ? 'is-selected' : ''].join(' ')}
                  onClick={() => setSelectedPath(item.path)}
                >
                  <span className="title">{item.name}</span>
                  <span className="meta">{item.library} • {item.format.toUpperCase()} • {item.preset_count ?? 0} presets</span>
                </button>
              ))}
            </div>
          </section>

          <section className="synthforge-panel">
            <div className="synthforge-panel-heading">
              <span>Preset Browser</span>
              <strong>{statusQuery.data?.active_preset_name || 'Select a SoundFont'}</strong>
            </div>

            <div className="synthforge-status-strip">
              <span>Engine: <strong>{statusQuery.data?.engine || 'none'}</strong></span>
              <span>Playback: <strong>{statusQuery.data?.engine_available ? 'Ready' : 'Unavailable'}</strong></span>
              <span>Loaded: <strong>{statusQuery.data?.soundfont_format?.toUpperCase() || 'None'}</strong></span>
            </div>

            <div className="synthforge-bank-program">
              <label>
                Bank
                <select value={selectedBank} onChange={(event) => setSelectedBank(Number(event.target.value))} disabled={banks.length === 0}>
                  {banks.map((bank) => <option key={bank} value={bank}>Bank {bank}</option>)}
                </select>
              </label>
              <label>
                Program
                <select value={selectedProgram} onChange={(event) => setSelectedProgram(Number(event.target.value))} disabled={filteredPresets.length === 0}>
                  {filteredPresets.map((preset) => <option key={`${preset.bank}:${preset.program}`} value={preset.program}>{preset.program} • {preset.name}</option>)}
                </select>
              </label>
            </div>

            <button
              className="synthforge-primary"
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

            <div className="synthforge-preset-list">
              {filteredPresets.map((preset) => (
                <button
                  key={`${preset.bank}:${preset.program}:${preset.name}`}
                  className={['synthforge-preset-item', preset.program === selectedProgram ? 'is-selected' : ''].join(' ')}
                  onClick={() => setSelectedProgram(preset.program)}
                >
                  <span>{preset.program.toString().padStart(3, '0')}</span>
                  <strong>{preset.name}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="synthforge-panel">
            <div className="synthforge-panel-heading">
              <span>Performance</span>
              <strong>MIDI-first controls</strong>
            </div>

            <div className="synthforge-controls-grid">
              <NumericField
                label="Transpose"
                value={performanceDraft.master_transpose}
                min={-36}
                max={36}
                onChange={(value) => setPerformanceDraft((prev) => ({ ...prev, master_transpose: value }))}
              />
              <NumericField
                label="Velocity Curve"
                value={performanceDraft.velocity_curve}
                min={-1}
                max={1}
                step={0.05}
                onChange={(value) => setPerformanceDraft((prev) => ({ ...prev, velocity_curve: value }))}
              />
              <NumericField
                label="PB Range"
                value={performanceDraft.pitch_bend_range}
                min={1}
                max={48}
                onChange={(value) => setPerformanceDraft((prev) => ({ ...prev, pitch_bend_range: value }))}
              />
              <NumericField
                label="Level"
                value={currentPart.level}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updatePartConfig({ level: value })}
              />
            </div>

            <div className="synthforge-toggle-row">
              <button className={performanceDraft.mono_mode ? 'is-active' : ''} onClick={() => setPerformanceDraft((prev) => ({ ...prev, mono_mode: !prev.mono_mode }))}>Mono</button>
              <button className={performanceDraft.legato ? 'is-active' : ''} onClick={() => setPerformanceDraft((prev) => ({ ...prev, legato: !prev.legato }))}>Legato</button>
              <button className={currentPart.mute ? 'is-active' : ''} onClick={() => updatePartConfig({ mute: !currentPart.mute })}>Mute</button>
              <button className={currentPart.solo ? 'is-active' : ''} onClick={() => updatePartConfig({ solo: !currentPart.solo })}>Solo</button>
            </div>

            <button
              className="synthforge-primary"
              onClick={() => setPerformanceMutation.mutate({ partIndex: activePart, config: performanceDraft })}
              disabled={setPerformanceMutation.isPending}
            >
              Apply Performance
            </button>
          </section>

          <section className="synthforge-panel synthforge-keyboard-panel">
            <div className="synthforge-panel-heading">
              <span className="synthforge-piano-title"><PianoKeys size={14} weight="duotone" /> Performance Piano</span>
              <strong>Velocity-sensitive</strong>
            </div>
            <p className="synthforge-keyboard-copy">
              Click keys higher for stronger velocity. Hardware MIDI and injected note activity mirror here in real time.
            </p>
            <div className="synthforge-keyboard">
              {keyboardNotes.map((note) => {
                const velocity = activeVelocityByNote.get(note) ?? 0
                const style = { '--key-accent': accentColor } as CSSProperties
                return (
                  <button
                    key={note}
                    className={[
                      'synthforge-key',
                      isBlackNote(note) ? 'is-black' : 'is-white',
                      velocity > 0 ? 'is-active' : '',
                    ].join(' ')}
                    style={style}
                    onPointerDown={handlePointerDown(note)}
                    onPointerUp={() => handlePointerUp(note)}
                    onPointerLeave={() => handlePointerUp(note)}
                    onPointerCancel={() => handlePointerUp(note)}
                    title={`${noteLabel(note)} (${note})`}
                  >
                    <span>{noteLabel(note)}</span>
                  </button>
                )
              })}
            </div>

            <div className="synthforge-active-notes">
              {Object.values(activeNotes).map((item) => (
                <div key={`${item.channel}:${item.note}`} className="synthforge-note-chip">
                  <strong>{noteLabel(item.note)}</strong>
                  <span>CH {item.channel}</span>
                  <span>VEL {item.velocity}</span>
                  <span>{item.source}</span>
                </div>
              ))}
              {Object.keys(activeNotes).length === 0 && <div className="synthforge-empty">No active notes</div>}
            </div>

            <div className="synthforge-event-list">
              {noteEvents.map((event) => (
                <div key={event.id} className={`synthforge-event ${event.type}`}>
                  <strong>{event.type === 'note_on' ? 'ON' : 'OFF'}</strong>
                  <span>{noteLabel(event.note)}</span>
                  <span>CH {event.channel}</span>
                  <span>VEL {event.velocity}</span>
                  <span>{event.source}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {(statusQuery.data?.last_error || (statusQuery.data?.warnings?.length ?? 0) > 0 || noteApiError) && (
          <div className="synthforge-footer-status">
            {statusQuery.data?.last_error ? <span className="is-error">{statusQuery.data.last_error}</span> : null}
            {statusQuery.data?.warnings?.map((warning) => <span key={warning} className="is-warn">{warning}</span>)}
            {noteApiError ? <span className="is-warn">{noteApiError}</span> : null}
          </div>
        )}
      </div>
    </PluginCardShell>
  )
}

export default SynthForgeCard
