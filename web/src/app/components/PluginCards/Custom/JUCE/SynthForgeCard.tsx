import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowsClockwise,
  GearSix,
  Moon,
  PianoKeys,
  Question,
  Sun,
  Waves,
} from '@phosphor-icons/react'

import { PluginCardShell } from '../../Base/PluginCardShell'
import type { PluginCardProps } from '../../types'
import {
  soundfontApi,
  synthforgeApi,
  type SynthForgePartConfig,
} from '../../../../../map2/api'
import type { SoundFont } from '../../../../types/library'
import './SynthForgeCard.css'

type SynthForgeTab = 'main' | 'mod' | 'fx' | 'mapping' | 'browser'
type ThemeMode = 'dark' | 'light'

const TABS: Array<{ id: SynthForgeTab; label: string }> = [
  { id: 'main', label: 'Main' },
  { id: 'mod', label: 'Mod' },
  { id: 'fx', label: 'FX' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'browser', label: 'Browser' },
]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
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

interface MacroDialProps {
  label: string
  value: number
  min: number
  max: number
  accent: string
  formatter?: (value: number) => string
  onChange: (value: number) => void
}

function MacroDial({
  label,
  value,
  min,
  max,
  accent,
  formatter,
  onChange,
}: MacroDialProps) {
  const normalized = clamp((value - min) / (max - min), 0, 1)
  const display = formatter ? formatter(value) : `${Math.round(value)}`

  return (
    <div className="sf2-macro-dial">
      <div
        className="sf2-macro-ring"
        style={{
          '--dial-fill': `${normalized * 360}deg`,
          '--dial-accent': accent,
        } as React.CSSProperties}
      >
        <div className="sf2-macro-core">
          <div className="sf2-macro-value">{display}</div>
          <div className="sf2-macro-label">{label}</div>
        </div>
      </div>
      <input
        className="sf2-macro-slider"
        type="range"
        min={min}
        max={max}
        value={value}
        step={(max - min) / 200}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

export function SynthForgeCard({
  plugin,
  accentColor = '#3dd6cc',
  compact = false,
}: PluginCardProps) {
  const queryClient = useQueryClient()

  const [activePart, setActivePart] = useState(0)
  const [activeTab, setActiveTab] = useState<SynthForgeTab>('main')
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [showFullPath, setShowFullPath] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [patchSearch, setPatchSearch] = useState('')
  const [selectedPatch, setSelectedPatch] = useState('')
  const [browserSearch, setBrowserSearch] = useState('')
  const [manualPath, setManualPath] = useState('')
  const [xyPoint, setXyPoint] = useState({ x: 0.55, y: 0.4 })
  const [isDraggingXy, setIsDraggingXy] = useState(false)

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
    refetchInterval: 1200,
  })

  const sfzStatusQuery = useQuery({
    queryKey: ['synthforge', 'sfz', 'status', activePart],
    queryFn: () => synthforgeApi.getSfzStatus(activePart),
    refetchInterval: 1000,
  })

  const soundfontsQuery = useQuery({
    queryKey: ['soundfonts', 'synthforge', 'browser'],
    queryFn: () => soundfontApi.listSoundfonts({ limit: 300, format: 'sfz' }),
    staleTime: 20_000,
    enabled: activeTab === 'browser',
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

  const currentPart = useMemo(() => {
    const found = partsQuery.data?.find((part) => part.part_index === activePart)
    return found ?? defaultPart(activePart)
  }, [partsQuery.data, activePart])

  const params = paramsQuery.data ?? {}
  const voices = voicesQuery.data
  const sfzStatus = sfzStatusQuery.data
  const cpuPercent = toNumber(voices?.cpu_percent, 0)
  const activeVoices = toNumber(voices?.active_voices, 0)
  const peakVoices = toNumber(voices?.peak_voices, 0)
  const partVoices = toNumber(voices?.voices_per_part?.[activePart], 0)

  const macroValues = useMemo(() => {
    return {
      brightness: toNumber(params['filter1.cutoff'], 12000),
      attack: toNumber(params['amp.attack'], 12),
      reverb: toNumber(params['fx.reverb_send'], 0.2),
      space: toNumber(params['fx.space'], 0.3),
      motion: toNumber(params['lfo1.rate'], 0.4),
      body: toNumber(params['osc1.level'], 0.75),
      tune: toNumber(params['osc1.coarse'], 0),
      resonance: toNumber(params['filter1.resonance'], 0.35),
      decay: toNumber(params['amp.decay'], 120),
      sustain: toNumber(params['amp.sustain'], 0.8),
      release: toNumber(params['amp.release'], 260),
    }
  }, [params])

  const instrumentName = useMemo(() => {
    if (sfzStatus?.sfz_path) return getFileName(sfzStatus.sfz_path)
    return plugin.name
  }, [sfzStatus?.sfz_path, plugin.name])

  const patchFilter = patchSearch.trim().toLowerCase()
  const filteredPatches = useMemo(() => {
    if (!patchFilter) return patchesQuery.data ?? []
    return (patchesQuery.data ?? []).filter((patch) =>
      patch.name.toLowerCase().includes(patchFilter)
    )
  }, [patchesQuery.data, patchFilter])

  const patchValueList = patchesQuery.data ?? []
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

  const waveformBars = useMemo(() => {
    return Array.from({ length: 56 }, (_, index) => {
      const value = Math.sin((index * 0.4) + 0.8) * 0.4 + 0.5
      return clamp(value, 0.08, 0.96)
    })
  }, [])

  const pianoKeys = useMemo(() => {
    return Array.from({ length: 36 }, (_, index) => {
      const name = NOTE_NAMES[index % NOTE_NAMES.length]
      const isBlack = name.includes('#')
      const isKeyswitch = index < 3
      const isVelocityBand = index >= 8 && index <= 24
      return { index, name, isBlack, isKeyswitch, isVelocityBand }
    })
  }, [])

  const adsrPath = useMemo(() => {
    const attackNorm = clamp(macroValues.attack / 5000, 0.03, 0.35)
    const decayNorm = clamp(macroValues.decay / 5000, 0.05, 0.28)
    const sustainNorm = clamp(macroValues.sustain, 0.05, 0.95)
    const releaseNorm = clamp(macroValues.release / 5000, 0.06, 0.4)

    const width = 270
    const height = 78
    const baseline = height - 8
    const peakY = 8
    const sustainY = baseline - (sustainNorm * (baseline - peakY))

    const attackX = width * attackNorm
    const decayX = attackX + (width * decayNorm)
    const releaseStartX = width - (width * releaseNorm)

    return [
      `M0 ${baseline}`,
      `L${attackX.toFixed(2)} ${peakY}`,
      `L${decayX.toFixed(2)} ${sustainY.toFixed(2)}`,
      `L${releaseStartX.toFixed(2)} ${sustainY.toFixed(2)}`,
      `L${width} ${baseline}`,
    ].join(' ')
  }, [macroValues.attack, macroValues.decay, macroValues.sustain, macroValues.release])

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

  const handleXyUpdate = useCallback((x: number, y: number) => {
    setXyPoint({ x, y })
    setPartParam('filter1.cutoff', cutoffFromNormalized(x))
    setPartParam('filter1.resonance', clamp(1.2 - y, 0.1, 1.2))
  }, [setPartParam])

  const onXyPointerEvent = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    handleXyUpdate(x, y)
  }, [handleXyUpdate])

  const meterState = cpuPercent > 72 ? 'danger' : cpuPercent > 45 ? 'warn' : 'ok'
  const statusHasPath = Boolean(sfzStatus?.sfz_path)

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
          <div className="synthforge-top-left">
            <button
              className="synthforge-instrument-button"
              onClick={() => setShowFullPath((prev) => !prev)}
              title={sfzStatus?.sfz_path || plugin.name}
            >
              {instrumentName}
            </button>
            <select
              className="synthforge-part-select"
              value={activePart}
              onChange={(event) => setActivePart(Number(event.target.value))}
            >
              {Array.from({ length: 16 }, (_, index) => (
                <option key={index} value={index}>Part {index + 1}</option>
              ))}
            </select>
          </div>

          <div className="synthforge-top-center">
            {patchValueList.length > 20 && (
              <input
                className="synthforge-patch-search"
                placeholder="Search patch..."
                value={patchSearch}
                onChange={(event) => setPatchSearch(event.target.value)}
              />
            )}
            <select
              className="synthforge-patch-select"
              value={selectedPatchValue}
              onChange={(event) => handlePatchLoad(event.target.value)}
            >
              {(filteredPatches.length > 0 ? filteredPatches : patchValueList).map((patch) => {
                const value = `${patch.bank}:${patch.program}`
                return (
                  <option key={value} value={value}>
                    {patch.name}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="synthforge-top-right">
            <div className={`synthforge-cpu-meter synthforge-cpu-meter-${meterState}`}>
              <div
                className="synthforge-cpu-fill"
                style={{ width: `${clamp(cpuPercent, 0, 100)}%` }}
              />
              <span className="synthforge-cpu-label">
                {cpuPercent.toFixed(1)}% • {activeVoices}/{Math.max(peakVoices, 1)}
              </span>
            </div>
            <button className="synthforge-icon-button" onClick={() => setShowHelp((prev) => !prev)} title="Help">
              <Question size={15} weight="duotone" />
            </button>
            <button className="synthforge-icon-button" title="Settings">
              <GearSix size={15} weight="duotone" />
            </button>
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

        {showHelp && (
          <div className="synthforge-help-bar">
            Minimal performance view: switch tabs for Mod/FX/Mapping/Browser, load SFZ from browser or manual path, and use Hot Reload after editing files externally.
          </div>
        )}

        <div className="synthforge-zones">
          <section className="synthforge-zone synthforge-zone-top">
            <div className="synthforge-wave-strip">
              <div className="synthforge-zone-title"><Waves size={13} weight="duotone" /> Waveform Preview</div>
              <div className="synthforge-wave-bars">
                {waveformBars.map((bar, index) => (
                  <span
                    key={`${index}-${bar}`}
                    style={{ height: `${Math.round(bar * 100)}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="synthforge-keyboard-overview">
              <div className="synthforge-zone-title"><PianoKeys size={13} weight="duotone" /> Key Mapping</div>
              <div className="synthforge-keys">
                {pianoKeys.map((key) => (
                  <div
                    key={`${key.name}-${key.index}`}
                    className={[
                      'synthforge-key',
                      key.isBlack ? 'black' : 'white',
                      key.isKeyswitch ? 'keyswitch' : '',
                      key.isVelocityBand ? 'velocity-band' : '',
                    ].join(' ')}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="synthforge-zone synthforge-zone-middle">
            <div className="synthforge-tab-row">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`synthforge-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'main' && (
              <div className="synthforge-main-tab">
                <div className="synthforge-macro-grid">
                  <MacroDial
                    label="Brightness"
                    value={macroValues.brightness}
                    min={20}
                    max={20000}
                    accent={accentColor}
                    formatter={(value) => `${Math.round(value)}Hz`}
                    onChange={(value) => setPartParam('filter1.cutoff', value)}
                  />
                  <MacroDial
                    label="Attack"
                    value={macroValues.attack}
                    min={1}
                    max={5000}
                    accent="#4cc9f0"
                    formatter={(value) => `${Math.round(value)}ms`}
                    onChange={(value) => setPartParam('amp.attack', value)}
                  />
                  <MacroDial
                    label="Reverb"
                    value={macroValues.reverb}
                    min={0}
                    max={1}
                    accent="#ff6ea8"
                    formatter={(value) => `${Math.round(value * 100)}%`}
                    onChange={(value) => setPartParam('fx.reverb_send', value)}
                  />
                  <MacroDial
                    label="Space"
                    value={macroValues.space}
                    min={0}
                    max={1}
                    accent="#b2f7ef"
                    formatter={(value) => `${Math.round(value * 100)}%`}
                    onChange={(value) => setPartParam('fx.space', value)}
                  />
                  <MacroDial
                    label="Motion"
                    value={macroValues.motion}
                    min={0}
                    max={2}
                    accent="#67d4ff"
                    formatter={(value) => `${value.toFixed(2)}Hz`}
                    onChange={(value) => setPartParam('lfo1.rate', value)}
                  />
                  <MacroDial
                    label="Body"
                    value={macroValues.body}
                    min={0}
                    max={1}
                    accent="#89f7fe"
                    formatter={(value) => `${Math.round(value * 100)}%`}
                    onChange={(value) => setPartParam('osc1.level', value)}
                  />
                </div>

                <div className="synthforge-perf-panel">
                  <label>
                    Volume
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={currentPart.level}
                      onChange={(event) => updatePartConfig({ level: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Pan
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={currentPart.pan}
                      onChange={(event) => updatePartConfig({ pan: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Tune (±24)
                    <input
                      type="range"
                      min={-24}
                      max={24}
                      step={1}
                      value={macroValues.tune}
                      onChange={(event) => setPartParam('osc1.coarse', Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Resonance
                    <input
                      type="range"
                      min={0.1}
                      max={1.2}
                      step={0.01}
                      value={macroValues.resonance}
                      onChange={(event) => setPartParam('filter1.resonance', Number(event.target.value))}
                    />
                  </label>
                </div>

                <div className="synthforge-xy-card">
                  <div className="synthforge-xy-title">Expressive XY</div>
                  <div
                    className="synthforge-xy-pad"
                    onPointerDown={(event) => {
                      setIsDraggingXy(true)
                      event.currentTarget.setPointerCapture(event.pointerId)
                      onXyPointerEvent(event)
                    }}
                    onPointerMove={(event) => {
                      if (isDraggingXy) onXyPointerEvent(event)
                    }}
                    onPointerUp={() => setIsDraggingXy(false)}
                    onPointerCancel={() => setIsDraggingXy(false)}
                  >
                    <span
                      className="synthforge-xy-dot"
                      style={{
                        left: `${xyPoint.x * 100}%`,
                        top: `${xyPoint.y * 100}%`,
                      }}
                    />
                  </div>
                  <div className="synthforge-xy-readout">
                    Cutoff {Math.round(cutoffFromNormalized(xyPoint.x))}Hz • Res {(clamp(1.2 - xyPoint.y, 0.1, 1.2)).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mod' && (
              <div className="synthforge-generic-tab">
                <div className="synthforge-matrix-grid">
                  <div className="head">Source</div>
                  <div className="head">Destination</div>
                  <div className="head">Amount</div>
                  {[
                    ['Velocity', 'Amp', '0.84'],
                    ['LFO1', 'Cutoff', '0.41'],
                    ['Aftertouch', 'Resonance', '0.22'],
                    ['ModWheel', 'Space', '0.37'],
                  ].map(([source, destination, amount]) => (
                    <div key={`${source}-${destination}`} className="row">
                      <span>{source}</span>
                      <span>{destination}</span>
                      <span>{amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'fx' && (
              <div className="synthforge-generic-tab">
                <label>
                  Reverb Send
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={macroValues.reverb}
                    onChange={(event) => setPartParam('fx.reverb_send', Number(event.target.value))}
                  />
                </label>
                <label>
                  Delay Send
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={toNumber(params['fx.delay_send'], 0.18)}
                    onChange={(event) => setPartParam('fx.delay_send', Number(event.target.value))}
                  />
                </label>
                <label>
                  Chorus Send
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={toNumber(params['fx.chorus_send'], 0.12)}
                    onChange={(event) => setPartParam('fx.chorus_send', Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            {activeTab === 'mapping' && (
              <div className="synthforge-generic-tab">
                <label>
                  Key Range
                  <input
                    type="range"
                    min={0}
                    max={127}
                    step={1}
                    value={Math.round(toNumber(params['mapping.key_center'], 60))}
                    onChange={(event) => setPartParam('mapping.key_center', Number(event.target.value))}
                  />
                </label>
                <label>
                  Velocity Focus
                  <input
                    type="range"
                    min={1}
                    max={127}
                    step={1}
                    value={Math.round(toNumber(params['mapping.velocity_focus'], 96))}
                    onChange={(event) => setPartParam('mapping.velocity_focus', Number(event.target.value))}
                  />
                </label>
                <label>
                  Round Robin
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={1}
                    value={Math.round(toNumber(params['mapping.rr_count'], 4))}
                    onChange={(event) => setPartParam('mapping.rr_count', Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            {activeTab === 'browser' && (
              <div className="synthforge-browser-tab">
                <div className="synthforge-browser-top">
                  <input
                    className="synthforge-browser-search"
                    placeholder="Search SFZ library..."
                    value={browserSearch}
                    onChange={(event) => setBrowserSearch(event.target.value)}
                  />
                  <span>{filteredSoundfonts.length} instruments</span>
                </div>
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
              </div>
            )}
          </section>

          <section className="synthforge-zone synthforge-zone-bottom">
            <div className="synthforge-midi-strip">
              <div className="synthforge-zone-title">MIDI Activity</div>
              <div className="synthforge-midi-lights">
                {Array.from({ length: 16 }, (_, channel) => {
                  const selected = channel === activePart
                  const active = selected && partVoices > 0
                  return <span key={channel} className={`light ${selected ? 'selected' : ''} ${active ? 'active' : ''}`} />
                })}
              </div>
            </div>

            <div className="synthforge-adsr-strip">
              <div className="synthforge-zone-title">Envelope</div>
              <svg viewBox="0 0 270 80" preserveAspectRatio="none">
                <path d={adsrPath} />
              </svg>
            </div>

            <div className="synthforge-load-strip">
              <div className="synthforge-zone-title">Hot Reload</div>
              <div className="synthforge-load-row">
                <input
                  className="synthforge-path-input"
                  placeholder="/path/to/instrument.sfz"
                  value={manualPath}
                  onChange={(event) => setManualPath(event.target.value)}
                />
                <button onClick={handleLoadManualPath} disabled={loadSfzMutation.isPending}>Load</button>
                <button
                  className={statusHasPath ? 'hot' : ''}
                  onClick={handleHotReload}
                  disabled={loadSfzMutation.isPending}
                >
                  <ArrowsClockwise size={14} weight="duotone" />
                </button>
              </div>
              <div className="synthforge-part-controls">
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
            </div>
          </section>
        </div>

        {(sfzStatus?.last_error || (sfzStatus?.warnings?.length ?? 0) > 0) && (
          <div className="synthforge-status-line">
            {sfzStatus.last_error && <span className="error">{sfzStatus.last_error}</span>}
            {sfzStatus.warnings?.map((warning) => <span key={warning} className="warn">{warning}</span>)}
          </div>
        )}
      </div>
    </PluginCardShell>
  )
}

export default SynthForgeCard
