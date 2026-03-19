/**
 * DrumMachineCard - Sophisticated Drum Machine with Mode-Specific Controls
 *
 * Three fully distinct UI modes:
 * - Practice: Style selector, count-in, auto-fill, quantization
 * - Advanced: Pattern/variation editing, detailed pack browser
 * - Backing Tracks: Song section navigation, feel/time-sig display
 *
 * Features:
 * - Real-time transport with animated beat indicator
 * - Tap tempo with running average
 * - Factory + generated drum pack browsers with details
 * - Full MIDI mapping support via withMidiDialog
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Flash, Folder, Headphones, Hashtag, Music, Playlist, Play, SettingsAdjust, StackLimitation, StopFilled, VolumeUp,
} from '@carbon/icons-react'
import { useQuery } from '@tanstack/react-query'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import type { DrumMachineState, DrumPack } from '@/map2/types'

// ── Constants ──────────────────────────────────────────────

const DRUM_MACHINE_URI = 'map2://juce/drums'

const DRUM_MACHINE_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'BPM', symbol: 'bpm' },
  { index: 1, name: 'Volume', symbol: 'volume' },
  { index: 2, name: 'Pattern', symbol: 'pattern' },
  { index: 3, name: 'Variation', symbol: 'variation' },
  { index: 4, name: 'Transport', symbol: 'transport' },
]

const MODE_CONFIG = {
  practice:      { label: 'Practice', icon: Headphones, color: '#22c55e', desc: 'Guided practice with count-in & auto-fill' },
  advanced:      { label: 'Advanced', icon: SettingsAdjust,    color: '#f59e0b', desc: 'Full pattern & pack editing' },
  backing_tracks:{ label: 'Backing',  icon: Music,      color: '#8b5cf6', desc: 'Song sections & performance' },
} as const

// ── Inline Styles ──────────────────────────────────────────

const S = {
  modeBar: {
    display: 'flex', gap: 4, marginBottom: 14, padding: 3,
    background: '#111827', borderRadius: 10,
  } as React.CSSProperties,
  modeBtn: (active: boolean, color: string) => ({
    flex: 1, padding: '7px 6px', border: 'none', borderRadius: 8,
    fontWeight: 700, cursor: 'pointer', fontSize: 10,
    letterSpacing: '0.3px', transition: 'all 0.15s ease',
    background: active ? color : 'transparent',
    color: active ? '#000' : '#9ca3af',
    boxShadow: active ? `0 0 12px ${color}44` : 'none',
  } as React.CSSProperties),
  vizContainer: {
    padding: 16,
    background: 'linear-gradient(135deg, #0a0a14 0%, #0f1424 100%)',
    borderRadius: 10, marginBottom: 14, border: '1px solid #1e293b',
    position: 'relative' as const, overflow: 'hidden' as const,
  } as React.CSSProperties,
  bpmDisplay: (color: string) => ({
    textAlign: 'center' as const, marginBottom: 14,
    fontSize: 36, fontWeight: 800, color,
    fontFamily: 'var(--font-mono)',
    textShadow: `0 0 20px ${color}66`, letterSpacing: '-1px',
  } as React.CSSProperties),
  transportRow: {
    display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  } as React.CSSProperties,
  transportBtn: (active: boolean, color: string) => ({
    padding: '10px 18px', border: 'none', borderRadius: 8,
    fontWeight: 700, cursor: 'pointer', display: 'flex',
    alignItems: 'center', gap: 6, fontSize: 12, transition: 'all 0.15s',
    background: active ? color : '#1e293b', color: active ? '#000' : '#d1d5db',
    boxShadow: active ? `0 0 16px ${color}55` : 'none',
  } as React.CSSProperties),
  tapBtn: {
    padding: '10px 14px', background: '#1e293b', color: '#d1d5db',
    border: '1px solid #334155', borderRadius: 8, fontWeight: 600,
    cursor: 'pointer', fontSize: 11, transition: 'all 0.15s',
  } as React.CSSProperties,
  beatRow: {
    display: 'flex', gap: 4, justifyContent: 'center', marginTop: 10,
  } as React.CSSProperties,
  beatDot: (active: boolean, color: string) => ({
    width: 10, height: 10, borderRadius: '50%', transition: 'all 0.1s',
    background: active ? color : '#334155',
    boxShadow: active ? `0 0 8px ${color}` : 'none',
  } as React.CSSProperties),
  modeLabel: {
    textAlign: 'center' as const, fontSize: 10, color: '#6b7280',
    marginTop: 8, letterSpacing: '0.5px', textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  toggleRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', background: '#111827', borderRadius: 8, marginBottom: 6,
  } as React.CSSProperties,
  toggleLabel: { fontSize: 12, fontWeight: 600, color: '#d1d5db' } as React.CSSProperties,
  toggle: (on: boolean, color: string) => ({
    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
    background: on ? color : '#374151', position: 'relative' as const, transition: 'background 0.2s',
  } as React.CSSProperties),
  toggleKnob: (on: boolean) => ({
    width: 16, height: 16, borderRadius: '50%', background: '#fff',
    position: 'absolute' as const, top: 3, left: on ? 21 : 3, transition: 'left 0.2s',
  } as React.CSSProperties),
  packCard: (active: boolean, color: string) => ({
    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
    transition: 'all 0.15s', textAlign: 'left' as const,
    border: active ? `1px solid ${color}` : '1px solid #1e293b',
    background: active ? `${color}15` : '#111827',
  } as React.CSSProperties),
  packName: (active: boolean, color: string) => ({
    fontSize: 12, fontWeight: 700, color: active ? color : '#e5e7eb', marginBottom: 2,
  } as React.CSSProperties),
  packMeta: {
    fontSize: 10, color: '#6b7280', overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  emptyState: {
    padding: '16px 8px', textAlign: 'center' as const, fontSize: 12,
    color: '#6b7280', fontStyle: 'italic' as const,
  } as React.CSSProperties,
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', fontSize: 10, color: '#6b7280',
  } as React.CSSProperties,
  footerBadge: (color: string) => ({
    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
    background: `${color}22`, color, border: `1px solid ${color}44`,
  } as React.CSSProperties),
}

// ── Toggle Sub-Component ───────────────────────────────────

function Toggle({ on, color, onChange, label }: {
  on: boolean; color: string; onChange: (v: boolean) => void; label: string
}) {
  return (
    <div style={S.toggleRow}>
      <span style={S.toggleLabel}>{label}</span>
      <button style={S.toggle(on, color)} onClick={() => onChange(!on)}>
        <div style={S.toggleKnob(on)} />
      </button>
    </div>
  )
}

// ── Practice Mode Panel ────────────────────────────────────

function PracticeModePanel({ state }: { state: DrumMachineState }) {
  const color = MODE_CONFIG.practice.color
  return (
    <>
      <ParameterSection title="Practice Controls" icon={<Headphones size={14} />} accentColor={color}>
        <ParameterRow>
          <ParameterKnob
            label="Count-In" value={state.practice_count_in_bars}
            min={0} max={4} step={1} defaultValue={1} unit=" bars"
            onChange={v => drumsApi.updateState({ practice_count_in_bars: v })}
            accentColor={color} size="medium"
            valueFormatter={v => v === 0 ? 'Off' : `${v}`}
          />
          <ParameterKnob
            label="Quantize" value={state.practice_change_quantization}
            min={1} max={8} step={1} defaultValue={1} unit=" bars"
            onChange={v => drumsApi.updateState({ practice_change_quantization: v })}
            accentColor={color} size="medium"
          />
          <ParameterKnob
            label="Variation" value={state.practice_variation}
            min={0} max={10} step={1} defaultValue={0}
            onChange={v => drumsApi.updateState({ practice_variation: v })}
            accentColor={color} size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      <ParameterSection title="Automation" icon={<Flash size={14} />} accentColor={color}>
        <Toggle
          on={state.practice_auto_fill} color={color}
          onChange={v => drumsApi.updateState({ practice_auto_fill: v })}
          label="Auto-Fill at End of Phrase"
        />
        <div style={{ padding: '4px 12px', fontSize: 10, color: '#6b7280' }}>
          Automatically triggers a drum fill before the quantize boundary
        </div>
      </ParameterSection>
    </>
  )
}

// ── Advanced Mode Panel ────────────────────────────────────

function AdvancedModePanel({ state, factoryPacks, generatedPacks }: {
  state: DrumMachineState; factoryPacks: DrumPack[]; generatedPacks: DrumPack[]
}) {
  const color = MODE_CONFIG.advanced.color
  const [showAllPacks, setShowAllPacks] = useState(false)

  return (
    <>
      <ParameterSection title="Pattern Editor" icon={<Hashtag size={14} />} accentColor={color}>
        <ParameterRow>
          <ParameterKnob
            label="Pattern" value={state.pattern}
            min={0} max={127} step={1} defaultValue={0}
            onChange={v => drumsApi.updateState({ pattern: v })}
            accentColor={color} size="medium"
            valueFormatter={v => `P${String(v + 1).padStart(3, '0')}`}
          />
          <ParameterKnob
            label="Variation" value={state.variation}
            min={0} max={10} step={1} defaultValue={0}
            onChange={v => drumsApi.updateState({ variation: v })}
            accentColor={color} size="medium"
            valueFormatter={v => v === 0 ? 'Main' : `Var ${v}`}
          />
        </ParameterRow>
      </ParameterSection>

      <ParameterSection
        title={`Factory Packs (${factoryPacks.length})`}
        icon={<Folder size={14} />} accentColor={color} collapsible
      >
        {factoryPacks.length === 0 ? (
          <div style={S.emptyState}>No factory packs available</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(showAllPacks ? factoryPacks : factoryPacks.slice(0, 8)).map(pack => (
                <div
                  key={pack.pack_id}
                  style={S.packCard(state.active_pack === pack.pack_id, color)}
                  onClick={() => drumsApi.updateState({ active_pack: pack.pack_id })}
                >
                  <div style={S.packName(state.active_pack === pack.pack_id, color)}>{pack.name}</div>
                  <div style={S.packMeta}>{pack.description || pack.source}</div>
                </div>
              ))}
            </div>
            {factoryPacks.length > 8 && (
              <button
                onClick={() => setShowAllPacks(!showAllPacks)}
                style={{
                  width: '100%', padding: '8px', marginTop: 6,
                  background: 'transparent', color, border: `1px solid ${color}44`,
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showAllPacks ? 'Show Less' : `Show All ${factoryPacks.length} Packs`}
              </button>
            )}
          </>
        )}
      </ParameterSection>

      <ParameterSection
        title={`User Packs (${generatedPacks.length})`}
        icon={<StackLimitation size={14} />} accentColor="#8b5cf6" collapsible defaultCollapsed
      >
        {generatedPacks.length === 0 ? (
          <div style={S.emptyState}>No user-generated packs — create one from the API</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {generatedPacks.map(pack => (
              <div
                key={pack.pack_id}
                style={S.packCard(state.active_pack === pack.pack_id, '#8b5cf6')}
                onClick={() => drumsApi.updateState({ active_pack: pack.pack_id })}
              >
                <div style={S.packName(state.active_pack === pack.pack_id, '#8b5cf6')}>{pack.name}</div>
                <div style={S.packMeta}>{pack.description || 'User pack'}</div>
              </div>
            ))}
          </div>
        )}
      </ParameterSection>
    </>
  )
}

// ── Backing Tracks Mode Panel ──────────────────────────────

function BackingTracksModePanel({ state }: { state: DrumMachineState }) {
  const color = MODE_CONFIG.backing_tracks.color
  return (
    <>
      <ParameterSection title="Song Controls" icon={<Playlist size={14} />} accentColor={color}>
        <ParameterRow>
          <ParameterKnob
            label="Pattern" value={state.pattern}
            min={0} max={127} step={1} defaultValue={0}
            onChange={v => drumsApi.updateState({ pattern: v })}
            accentColor={color} size="medium"
            valueFormatter={v => `P${String(v + 1).padStart(3, '0')}`}
          />
          <ParameterKnob
            label="Variation" value={state.variation}
            min={0} max={10} step={1} defaultValue={0}
            onChange={v => drumsApi.updateState({ variation: v })}
            accentColor={color} size="medium"
            valueFormatter={v => v === 0 ? 'A' : String.fromCharCode(65 + v)}
          />
          <ParameterKnob
            label="Quantize" value={state.practice_change_quantization}
            min={1} max={8} step={1} defaultValue={1} unit=" bars"
            onChange={v => drumsApi.updateState({ practice_change_quantization: v })}
            accentColor={color} size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      <ParameterSection title="Performance" icon={<Flash size={14} />} accentColor={color}>
        <Toggle
          on={state.practice_auto_fill} color={color}
          onChange={v => drumsApi.updateState({ practice_auto_fill: v })}
          label="Auto-Fill Between Sections"
        />
        <div style={{ marginTop: 6 }}>
          <ParameterRow>
            <ParameterKnob
              label="Count-In" value={state.practice_count_in_bars}
              min={0} max={4} step={1} defaultValue={1} unit=" bars"
              onChange={v => drumsApi.updateState({ practice_count_in_bars: v })}
              accentColor={color} size="small"
              valueFormatter={v => v === 0 ? 'Off' : `${v}`}
            />
          </ParameterRow>
        </div>
      </ParameterSection>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────

interface DrumMachineCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function DrumMachineCardBase({
  plugin,
  accentColor = '#f59e0b',
  compact = false,
  onOpenMidiMappings,
}: DrumMachineCardProps) {

  // ── Queries ──
  const stateQuery = useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    refetchInterval: 1500, staleTime: 800,
  })
  const factoryPacksQuery = useQuery({
    queryKey: ['drums', 'factory-packs'],
    queryFn: drumsApi.getFactoryPacks,
    staleTime: 60_000,
  })
  const generatedPacksQuery = useQuery({
    queryKey: ['drums', 'generated-packs'],
    queryFn: drumsApi.getGeneratedPacks,
    staleTime: 30_000,
  })

  // ── Local State ──
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [beatPhase, setBeatPhase] = useState(0)
  const beatInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const state = stateQuery.data as DrumMachineState | undefined
  const factoryPacks = (factoryPacksQuery.data ?? []) as DrumPack[]
  const generatedPacks = (generatedPacksQuery.data ?? []) as DrumPack[]

  const resolvedState = normalizeDrumMachineState(state)
  const currentMode = resolvedState.ui_mode
  const modeColor = MODE_CONFIG[currentMode]?.color ?? accentColor
  const isPlaying = resolvedState.transport
  const bpm = resolvedState.bpm

  // ── Beat animation ──
  useEffect(() => {
    if (beatInterval.current) clearInterval(beatInterval.current)
    if (isPlaying && bpm > 0) {
      const ms = 60000 / bpm
      beatInterval.current = setInterval(() => {
        setBeatPhase(prev => (prev + 1) % 4)
      }, ms)
    } else {
      setBeatPhase(0)
    }
    return () => { if (beatInterval.current) clearInterval(beatInterval.current) }
  }, [isPlaying, bpm])

  // ── Tap Tempo ──
  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    const newTaps = [...tapTimes, now].slice(-6)
    setTapTimes(newTaps)
    if (newTaps.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < newTaps.length; i++) {
        const diff = newTaps[i] - newTaps[i - 1]
        if (diff < 2000) intervals.push(diff)
      }
      if (intervals.length > 0) {
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const newBpm = Math.round(60000 / avg)
        if (newBpm >= 40 && newBpm <= 300) drumsApi.updateState({ bpm: newBpm })
      }
    }
  }, [tapTimes])

  // ── Transport Visualization ──
  const transportVisualization = (
    <div style={S.vizContainer}>
      {isPlaying && (
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          background: `radial-gradient(circle at center, ${modeColor} 0%, transparent 70%)`,
        }} />
      )}
      <div style={S.bpmDisplay(modeColor)}>
        {bpm}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4, opacity: 0.6 }}>BPM</span>
      </div>
      <div style={S.transportRow}>
        <button onClick={() => drumsApi.updateState({ transport: !isPlaying })} style={S.transportBtn(isPlaying, modeColor)}>
          {isPlaying ? <StopFilled size={14} /> : <Play size={14} />}
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <button onClick={handleTapTempo} style={S.tapBtn}>Tap</button>
      </div>
      <div style={S.beatRow}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={S.beatDot(isPlaying && beatPhase === i, modeColor)} />
        ))}
      </div>
      <div style={S.modeLabel}>{MODE_CONFIG[currentMode]?.desc ?? ''}</div>
    </div>
  )

  // ── Footer ──
  const footer = (
    <div style={S.footer}>
      <span>
        <Music size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
        {resolvedState.active_pack ? `Pack: ${resolvedState.active_pack}` : 'No pack loaded'}
      </span>
      <span style={S.footerBadge(modeColor)}>
        {isPlaying ? '● PLAYING' : '○ STOPPED'}
      </span>
    </div>
  )

  // ── Loading ──
  if (!state) {
    return (
      <PluginCardShell plugin={plugin} accentColor={accentColor} compact={compact}>
        <div style={{ ...S.emptyState, padding: 32 }}>
          <Music size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>Connecting to Drum Machine...</div>
        </div>
      </PluginCardShell>
    )
  }

  return (
    <PluginCardShell
      plugin={plugin} accentColor={modeColor} bypassed={false}
      compact={compact} visualization={transportVisualization}
      footer={footer} onOpenMidiMappings={onOpenMidiMappings} showBypass={false}
    >
      {/* Mode Selector */}
      <div style={S.modeBar}>
        {(Object.entries(MODE_CONFIG) as [keyof typeof MODE_CONFIG, typeof MODE_CONFIG[keyof typeof MODE_CONFIG]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <button key={key} onClick={() => drumsApi.updateState({ ui_mode: key })} style={S.modeBtn(currentMode === key, cfg.color)}>
              <Icon size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Global Transport Controls (all modes) */}
      <ParameterSection title="Transport" icon={<VolumeUp size={14} />} accentColor={modeColor}>
        <ParameterRow>
          <ParameterKnob
            label="BPM" value={bpm} min={40} max={300} step={1} defaultValue={120}
            onChange={v => drumsApi.updateState({ bpm: v })}
            accentColor={modeColor} size="medium"
          />
          <ParameterKnob
            label="Volume" value={resolvedState.volume} min={0} max={100} step={1}
            defaultValue={80} unit="%"
            onChange={v => drumsApi.updateState({ volume: v })}
            accentColor={modeColor} size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mode-Specific Content */}
      {currentMode === 'practice' && <PracticeModePanel state={resolvedState} />}
      {currentMode === 'advanced' && (
        <AdvancedModePanel state={resolvedState} factoryPacks={factoryPacks} generatedPacks={generatedPacks} />
      )}
      {currentMode === 'backing_tracks' && <BackingTracksModePanel state={resolvedState} />}
    </PluginCardShell>
  )
}

// ── Exports ────────────────────────────────────────────────

export { DrumMachineCardBase as DrumMachineCard }
export default withMidiDialog(DrumMachineCardBase, DRUM_MACHINE_URI, DRUM_MACHINE_PARAMS)
