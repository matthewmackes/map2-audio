import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsClockwise, Moon, PianoKeys, Sun } from '@phosphor-icons/react'

import { PluginCardShell } from '../../Base/PluginCardShell'
import { NumberInput } from '../../../Controls/NumberInput'
import type { PluginCardProps } from '../../types'
import type { SensitivityProfile } from '../../../../data/parameterSchema'
import {
  soundfontApi,
  synthforgeApi,
  type SynthForgePartConfig,
  type SynthForgeModMatrixRoute,
  type SynthForgeStreamingConfig,
} from '../../../../../map2/api'
import { getDisplayPluginName } from '../../../../../map2/displayNames'
import type { SoundFont } from '../../../../types/library'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../../map2/hooks/useWebSocket'
import './SynthForgeCard.css'

type ThemeMode = 'dark' | 'light'
type NoteSource = 'external' | 'on-screen' | 'qwerty'
type MidiEventType = 'note_on' | 'note_off'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const OUTPUT_BUSES = ['main', 'aux_1', 'aux_2', 'aux_3', 'aux_4', 'aux_5', 'aux_6', 'aux_7', 'aux_8']
const WAVEFORMS = ['Sine', 'Saw', 'Square', 'Triangle']
const MOD_DESTINATIONS = [
  'osc1.level',
  'osc1.coarse',
  'filter1.cutoff',
  'filter1.resonance',
  'amp.attack',
  'amp.decay',
  'amp.sustain',
  'amp.release',
]

const KEYBOARD_MIN_NOTE = 36
const KEYBOARD_MAX_NOTE = 96
const KEYBOARD_BASE_NOTE = 48
const MAX_NOTE_EVENTS = 120
const SYNTHFORGE_NUMERIC_ACCENT = 'var(--interactive)'

const QWERTY_NOTE_OFFSETS: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  ',': 12,
  l: 13,
  '.': 14,
  ';': 15,
  '/': 16,
  q: 12,
  '2': 13,
  w: 14,
  '3': 15,
  e: 16,
  r: 17,
  '5': 18,
  t: 19,
  '6': 20,
  y: 21,
  '7': 22,
  u: 23,
  i: 24,
  '9': 25,
  o: 26,
  '0': 27,
  p: 28,
  '[': 29,
  ']': 30,
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

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatter?: (value: number) => string
  onChange: (value: number) => void
  profile?: SensitivityProfile
}

interface NumericFieldProps {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  formatter?: (value: number) => string
  onChange: (value: number) => void
  profile?: SensitivityProfile
  showLabel?: boolean
  inline?: boolean
  className?: string
  defaultValue?: number
}

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  formatter,
  onChange,
  profile,
  showLabel = true,
  inline = false,
  className,
  defaultValue,
}: NumericFieldProps) {
  return (
    <NumberInput
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      defaultValue={defaultValue}
      profile={profile}
      onChange={onChange}
      size="small"
      showLabel={showLabel}
      inline={inline}
      accentColor={SYNTHFORGE_NUMERIC_ACCENT}
      className={['synthforge-number-input', className].filter(Boolean).join(' ')}
      valueFormatter={formatter}
    />
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  formatter,
  onChange,
  profile,
}: SliderFieldProps) {
  return (
    <NumericField
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      formatter={formatter}
      onChange={onChange}
      profile={profile}
      className="synthforge-slider-input"
    />
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function noteLabel(note: number): string {
  const octave = Math.floor(note / 12) - 1
  return `${NOTE_NAMES[note % 12]}${octave}`
}

function isBlackNote(note: number): boolean {
  const pitchClass = note % 12
  return pitchClass === 1 || pitchClass === 3 || pitchClass === 6 || pitchClass === 8 || pitchClass === 10
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
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

function cutoffFromNormalized(normalized: number): number {
  return clamp(20 * Math.pow(1000, clamp(normalized, 0, 1)), 20, 20000)
}

function cutoffToNormalized(value: number): number {
  if (value <= 1) return clamp(value, 0, 1)
  return clamp(Math.log(value / 20) / Math.log(1000), 0, 1)
}

export function SynthForgeCard({
  plugin,
  accentColor = '#3dd6cc',
  compact = false,
}: PluginCardProps) {
  const queryClient = useQueryClient()
  useWebSocketConnection()

  const [activePart, setActivePart] = useState(0)
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [showFullPath, setShowFullPath] = useState(false)
  const [patchSearch, setPatchSearch] = useState('')
  const [selectedPatch, setSelectedPatch] = useState('')
  const [saveBank, setSaveBank] = useState(0)
  const [saveProgram, setSaveProgram] = useState(0)
  const [saveName, setSaveName] = useState('User Patch')
  const [browserSearch, setBrowserSearch] = useState('')
  const [manualPath, setManualPath] = useState('')
  const [noteApiError, setNoteApiError] = useState('')
  const [scalaPath, setScalaPath] = useState('')
  const [scalaRoot, setScalaRoot] = useState(60)
  const [scalaReferenceHz, setScalaReferenceHz] = useState(440)
  const [renderPath, setRenderPath] = useState('/tmp/synthforge-render.wav')
  const [hotReloadEnabled, setHotReloadEnabled] = useState(false)
  const [hotReloadIntervalMs, setHotReloadIntervalMs] = useState(1000)
  const [mpeEnabled, setMpeEnabled] = useState(false)
  const [mpeLowerZone, setMpeLowerZone] = useState(8)
  const [mpeUpperZone, setMpeUpperZone] = useState(0)
  const [mpePitchRange, setMpePitchRange] = useState(24)
  const [modSource, setModSource] = useState('cc.1')
  const [modDestination, setModDestination] = useState('filter1.cutoff')
  const [modAmount, setModAmount] = useState(0.5)
  const [streamingDraft, setStreamingDraft] = useState<SynthForgeStreamingConfig>({
    enabled: true,
    preload_size: 131072,
    max_voices: 64,
    interpolation: 'hermite',
    quality_live: 5,
    quality_freewheeling: 8,
    memory_limit_mb: 256,
  })

  const [activeNotes, setActiveNotes] = useState<Record<string, MidiNoteState>>({})
  const [noteEvents, setNoteEvents] = useState<MidiNoteEvent[]>([])

  const qwertyHeldRef = useRef<Record<string, number>>({})
  const pointerHeldRef = useRef<Record<number, boolean>>({})
  const hotReloadInFlightRef = useRef(false)

  const partsQuery = useQuery({
    queryKey: ['synthforge', 'parts'],
    queryFn: () => synthforgeApi.getParts(),
    refetchInterval: 2000,
  })

  const patchesQuery = useQuery({
    queryKey: ['synthforge', 'patches'],
    queryFn: () => synthforgeApi.getPatches(),
    refetchInterval: 5000,
  })

  const voicesQuery = useQuery({
    queryKey: ['synthforge', 'voices'],
    queryFn: () => synthforgeApi.getVoices(),
    refetchInterval: 500,
  })

  const paramsQuery = useQuery({
    queryKey: ['synthforge', 'params', activePart],
    queryFn: () => synthforgeApi.getPartParameters(activePart),
    refetchInterval: 1000,
  })

  const sfzStatusQuery = useQuery({
    queryKey: ['synthforge', 'sfz', 'status', activePart],
    queryFn: () => synthforgeApi.getSfzStatus(activePart),
    refetchInterval: 1000,
  })

  const soundfontsQuery = useQuery({
    queryKey: ['soundfonts', 'synthforge', 'browser'],
    queryFn: () => soundfontApi.listSoundfonts({ limit: 400, format: 'sfz' }),
    staleTime: 20_000,
  })

  const backendStatusQuery = useQuery({
    queryKey: ['synthforge', 'backend-status', activePart],
    queryFn: () => synthforgeApi.getPartBackendStatus(activePart),
    refetchInterval: 2000,
  })

  const streamingConfigQuery = useQuery({
    queryKey: ['synthforge', 'streaming', activePart],
    queryFn: () => synthforgeApi.getStreamingConfig(activePart),
    refetchInterval: 5000,
  })

  const hotReloadQuery = useQuery({
    queryKey: ['synthforge', 'hot-reload', activePart],
    queryFn: () => synthforgeApi.getHotReload(activePart),
    refetchInterval: 1500,
  })

  const scalaQuery = useQuery({
    queryKey: ['synthforge', 'scala', activePart],
    queryFn: () => synthforgeApi.getScalaTuning(activePart),
    refetchInterval: 5000,
  })

  const mpeQuery = useQuery({
    queryKey: ['synthforge', 'mpe', activePart],
    queryFn: () => synthforgeApi.getMpeConfig(activePart),
    refetchInterval: 5000,
  })

  const modMatrixQuery = useQuery({
    queryKey: ['synthforge', 'mod-matrix', activePart],
    queryFn: () => synthforgeApi.getModMatrixRoutes(activePart),
    refetchInterval: 2000,
  })

  const freezeStatusQuery = useQuery({
    queryKey: ['synthforge', 'freeze', activePart],
    queryFn: () => synthforgeApi.getFreezeStatus(activePart),
    refetchInterval: 1500,
  })

  const analyzerQuery = useQuery({
    queryKey: ['synthforge', 'analyzer', activePart],
    queryFn: () => synthforgeApi.getPartAnalyzerFrame(activePart),
    refetchInterval: 500,
  })

  const setPartConfigMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgePartConfig }) =>
      synthforgeApi.setPartConfig(partIndex, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'parts'] })
    },
  })

  const setParamMutation = useMutation({
    mutationFn: ({ partIndex, param, value }: { partIndex: number; param: string; value: number }) =>
      synthforgeApi.setPartParameter(partIndex, param, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'params', variables.partIndex] })
    },
  })

  const loadPatchMutation = useMutation({
    mutationFn: ({ partIndex, bank, program }: { partIndex: number; bank: number; program: number }) =>
      synthforgeApi.loadPatch(partIndex, bank, program),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'params', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'parts'] })
    },
  })

  const savePatchMutation = useMutation({
    mutationFn: ({ partIndex, bank, program, name }: { partIndex: number; bank: number; program: number; name: string }) =>
      synthforgeApi.savePatch(partIndex, bank, program, name),
    onSuccess: (_, variables) => {
      setSelectedPatch(`${variables.bank}:${variables.program}`)
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'patches'] })
    },
  })

  const loadSfzMutation = useMutation({
    mutationFn: ({ partIndex, sfzPath }: { partIndex: number; sfzPath: string }) =>
      synthforgeApi.loadSfz(partIndex, sfzPath),
    onSuccess: (_, variables) => {
      setManualPath(variables.sfzPath)
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'sfz', 'status', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'params', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'voices'] })
    },
  })

  const setSamplerBackendMutation = useMutation({
    mutationFn: ({ partIndex, backend }: { partIndex: number; backend: 'native' | 'sfizz' }) =>
      synthforgeApi.setSamplerBackend(partIndex, backend),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'backend-status', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'sfz', 'status', variables.partIndex] })
    },
  })

  const setStreamingMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: SynthForgeStreamingConfig }) =>
      synthforgeApi.setStreamingConfig(partIndex, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'streaming', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'backend-status', variables.partIndex] })
    },
  })

  const setHotReloadMutation = useMutation({
    mutationFn: ({ partIndex, enabled, intervalMs }: { partIndex: number; enabled: boolean; intervalMs: number }) =>
      synthforgeApi.setHotReload(partIndex, enabled, intervalMs),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'hot-reload', variables.partIndex] })
    },
  })

  const reloadIfChangedMutation = useMutation({
    mutationFn: ({ partIndex }: { partIndex: number }) => synthforgeApi.reloadSfzIfChanged(partIndex),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'sfz', 'status', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'hot-reload', variables.partIndex] })
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'backend-status', variables.partIndex] })
    },
  })

  const loadScalaMutation = useMutation({
    mutationFn: ({
      partIndex,
      scalaPath,
      rootKey,
      referenceHz,
    }: {
      partIndex: number
      scalaPath: string
      rootKey: number
      referenceHz: number
    }) => synthforgeApi.loadScalaTuning(partIndex, scalaPath, rootKey, referenceHz),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'scala', variables.partIndex] })
    },
  })

  const setMpeMutation = useMutation({
    mutationFn: ({ partIndex, config }: { partIndex: number; config: { enabled: boolean; lower_zone_channels: number; upper_zone_channels: number; pitch_bend_range_semitones: number } }) =>
      synthforgeApi.setMpeConfig(partIndex, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'mpe', variables.partIndex] })
    },
  })

  const setModMatrixMutation = useMutation({
    mutationFn: ({ partIndex, routes }: { partIndex: number; routes: SynthForgeModMatrixRoute[] }) =>
      synthforgeApi.setModMatrixRoutes(partIndex, routes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'mod-matrix', variables.partIndex] })
    },
  })

  const setFreezeMutation = useMutation({
    mutationFn: ({ partIndex, enabled }: { partIndex: number; enabled: boolean }) =>
      synthforgeApi.setFreeze(partIndex, enabled),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'freeze', variables.partIndex] })
    },
  })

  const renderPartMutation = useMutation({
    mutationFn: ({ partIndex, outputPath, durationMs }: { partIndex: number; outputPath: string; durationMs: number }) =>
      synthforgeApi.renderPartToFile(partIndex, outputPath, durationMs),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['synthforge', 'freeze', variables.partIndex] })
    },
  })

  const currentPart = useMemo(() => {
    const found = partsQuery.data?.find((part) => part.part_index === activePart)
    return found ?? defaultPart(activePart)
  }, [partsQuery.data, activePart])

  const params = paramsQuery.data ?? {}
  const voices = voicesQuery.data
  const sfzStatus = sfzStatusQuery.data
  const backendStatus = backendStatusQuery.data
  const streamingConfig = streamingConfigQuery.data
  const hotReloadStatus = hotReloadQuery.data
  const scalaTuning = scalaQuery.data
  const mpeConfig = mpeQuery.data
  const modMatrixRoutes = modMatrixQuery.data ?? []
  const freezeStatus = freezeStatusQuery.data
  const analyzerFrame = analyzerQuery.data

  const partChannel = currentPart.midi_channel >= 1 && currentPart.midi_channel <= 16
    ? currentPart.midi_channel
    : activePart + 1

  const waveformValue = Math.round(clamp(toNumber(params['osc1.waveform'], 0), 0, 3))
  const oscLevel = clamp(toNumber(params['osc1.level'], 0.75), 0, 1)
  const coarseTune = clamp(toNumber(params['osc1.coarse'], 0), -24, 24)
  const cutoffNormalized = cutoffToNormalized(toNumber(params['filter1.cutoff'], 12000))
  const cutoffHz = cutoffFromNormalized(cutoffNormalized)
  const resonance = clamp(toNumber(params['filter1.resonance'], 0.2), 0.1, 1.2)
  const attackMs = clamp(toNumber(params['amp.attack'], 10), 1, 5000)
  const decayMs = clamp(toNumber(params['amp.decay'], 120), 1, 5000)
  const sustain = clamp(toNumber(params['amp.sustain'], 0.8), 0, 1)
  const releaseMs = clamp(toNumber(params['amp.release'], 250), 1, 5000)

  const activeVoices = toNumber(voices?.active_voices, 0)
  const peakVoices = toNumber(voices?.peak_voices, 0)
  const partVoices = toNumber(voices?.voices_per_part?.[activePart], 0)

  const instrumentName = useMemo(() => {
    if (sfzStatus?.sfz_path) return getFileName(sfzStatus.sfz_path)
    return getDisplayPluginName(plugin.name, plugin.uri)
  }, [sfzStatus?.sfz_path, plugin.name, plugin.uri])

  const patchValueList = patchesQuery.data ?? []
  const patchFilter = patchSearch.trim().toLowerCase()
  const filteredPatches = useMemo(() => {
    if (!patchFilter) return patchValueList
    return patchValueList.filter((patch) => patch.name.toLowerCase().includes(patchFilter))
  }, [patchFilter, patchValueList])

  const selectedPatchValue = selectedPatch || (patchValueList.length > 0
    ? `${patchValueList[0].bank}:${patchValueList[0].program}`
    : '')

  const browserFilter = browserSearch.trim().toLowerCase()
  const filteredSoundfonts = useMemo(() => {
    const all = (soundfontsQuery.data?.soundfonts ?? []) as SoundFont[]
    if (!browserFilter) return all
    return all.filter((item) => {
      return item.name.toLowerCase().includes(browserFilter)
        || item.filename.toLowerCase().includes(browserFilter)
        || item.library.toLowerCase().includes(browserFilter)
    })
  }, [soundfontsQuery.data, browserFilter])

  const keyboardNotes = useMemo(
    () => Array.from({ length: KEYBOARD_MAX_NOTE - KEYBOARD_MIN_NOTE + 1 }, (_, index) => KEYBOARD_MIN_NOTE + index),
    []
  )

  const activeNoteList = useMemo(() => {
    return Object.values(activeNotes).sort((left, right) => {
      if (left.note !== right.note) return left.note - right.note
      return left.channel - right.channel
    })
  }, [activeNotes])

  const activeNoteVelocity = useMemo(() => {
    const velocityByNote = new Map<number, number>()
    for (const item of activeNoteList) {
      const current = velocityByNote.get(item.note) ?? 0
      velocityByNote.set(item.note, Math.max(current, item.velocity))
    }
    return velocityByNote
  }, [activeNoteList])

  const registerNoteEvent = useCallback((
    type: MidiEventType,
    channel: number,
    note: number,
    velocity: number,
    source: NoteSource
  ) => {
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

    setNoteEvents((previous) => {
      const next: MidiNoteEvent = {
        id: `${now}-${Math.random().toString(16).slice(2)}`,
        type,
        channel,
        note,
        velocity,
        source,
        updatedAt: now,
      }
      return [next, ...previous].slice(0, MAX_NOTE_EVENTS)
    })
  }, [])

  const sendNoteOn = useCallback(async (note: number, source: NoteSource, velocity = 100) => {
    const channel = partChannel
    registerNoteEvent('note_on', channel, note, velocity, source)
    try {
      await synthforgeApi.noteOn(channel, note, velocity)
      setNoteApiError('')
    } catch (error) {
      console.error('SynthForge note-on failed', error)
      setNoteApiError('Note input unavailable: verify MIDI engine is enabled.')
    }
  }, [partChannel, registerNoteEvent])

  const sendNoteOff = useCallback(async (note: number, source: NoteSource) => {
    const channel = partChannel
    registerNoteEvent('note_off', channel, note, 0, source)
    try {
      await synthforgeApi.noteOff(channel, note, 0)
      setNoteApiError('')
    } catch (error) {
      console.error('SynthForge note-off failed', error)
      setNoteApiError('Note input unavailable: verify MIDI engine is enabled.')
    }
  }, [partChannel, registerNoteEvent])

  useWebSocketTopic('midi_activity', (_topicData, message) => {
    if (message.type !== 'midi_message') return

    const payload = message.data ?? {}
    const type = String(payload.type ?? '')
    if (type !== 'note_on' && type !== 'note_off') return

    const channel = Number(payload.channel)
    const note = Number(payload.data1)
    const velocity = Number(payload.data2 ?? 0)

    if (!Number.isFinite(channel) || channel < 1 || channel > 16) return
    if (!Number.isFinite(note) || note < 0 || note > 127) return
    if (!Number.isFinite(velocity) || velocity < 0 || velocity > 127) return

    const eventType: MidiEventType = type === 'note_on' && velocity === 0 ? 'note_off' : type
    registerNoteEvent(eventType, channel, note, velocity, 'external')
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return

      const key = event.key.toLowerCase()
      const offset = QWERTY_NOTE_OFFSETS[key]
      if (offset === undefined) return

      event.preventDefault()
      if (event.repeat || qwertyHeldRef.current[key] !== undefined) return

      const note = clamp(KEYBOARD_BASE_NOTE + offset, 0, 127)
      qwertyHeldRef.current[key] = note
      void sendNoteOn(note, 'qwerty', 110)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const note = qwertyHeldRef.current[key]
      if (note === undefined) return

      delete qwertyHeldRef.current[key]
      void sendNoteOff(note, 'qwerty')
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)

      const heldNotes = Object.values(qwertyHeldRef.current)
      qwertyHeldRef.current = {}
      for (const note of heldNotes) {
        void sendNoteOff(note, 'qwerty')
      }
    }
  }, [sendNoteOn, sendNoteOff])

  useEffect(() => {
    return () => {
      const heldNotes = Object.keys(pointerHeldRef.current).map((note) => Number(note))
      pointerHeldRef.current = {}
      for (const note of heldNotes) {
        void sendNoteOff(note, 'on-screen')
      }
    }
  }, [sendNoteOff])

  useEffect(() => {
    if (!selectedPatch && patchValueList.length > 0) {
      setSelectedPatch(`${patchValueList[0].bank}:${patchValueList[0].program}`)
    }
  }, [patchValueList, selectedPatch])

  useEffect(() => {
    if (streamingConfig) {
      setStreamingDraft(streamingConfig)
    }
  }, [streamingConfig])

  useEffect(() => {
    if (hotReloadStatus) {
      setHotReloadEnabled(hotReloadStatus.enabled)
      setHotReloadIntervalMs(hotReloadStatus.interval_ms)
    }
  }, [hotReloadStatus])

  useEffect(() => {
    if (scalaTuning) {
      setScalaPath(scalaTuning.scala_path ?? '')
      setScalaRoot(scalaTuning.root_key ?? 60)
      setScalaReferenceHz(scalaTuning.reference_hz ?? 440)
    }
  }, [scalaTuning])

  useEffect(() => {
    if (mpeConfig) {
      setMpeEnabled(mpeConfig.enabled)
      setMpeLowerZone(mpeConfig.lower_zone_channels)
      setMpeUpperZone(mpeConfig.upper_zone_channels)
      setMpePitchRange(mpeConfig.pitch_bend_range_semitones)
    }
  }, [mpeConfig])

  useEffect(() => {
    if (!hotReloadEnabled) return undefined

    const timer = window.setInterval(() => {
      if (hotReloadInFlightRef.current) return
      hotReloadInFlightRef.current = true

      void synthforgeApi.reloadSfzIfChanged(activePart)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['synthforge', 'sfz', 'status', activePart] })
          queryClient.invalidateQueries({ queryKey: ['synthforge', 'hot-reload', activePart] })
          queryClient.invalidateQueries({ queryKey: ['synthforge', 'backend-status', activePart] })
        })
        .catch(() => {
          // Best-effort poller: errors are surfaced via status endpoints.
        })
        .finally(() => {
          hotReloadInFlightRef.current = false
        })
    }, Math.max(100, hotReloadIntervalMs))

    return () => {
      window.clearInterval(timer)
    }
  }, [activePart, hotReloadEnabled, hotReloadIntervalMs, queryClient])

  const updatePartConfig = useCallback((patch: Partial<SynthForgePartConfig>) => {
    const next: SynthForgePartConfig = {
      ...currentPart,
      ...patch,
      part_index: activePart,
    }
    setPartConfigMutation.mutate({ partIndex: activePart, config: next })
  }, [activePart, currentPart, setPartConfigMutation])

  const setPartParam = useCallback((param: string, value: number) => {
    setParamMutation.mutate({ partIndex: activePart, param, value })
  }, [activePart, setParamMutation])

  const handlePatchLoad = useCallback((value: string) => {
    setSelectedPatch(value)
    const [bankRaw, programRaw] = value.split(':')
    const bank = Number(bankRaw)
    const program = Number(programRaw)
    if (!Number.isFinite(bank) || !Number.isFinite(program)) return
    loadPatchMutation.mutate({ partIndex: activePart, bank, program })
  }, [activePart, loadPatchMutation])

  const handlePatchSave = useCallback(() => {
    const name = saveName.trim()
    if (!name) return
    savePatchMutation.mutate({
      partIndex: activePart,
      bank: Math.max(0, saveBank),
      program: Math.max(0, saveProgram),
      name,
    })
  }, [activePart, saveBank, saveName, savePatchMutation, saveProgram])

  const handleLoadManualPath = useCallback(() => {
    const path = manualPath.trim()
    if (!path) return
    loadSfzMutation.mutate({ partIndex: activePart, sfzPath: path })
  }, [activePart, manualPath, loadSfzMutation])

  const handleHotReload = useCallback(() => {
    const path = sfzStatus?.sfz_path || manualPath.trim()
    if (!path) return
    loadSfzMutation.mutate({ partIndex: activePart, sfzPath: path })
  }, [activePart, loadSfzMutation, manualPath, sfzStatus?.sfz_path])

  const handleApplyStreaming = useCallback(() => {
    setStreamingMutation.mutate({ partIndex: activePart, config: streamingDraft })
  }, [activePart, setStreamingMutation, streamingDraft])

  const handleApplyHotReload = useCallback(() => {
    setHotReloadMutation.mutate({
      partIndex: activePart,
      enabled: hotReloadEnabled,
      intervalMs: hotReloadIntervalMs,
    })
  }, [activePart, hotReloadEnabled, hotReloadIntervalMs, setHotReloadMutation])

  const handleReloadIfChanged = useCallback(() => {
    reloadIfChangedMutation.mutate({ partIndex: activePart })
  }, [activePart, reloadIfChangedMutation])

  const handleApplyScala = useCallback(() => {
    const path = scalaPath.trim()
    if (!path) return
    loadScalaMutation.mutate({
      partIndex: activePart,
      scalaPath: path,
      rootKey: scalaRoot,
      referenceHz: scalaReferenceHz,
    })
  }, [activePart, loadScalaMutation, scalaPath, scalaReferenceHz, scalaRoot])

  const handleApplyMpe = useCallback(() => {
    setMpeMutation.mutate({
      partIndex: activePart,
      config: {
        enabled: mpeEnabled,
        lower_zone_channels: mpeLowerZone,
        upper_zone_channels: mpeUpperZone,
        pitch_bend_range_semitones: mpePitchRange,
      },
    })
  }, [activePart, mpeEnabled, mpeLowerZone, mpePitchRange, mpeUpperZone, setMpeMutation])

  const handleAddModRoute = useCallback(() => {
    const nextRoutes = [...modMatrixRoutes]
    nextRoutes.push({
      source: modSource.trim() || 'cc.1',
      destination: modDestination,
      amount: modAmount,
      bipolar: false,
      enabled: true,
    })
    setModMatrixMutation.mutate({ partIndex: activePart, routes: nextRoutes })
  }, [activePart, modAmount, modDestination, modMatrixRoutes, modSource, setModMatrixMutation])

  const handleClearModRoutes = useCallback(() => {
    setModMatrixMutation.mutate({ partIndex: activePart, routes: [] })
  }, [activePart, setModMatrixMutation])

  const handleToggleFreeze = useCallback(() => {
    const enabled = !(freezeStatus?.freeze_enabled ?? false)
    setFreezeMutation.mutate({ partIndex: activePart, enabled })
  }, [activePart, freezeStatus?.freeze_enabled, setFreezeMutation])

  const handleRenderToFile = useCallback(() => {
    const path = renderPath.trim()
    if (!path) return
    renderPartMutation.mutate({ partIndex: activePart, outputPath: path, durationMs: 2000 })
  }, [activePart, renderPartMutation, renderPath])

  const handleKeyboardPointerDown = useCallback((note: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerHeldRef.current[note]) return
    pointerHeldRef.current[note] = true
    event.currentTarget.setPointerCapture(event.pointerId)
    void sendNoteOn(note, 'on-screen', 100)
  }, [sendNoteOn])

  const handleKeyboardPointerUp = useCallback((note: number) => {
    if (!pointerHeldRef.current[note]) return
    delete pointerHeldRef.current[note]
    void sendNoteOff(note, 'on-screen')
  }, [sendNoteOff])

  const statusHasPath = Boolean(sfzStatus?.sfz_path)
  const activePatchList = filteredPatches.length > 0 ? filteredPatches : patchValueList

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      showBypass={false}
      showPresetControls={false}
      showMoreMenu={false}
      className={`synthforge-shell synthforge-shell-${theme}`}
    >
      <div className={`synthforge-card synthforge-theme-${theme}`}>
        <div className="synthforge-topbar">
          <div className="synthforge-topbar-left">
            <button
              className="synthforge-instrument-button"
              onClick={() => setShowFullPath((prev) => !prev)}
              title={sfzStatus?.sfz_path || getDisplayPluginName(plugin.name, plugin.uri)}
            >
              {instrumentName}
            </button>
            <label className="synthforge-inline-field">
              Part
              <select
                value={activePart}
                onChange={(event) => setActivePart(Number(event.target.value))}
              >
                {Array.from({ length: 16 }, (_, index) => (
                  <option key={index} value={index}>Part {index + 1}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="synthforge-topbar-center">
            {patchValueList.length > 12 && (
              <input
                className="synthforge-text-input"
                placeholder="Search patch"
                value={patchSearch}
                onChange={(event) => setPatchSearch(event.target.value)}
              />
            )}
            <label className="synthforge-inline-field">
              Patch
              <select
                value={selectedPatchValue}
                onChange={(event) => handlePatchLoad(event.target.value)}
                disabled={patchValueList.length === 0 || loadPatchMutation.isPending}
              >
                {activePatchList.map((patch) => {
                  const value = `${patch.bank}:${patch.program}`
                  return (
                    <option key={value} value={value}>
                      {patch.name}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>

          <div className="synthforge-topbar-right">
            <div className="synthforge-voice-summary">
              <strong>{activeVoices}</strong>
              <span>Active</span>
              <strong>{partVoices}</strong>
              <span>Part</span>
              <strong>{peakVoices}</strong>
              <span>Peak</span>
            </div>
            <button
              className="synthforge-icon-button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={15} weight="duotone" /> : <Moon size={15} weight="duotone" />}
            </button>
          </div>
        </div>

        {showFullPath && sfzStatus?.sfz_path && (
          <div className="synthforge-path-bar">{sfzStatus.sfz_path}</div>
        )}

        <div className="synthforge-grid">
          <section className="synthforge-panel">
            <div className="synthforge-panel-title">Part Routing</div>

            <label className="synthforge-field">
              MIDI Channel
              <select
                value={currentPart.midi_channel}
                onChange={(event) => updatePartConfig({ midi_channel: Number(event.target.value) })}
              >
                <option value={0}>OMNI</option>
                {Array.from({ length: 16 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>Channel {index + 1}</option>
                ))}
              </select>
            </label>

            <label className="synthforge-field">
              Output Bus
              <select
                value={currentPart.output_bus}
                onChange={(event) => updatePartConfig({ output_bus: event.target.value })}
              >
                {OUTPUT_BUSES.map((bus) => (
                  <option key={bus} value={bus}>{bus}</option>
                ))}
              </select>
            </label>

            <SliderField
              label="Level"
              value={currentPart.level}
              min={0}
              max={1}
              step={0.01}
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updatePartConfig({ level: value })}
            />

            <SliderField
              label="Pan"
              value={currentPart.pan}
              min={-1}
              max={1}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
              onChange={(value) => updatePartConfig({ pan: value })}
            />

            <div className="synthforge-button-row">
              <button
                className={currentPart.mute ? 'active' : ''}
                onClick={() => updatePartConfig({ mute: !currentPart.mute })}
              >
                Mute
              </button>
              <button
                className={currentPart.solo ? 'active' : ''}
                onClick={() => updatePartConfig({ solo: !currentPart.solo })}
              >
                Solo
              </button>
            </div>

            <div className="synthforge-divider" />

            <div className="synthforge-panel-title">Patch Save</div>
            <div className="synthforge-compact-grid">
              <NumericField
                label="Bank"
                value={saveBank}
                min={0}
                max={16384}
                step={1}
                profile="integer"
                onChange={setSaveBank}
                defaultValue={0}
              />
              <NumericField
                label="Program"
                value={saveProgram}
                min={0}
                max={16384}
                step={1}
                profile="integer"
                onChange={setSaveProgram}
                defaultValue={0}
              />
            </div>
            <label className="synthforge-field">
              Patch Name
              <input
                type="text"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder="User Patch"
              />
            </label>
            <button
              className="synthforge-primary-button"
              onClick={handlePatchSave}
              disabled={savePatchMutation.isPending}
            >
              Save Patch
            </button>
          </section>

          <section className="synthforge-panel">
            <div className="synthforge-panel-title">Synth DSP</div>

            <label className="synthforge-field">
              Waveform
              <select
                value={waveformValue}
                onChange={(event) => setPartParam('osc1.waveform', Number(event.target.value))}
              >
                {WAVEFORMS.map((name, index) => (
                  <option key={name} value={index}>{name}</option>
                ))}
              </select>
            </label>

            <SliderField
              label="Osc Level"
              value={oscLevel}
              min={0}
              max={1}
              step={0.01}
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => setPartParam('osc1.level', value)}
            />

            <SliderField
              label="Coarse Tune"
              value={coarseTune}
              min={-24}
              max={24}
              step={1}
              formatter={(value) => `${Math.round(value)} st`}
              onChange={(value) => setPartParam('osc1.coarse', value)}
              profile="integer"
            />

            <SliderField
              label="Filter Cutoff"
              value={cutoffNormalized}
              min={0}
              max={1}
              step={0.001}
              formatter={() => `${Math.round(cutoffHz)} Hz`}
              onChange={(value) => setPartParam('filter1.cutoff', cutoffFromNormalized(value))}
            />

            <SliderField
              label="Filter Resonance"
              value={resonance}
              min={0.1}
              max={1.2}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
              onChange={(value) => setPartParam('filter1.resonance', value)}
            />

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Envelope</div>

            <SliderField
              label="Attack"
              value={attackMs}
              min={1}
              max={5000}
              step={1}
              formatter={(value) => `${Math.round(value)} ms`}
              onChange={(value) => setPartParam('amp.attack', value)}
            />

            <SliderField
              label="Decay"
              value={decayMs}
              min={1}
              max={5000}
              step={1}
              formatter={(value) => `${Math.round(value)} ms`}
              onChange={(value) => setPartParam('amp.decay', value)}
            />

            <SliderField
              label="Sustain"
              value={sustain}
              min={0}
              max={1}
              step={0.01}
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => setPartParam('amp.sustain', value)}
            />

            <SliderField
              label="Release"
              value={releaseMs}
              min={1}
              max={5000}
              step={1}
              formatter={(value) => `${Math.round(value)} ms`}
              onChange={(value) => setPartParam('amp.release', value)}
            />
          </section>

          <section className="synthforge-panel">
            <div className="synthforge-panel-title">SFZ Load & Browser</div>

            <div className="synthforge-status-grid">
              <span>Loaded</span>
              <strong>{sfzStatus?.loaded ? 'Yes' : 'No'}</strong>
              <span>Regions</span>
              <strong>{toNumber(sfzStatus?.region_count, 0)}</strong>
              <span>Samples</span>
              <strong>{toNumber(sfzStatus?.loaded_sample_count, 0)}</strong>
              <span>Sampler Mode</span>
              <strong>{sfzStatus?.sampler_mode ? 'Enabled' : 'Disabled'}</strong>
            </div>

            <div className="synthforge-load-row">
              <input
                className="synthforge-text-input"
                placeholder="/path/to/instrument.sfz"
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
              />
              <button onClick={handleLoadManualPath} disabled={loadSfzMutation.isPending}>Load</button>
              <button
                className={statusHasPath ? 'hot' : ''}
                onClick={handleHotReload}
                disabled={loadSfzMutation.isPending}
                title="Reload current SFZ"
              >
                <ArrowsClockwise size={14} weight="duotone" />
              </button>
            </div>

            <label className="synthforge-field">
              Search Library
              <input
                className="synthforge-text-input"
                placeholder="Search SFZ files"
                value={browserSearch}
                onChange={(event) => setBrowserSearch(event.target.value)}
              />
            </label>

            <div className="synthforge-browser-list">
              {filteredSoundfonts.map((item) => (
                <button
                  key={item.path}
                  className="synthforge-browser-item"
                  onClick={() => {
                    setManualPath(item.path)
                    loadSfzMutation.mutate({ partIndex: activePart, sfzPath: item.path })
                  }}
                >
                  <span className="name">{item.name}</span>
                  <span className="meta">{item.library} • {item.format.toUpperCase()}</span>
                </button>
              ))}
              {filteredSoundfonts.length === 0 && (
                <div className="synthforge-browser-empty">No SFZ files found in library index.</div>
              )}
            </div>
          </section>

          <section className="synthforge-panel">
            <div className="synthforge-panel-title">Sampler Engine</div>

            <label className="synthforge-field">
              Backend
              <select
                value={(backendStatus?.backend as 'native' | 'sfizz') || 'native'}
                onChange={(event) => {
                  const backend = event.target.value as 'native' | 'sfizz'
                  setSamplerBackendMutation.mutate({ partIndex: activePart, backend })
                }}
              >
                <option value="native">Native</option>
                <option value="sfizz">sfizz</option>
              </select>
            </label>

            <div className="synthforge-status-grid">
              <span>sfizz</span>
              <strong>{backendStatus?.sfizz_available ? 'Available' : 'Unavailable'}</strong>
              <span>Regions</span>
              <strong>{toNumber(backendStatus?.region_count, 0)}</strong>
              <span>Groups</span>
              <strong>{toNumber(backendStatus?.group_count, 0)}</strong>
              <span>Preloaded</span>
              <strong>{toNumber(backendStatus?.preloaded_samples, 0)}</strong>
            </div>
            {(backendStatus?.unknown_opcodes?.length ?? 0) > 0 && (
              <div className="synthforge-status-line">
                <span className="warn">
                  Unknown opcodes: {(backendStatus?.unknown_opcodes ?? []).join(', ')}
                </span>
              </div>
            )}

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Streaming & Quality</div>

            <label className="synthforge-field">
              Interpolation
              <select
                value={streamingDraft.interpolation}
                onChange={(event) => setStreamingDraft((prev) => ({
                  ...prev,
                  interpolation: event.target.value as SynthForgeStreamingConfig['interpolation'],
                }))}
              >
                <option value="linear">Linear</option>
                <option value="hermite">Hermite</option>
                <option value="sinc">Sinc</option>
              </select>
            </label>

            <div className="synthforge-compact-grid">
              <NumericField
                label="Preload (bytes)"
                value={streamingDraft.preload_size}
                min={16384}
                max={16777216}
                step={4096}
                profile="integer"
                onChange={(value) => setStreamingDraft((prev) => ({
                  ...prev,
                  preload_size: value,
                }))}
                defaultValue={262144}
              />
              <NumericField
                label="Max Voices"
                value={streamingDraft.max_voices}
                min={8}
                max={512}
                step={1}
                profile="integer"
                onChange={(value) => setStreamingDraft((prev) => ({
                  ...prev,
                  max_voices: value,
                }))}
                defaultValue={64}
              />
            </div>

            <div className="synthforge-compact-grid">
              <NumericField
                label="Live Quality"
                value={streamingDraft.quality_live}
                min={0}
                max={10}
                step={1}
                profile="integer"
                onChange={(value) => setStreamingDraft((prev) => ({
                  ...prev,
                  quality_live: value,
                }))}
                defaultValue={4}
              />
              <NumericField
                label="Freewheel Quality"
                value={streamingDraft.quality_freewheeling}
                min={0}
                max={10}
                step={1}
                profile="integer"
                onChange={(value) => setStreamingDraft((prev) => ({
                  ...prev,
                  quality_freewheeling: value,
                }))}
                defaultValue={6}
              />
            </div>

            <button className="synthforge-primary-button" onClick={handleApplyStreaming} disabled={setStreamingMutation.isPending}>
              Apply Streaming
            </button>

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Hot Reload</div>
            <div className="synthforge-button-row">
              <button className={hotReloadEnabled ? 'active' : ''} onClick={() => setHotReloadEnabled((prev) => !prev)}>
                {hotReloadEnabled ? 'Enabled' : 'Disabled'}
              </button>
              <NumericField
                value={hotReloadIntervalMs}
                min={100}
                max={10000}
                step={1}
                profile="integer"
                onChange={setHotReloadIntervalMs}
                showLabel={false}
                className="synthforge-inline-number"
                defaultValue={1000}
              />
            </div>
            <div className="synthforge-button-row">
              <button onClick={handleApplyHotReload} disabled={setHotReloadMutation.isPending}>Apply Reload Policy</button>
              <button onClick={handleReloadIfChanged} disabled={reloadIfChangedMutation.isPending}>Check Now</button>
            </div>

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Scala & MPE</div>
            <div className="synthforge-load-row">
              <input
                className="synthforge-text-input"
                placeholder="/path/to/scale.scl"
                value={scalaPath}
                onChange={(event) => setScalaPath(event.target.value)}
              />
              <button onClick={handleApplyScala} disabled={loadScalaMutation.isPending}>Load Scala</button>
            </div>
            <div className="synthforge-compact-grid">
              <NumericField
                label="Root"
                value={scalaRoot}
                min={0}
                max={127}
                step={1}
                profile="integer"
                onChange={setScalaRoot}
                defaultValue={69}
              />
              <NumericField
                label="Ref Hz"
                value={scalaReferenceHz}
                min={300}
                max={500}
                step={0.1}
                unit="Hz"
                profile="frequency"
                onChange={setScalaReferenceHz}
                defaultValue={440}
              />
            </div>

            <div className="synthforge-compact-grid">
              <label className="synthforge-field">
                MPE
                <select
                  value={mpeEnabled ? 'on' : 'off'}
                  onChange={(event) => setMpeEnabled(event.target.value === 'on')}
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>
              <NumericField
                label="PB Range"
                value={mpePitchRange}
                min={1}
                max={96}
                step={1}
                profile="integer"
                onChange={setMpePitchRange}
                defaultValue={48}
              />
            </div>
            <div className="synthforge-compact-grid">
              <NumericField
                label="Lower Zone"
                value={mpeLowerZone}
                min={0}
                max={15}
                step={1}
                profile="integer"
                onChange={setMpeLowerZone}
                defaultValue={1}
              />
              <NumericField
                label="Upper Zone"
                value={mpeUpperZone}
                min={0}
                max={15}
                step={1}
                profile="integer"
                onChange={setMpeUpperZone}
                defaultValue={15}
              />
            </div>
            <button onClick={handleApplyMpe} disabled={setMpeMutation.isPending}>Apply MPE</button>

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Mod Matrix</div>
            <div className="synthforge-compact-grid">
              <label className="synthforge-field">
                Source
                <input
                  type="text"
                  value={modSource}
                  onChange={(event) => setModSource(event.target.value)}
                />
              </label>
              <label className="synthforge-field">
                Destination
                <select
                  value={modDestination}
                  onChange={(event) => setModDestination(event.target.value)}
                >
                  {MOD_DESTINATIONS.map((dest) => (
                    <option key={dest} value={dest}>{dest}</option>
                  ))}
                </select>
              </label>
            </div>
            <SliderField
              label="Amount"
              value={modAmount}
              min={-1}
              max={1}
              step={0.01}
              formatter={(value) => value.toFixed(2)}
              onChange={setModAmount}
            />
            <div className="synthforge-button-row">
              <button onClick={handleAddModRoute} disabled={setModMatrixMutation.isPending}>Add Route</button>
              <button onClick={handleClearModRoutes} disabled={setModMatrixMutation.isPending || modMatrixRoutes.length === 0}>
                Clear
              </button>
            </div>
            <div className="synthforge-note-events synthforge-mod-routes">
              {modMatrixRoutes.length === 0 && (
                <div className="synthforge-note-empty">No modulation routes configured</div>
              )}
              {modMatrixRoutes.map((route, index) => (
                <div key={`${route.source}-${route.destination}-${index}`} className="synthforge-note-event">
                  <strong>{route.source}</strong>
                  <span>→ {route.destination}</span>
                  <span>{route.amount.toFixed(2)}</span>
                  <span>{route.enabled ? 'enabled' : 'disabled'}</span>
                </div>
              ))}
            </div>

            <div className="synthforge-divider" />
            <div className="synthforge-panel-title">Freeze, Render, Analyzer</div>
            <div className="synthforge-button-row">
              <button
                className={freezeStatus?.freeze_enabled ? 'active' : ''}
                onClick={handleToggleFreeze}
                disabled={setFreezeMutation.isPending}
              >
                {freezeStatus?.freeze_enabled ? 'Freeze On' : 'Freeze Off'}
              </button>
              <span className="synthforge-inline-meta">
                {freezeStatus?.frozen_signal_ready ? `Frozen ${freezeStatus.freeze_samples} smp` : 'Not frozen'}
              </span>
            </div>

            <div className="synthforge-load-row">
              <input
                className="synthforge-text-input"
                value={renderPath}
                onChange={(event) => setRenderPath(event.target.value)}
                placeholder="/tmp/synthforge-render.wav"
              />
              <button onClick={handleRenderToFile} disabled={renderPartMutation.isPending}>Render WAV</button>
            </div>

            <div className="synthforge-status-grid">
              <span>Peak L/R</span>
              <strong>{`${toNumber(analyzerFrame?.peak_left, 0).toFixed(3)} / ${toNumber(analyzerFrame?.peak_right, 0).toFixed(3)}`}</strong>
              <span>RMS L/R</span>
              <strong>{`${toNumber(analyzerFrame?.rms_left, 0).toFixed(3)} / ${toNumber(analyzerFrame?.rms_right, 0).toFixed(3)}`}</strong>
              <span>MIDI Events</span>
              <strong>{toNumber(analyzerFrame?.midi_events, 0)}</strong>
              <span>Active Voices</span>
              <strong>{toNumber(analyzerFrame?.active_voices, 0)}</strong>
            </div>
          </section>

          <section className="synthforge-panel synthforge-keyboard-panel">
            <div className="synthforge-panel-title">
              <PianoKeys size={14} weight="duotone" />
              Keyboard & MIDI Activity
            </div>
            <div className="synthforge-keyboard-hint">
              Input channel: <strong>{partChannel}</strong> • QWERTY layout active (`Z-M`, `Q-P`, sharps on adjacent keys)
            </div>

            <div className="synthforge-keyboard-strip">
              {keyboardNotes.map((note) => {
                const velocity = activeNoteVelocity.get(note) ?? 0
                const style = {
                  '--key-accent': accentColor,
                } as CSSProperties

                return (
                  <button
                    key={note}
                    className={[
                      'synthforge-midi-key',
                      isBlackNote(note) ? 'is-black' : 'is-white',
                      velocity > 0 ? 'is-active' : '',
                    ].join(' ')}
                    style={style}
                    onPointerDown={handleKeyboardPointerDown(note)}
                    onPointerUp={() => handleKeyboardPointerUp(note)}
                    onPointerCancel={() => handleKeyboardPointerUp(note)}
                    onPointerLeave={() => handleKeyboardPointerUp(note)}
                    title={`${noteLabel(note)} (${note})`}
                  >
                    <span>{noteLabel(note)}</span>
                  </button>
                )
              })}
            </div>

            <div className="synthforge-active-notes">
              {activeNoteList.length === 0 && (
                <div className="synthforge-note-empty">No active notes</div>
              )}
              {activeNoteList.map((item) => (
                <div key={`${item.channel}:${item.note}`} className="synthforge-note-chip">
                  <strong>{noteLabel(item.note)}</strong>
                  <span>CH {item.channel}</span>
                  <span>VEL {item.velocity}</span>
                  <span>{item.source}</span>
                </div>
              ))}
            </div>

            <div className="synthforge-note-events">
              {noteEvents.length === 0 && (
                <div className="synthforge-note-empty">Awaiting MIDI note events...</div>
              )}
              {noteEvents.map((event) => (
                <div key={event.id} className={`synthforge-note-event ${event.type}`}>
                  <span>{new Date(event.updatedAt).toLocaleTimeString()}</span>
                  <strong>{event.type === 'note_on' ? 'ON' : 'OFF'}</strong>
                  <span>{noteLabel(event.note)} ({event.note})</span>
                  <span>CH {event.channel}</span>
                  <span>VEL {event.velocity}</span>
                  <span>{event.source}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {(sfzStatus?.last_error || (sfzStatus?.warnings?.length ?? 0) > 0 || noteApiError) && (
          <div className="synthforge-status-line">
            {sfzStatus?.last_error && <span className="error">{sfzStatus.last_error}</span>}
            {sfzStatus?.warnings?.map((warning) => <span key={warning} className="warn">{warning}</span>)}
            {noteApiError && <span className="warn">{noteApiError}</span>}
          </div>
        )}
      </div>
    </PluginCardShell>
  )
}

export default SynthForgeCard
