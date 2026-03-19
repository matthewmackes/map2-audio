/**
 * NativeDelayCard - Carbon-compliant JUCE Stereo Delay Processor
 *
 * Uses DelayCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: time L/R, feedback, mix, tempo sync, modulation,
 * filters, ducking, multi-tap, stereo mode, spillover.
 */

import { useState, useCallback, useEffect } from 'react'
import { Activity, Filter, VolumeDown, ListDropdown } from '@carbon/icons-react'
import { useDelay, TEMPO_DIVISIONS, STEREO_MODES, MOD_WAVEFORMS } from '../../../../hooks/useDelay'
import { DelayCategoryLayout } from '../../Layouts/DelayCategoryLayout'
import { NumberInput } from '../../../Controls/NumberInput'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { DelayTapGrid } from '../../Visualizations/DelayTapGrid'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import type { AdvancedSection } from '../../Base/CarbonCardShell'

const DELAY_URI = 'map2://juce/delay/stereo'

const PARAM = {
  DELAY_TIME_L: 0, DELAY_TIME_R: 1, FEEDBACK: 2, MIX: 3, TEMPO: 4,
  TAP1_LEVEL: 5, TAP2_LEVEL: 6, TAP2_RATIO: 7, TAP3_LEVEL: 8, TAP3_RATIO: 9,
  TAP4_LEVEL: 10, TAP4_RATIO: 11, STEREO_SPREAD: 12, PAN: 13,
  MOD_RATE: 14, MOD_DEPTH: 15, LOW_CUT: 16, HIGH_CUT: 17,
  DIFFUSION: 18, DUCK_THRESHOLD: 19, DUCK_AMOUNT: 20, DUCK_RELEASE: 21, OUTPUT_LEVEL: 22,
} as const

const DELAY_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Delay Time L', symbol: 'delayTimeL' },
  { index: 1, name: 'Delay Time R', symbol: 'delayTimeR' },
  { index: 2, name: 'Feedback', symbol: 'feedback' },
  { index: 3, name: 'Mix', symbol: 'mix' },
  { index: 4, name: 'Tempo', symbol: 'tempo' },
  { index: 5, name: 'Tap 1 Level', symbol: 'tap1Level' },
  { index: 6, name: 'Tap 2 Level', symbol: 'tap2Level' },
  { index: 7, name: 'Tap 2 Ratio', symbol: 'tap2Ratio' },
  { index: 8, name: 'Tap 3 Level', symbol: 'tap3Level' },
  { index: 9, name: 'Tap 3 Ratio', symbol: 'tap3Ratio' },
  { index: 10, name: 'Tap 4 Level', symbol: 'tap4Level' },
  { index: 11, name: 'Tap 4 Ratio', symbol: 'tap4Ratio' },
  { index: 12, name: 'Stereo Spread', symbol: 'stereoSpread' },
  { index: 13, name: 'Pan', symbol: 'pan' },
  { index: 14, name: 'Mod Rate', symbol: 'modRate' },
  { index: 15, name: 'Mod Depth', symbol: 'modDepth' },
  { index: 16, name: 'Low Cut', symbol: 'lowCut' },
  { index: 17, name: 'High Cut', symbol: 'highCut' },
  { index: 18, name: 'Diffusion', symbol: 'diffusion' },
  { index: 19, name: 'Duck Threshold', symbol: 'duckThreshold' },
  { index: 20, name: 'Duck Amount', symbol: 'duckAmount' },
  { index: 21, name: 'Duck Release', symbol: 'duckRelease' },
  { index: 22, name: 'Output Level', symbol: 'outputLevel' },
]

const QUICK_DIVISIONS = [
  { index: 3, name: '1/4' },
  { index: 4, name: '1/8' },
  { index: 9, name: '1/4D' },
  { index: 14, name: '1/4T' },
  { index: 5, name: '1/16' },
  { index: 10, name: '1/8D' },
]

interface NativeDelayCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function NativeDelayCardBase({
  plugin,
  accentColor = '#45b7d1',
  compact = false,
  onOpenMidiMappings,
}: NativeDelayCardProps) {
  const {
    parameters, metering,
    effectiveDelayL, effectiveDelayR,
    setDelayTimeL, setDelayTimeR, setDelayTimeBoth,
    setFeedback, setMix, setTempo,
    setTempoSyncL, setTempoSyncR, setTempoSyncBoth,
    setTap1Level, setTap2Level, setTap2Ratio,
    setTap3Level, setTap3Ratio, setTap4Level, setTap4Ratio,
    setStereoMode, setStereoSpread, setPan,
    setModRate, setModDepth, setModWaveform,
    setLowCut, setHighCut, setFilterInLoop, setDiffusion,
    setDuckThreshold, setDuckAmount, setDuckRelease,
    setOutputLevel, setSpillover, setBypass,
    tapTempo, clearTaps, tapCount,
  } = useDelay()

  const [linkLR, setLinkLR] = useState(true)
  const [tapPulse, setTapPulse] = useState(false)

  const handleDelayTimeL = useCallback((v: number) => {
    if (linkLR) setDelayTimeBoth(v); else setDelayTimeL(v)
  }, [linkLR, setDelayTimeBoth, setDelayTimeL])

  const handleDelayTimeR = useCallback((v: number) => {
    if (linkLR) setDelayTimeBoth(v); else setDelayTimeR(v)
  }, [linkLR, setDelayTimeBoth, setDelayTimeR])

  const handleTap = useCallback(() => {
    setTapPulse(true)
    tapTempo()
    setTimeout(() => setTapPulse(false), 150)
  }, [tapTempo])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        handleTap()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTap])

  const formatDelay = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`

  const visualization = (
    <DelayTapGrid
      delayTimeL={effectiveDelayL}
      delayTimeR={effectiveDelayR}
      feedback={parameters.feedback}
      pingPong={parameters.stereoMode === 2}
      modulationRate={parameters.modRate}
      modulationDepth={parameters.modDepth}
      width={compact ? 308 : 448}
      height={compact ? 84 : 112}
      accentColor={accentColor}
      maxTaps={8}
    />
  )

  // Tempo sync + tap tempo as extraContent above the layout sections
  const tempoSyncContent = (
    <div style={{ padding: '8px 12px' }}>
      {/* BPM + Tap */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#a8a8a8' }}>BPM</span>
        <NumberInput
          value={parameters.tempo}
          min={20} max={300} step={1} defaultValue={120}
          profile="integer"
          onChange={setTempo}
          size="small" showLabel={false} inline
          accentColor={accentColor}
          valueFormatter={(v) => Math.round(v).toString()}
        />
        <button
          className={`carbon-toggle-btn ${tapPulse ? 'active' : ''}`}
          onClick={handleTap}
          style={tapPulse ? { background: accentColor, borderColor: accentColor } : undefined}
          title="Tap Tempo (T key)"
        >
          TAP
        </button>
        {tapCount > 0 && <span style={{ fontSize: 9, color: '#a8a8a8' }}>{tapCount} taps</span>}
      </div>

      {/* Sync division chips */}
      {['L', 'R'].map((ch) => {
        const isL = ch === 'L'
        const syncVal = isL ? parameters.tempoSyncL : parameters.tempoSyncR
        const handleSync = (idx: number) => {
          if (linkLR) setTempoSyncBoth(idx)
          else if (isL) setTempoSyncL(idx)
          else setTempoSyncR(idx)
        }
        return (
          <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 'bold', color: isL ? '#4ecdc4' : '#f59e0b', width: 12 }}>{ch}</span>
            <div className="carbon-preset-row" style={{ flex: 1 }}>
              {QUICK_DIVISIONS.map((div) => (
                <button
                  key={div.index}
                  className={`carbon-preset-btn ${syncVal === div.index ? 'active' : ''}`}
                  onClick={() => handleSync(div.index)}
                  disabled={!isL && linkLR}
                  style={syncVal === div.index ? { background: accentColor, borderColor: accentColor } : undefined}
                >
                  {div.name}
                </button>
              ))}
              <button
                className={`carbon-preset-btn ${syncVal === 0 ? 'active' : ''}`}
                onClick={() => handleSync(0)}
                disabled={!isL && linkLR}
                style={syncVal === 0 ? { background: accentColor, borderColor: accentColor } : undefined}
              >
                OFF
              </button>
            </div>
            <span style={{ fontSize: 9, color: '#a8a8a8', minWidth: 48, textAlign: 'right' }}>
              {formatDelay(isL ? effectiveDelayL : effectiveDelayR)}
            </span>
          </div>
        )
      })}

      {/* Stereo mode + link */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button
          className={`carbon-toggle-btn ${linkLR ? 'active' : ''}`}
          onClick={() => setLinkLR(!linkLR)}
          style={linkLR ? { background: accentColor, borderColor: accentColor } : undefined}
        >
          {linkLR ? 'LINKED' : 'UNLINK'}
        </button>
        <select
          value={parameters.stereoMode}
          onChange={(e) => setStereoMode(parseInt(e.target.value))}
          style={{ background: '#262626', border: '1px solid #393939', borderRadius: 4, color: '#f4f4f4', fontSize: 10, padding: '4px 8px' }}
        >
          {STEREO_MODES.map((m) => <option key={m.index} value={m.index}>{m.name}</option>)}
        </select>
        <button
          className={`carbon-toggle-btn ${parameters.spillover ? 'active' : ''}`}
          onClick={() => setSpillover(!parameters.spillover)}
          style={parameters.spillover ? { background: accentColor, borderColor: accentColor } : undefined}
        >
          Spillover
        </button>
      </div>
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'modulation',
      title: 'Modulation',
      icon: <Activity size={14} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob label="Rate" value={parameters.modRate} min={0.01} max={10} defaultValue={0.5} unit="Hz" onChange={setModRate} isLogarithmic accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.MOD_RATE }} />
          <ParameterKnob label="Depth" value={parameters.modDepth} min={0} max={100} defaultValue={0} unit="%" onChange={setModDepth} accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.MOD_DEPTH }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: '#a8a8a8' }}>Waveform</span>
            <select
              value={parameters.modWaveform}
              onChange={(e) => setModWaveform(parseInt(e.target.value))}
              style={{ background: '#262626', border: '1px solid #393939', borderRadius: 4, color: '#f4f4f4', fontSize: 10, padding: '4px 8px' }}
            >
              {MOD_WAVEFORMS.map((w) => <option key={w.index} value={w.index}>{w.name}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    {
      id: 'filters',
      title: 'Filters',
      icon: <Filter size={14} />,
      children: (
        <div>
          <div className="carbon-param-row">
            <ParameterKnob label="Low Cut" value={parameters.lowCut} min={20} max={2000} defaultValue={20} unit="Hz" onChange={setLowCut} isLogarithmic accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.LOW_CUT }} />
            <ParameterKnob label="High Cut" value={parameters.highCut} min={1000} max={20000} defaultValue={12000} unit="Hz" onChange={setHighCut} isLogarithmic valueFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`} accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.HIGH_CUT }} />
            <ParameterKnob label="Diffusion" value={parameters.diffusion} min={0} max={100} defaultValue={0} unit="%" onChange={setDiffusion} accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.DIFFUSION }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              className={`carbon-toggle-btn ${parameters.filterInLoop ? 'active' : ''}`}
              onClick={() => setFilterInLoop(!parameters.filterInLoop)}
              style={parameters.filterInLoop ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              In Loop
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'ducking',
      title: 'Ducking',
      icon: <VolumeDown size={14} />,
      children: (
        <div>
          <div className="carbon-param-row">
            <ParameterKnob label="Threshold" value={parameters.duckThreshold} min={-60} max={0} defaultValue={-20} unit="dB" onChange={setDuckThreshold} accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.DUCK_THRESHOLD }} />
            <ParameterKnob label="Amount" value={parameters.duckAmount} min={0} max={100} defaultValue={0} unit="%" onChange={setDuckAmount} accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.DUCK_AMOUNT }} />
            <ParameterKnob label="Release" value={parameters.duckRelease} min={10} max={2000} defaultValue={200} unit="ms" onChange={setDuckRelease} isLogarithmic accentColor={accentColor} size="small" midi={{ pluginUri: DELAY_URI, paramIndex: PARAM.DUCK_RELEASE }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 10, color: '#a8a8a8' }}>
            <span>Ducking:</span>
            <div style={{ flex: 1, height: 4, background: '#393939', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.abs(metering.duckingGain) * 5)}%`, height: '100%', background: accentColor, borderRadius: 2 }} />
            </div>
            <span>{metering.duckingGain.toFixed(1)} dB</span>
          </div>
        </div>
      ),
    },
    {
      id: 'multiTap',
      title: 'Multi-Tap',
      icon: <ListDropdown size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'TAP 1', level: parameters.tap1Level, setLevel: setTap1Level, ratio: null, setRatio: null, defLevel: 100, info: '(main)' },
            { label: 'TAP 2', level: parameters.tap2Level, setLevel: setTap2Level, ratio: parameters.tap2Ratio, setRatio: setTap2Ratio, defLevel: 0 },
            { label: 'TAP 3', level: parameters.tap3Level, setLevel: setTap3Level, ratio: parameters.tap3Ratio, setRatio: setTap3Ratio, defLevel: 0 },
            { label: 'TAP 4', level: parameters.tap4Level, setLevel: setTap4Level, ratio: parameters.tap4Ratio, setRatio: setTap4Ratio, defLevel: 0 },
          ].map((tap) => (
            <div key={tap.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 'bold', color: '#a8a8a8', width: 36 }}>{tap.label}</span>
              <ParameterKnob label="Level" value={tap.level} min={0} max={100} defaultValue={tap.defLevel} unit="%" onChange={tap.setLevel} accentColor={accentColor} size="small" />
              {tap.setRatio && (
                <ParameterKnob label="Ratio" value={tap.ratio!} min={0.1} max={1} defaultValue={0.5} step={0.01} onChange={tap.setRatio} valueFormatter={(v) => `${(v * 100).toFixed(0)}%`} accentColor={accentColor} size="small" />
              )}
              {tap.info && <span style={{ fontSize: 9, color: '#666' }}>{tap.info}</span>}
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <DelayCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      delayTimeL={parameters.tempoSyncL === 0 ? {
        label: 'Delay L',
        value: parameters.delayTimeL,
        min: 1, max: 2000, defaultValue: 500,
        unit: 'ms',
        onChange: handleDelayTimeL,
        isLogarithmic: true,
        valueFormatter: formatDelay,
        midi: { pluginUri: DELAY_URI, paramIndex: PARAM.DELAY_TIME_L },
      } : undefined}
      delayTimeR={parameters.tempoSyncR === 0 && !linkLR ? {
        label: 'Delay R',
        value: parameters.delayTimeR,
        min: 1, max: 2000, defaultValue: 500,
        unit: 'ms',
        onChange: handleDelayTimeR,
        isLogarithmic: true,
        valueFormatter: formatDelay,
        midi: { pluginUri: DELAY_URI, paramIndex: PARAM.DELAY_TIME_R },
      } : undefined}
      link={{ linked: linkLR, onToggle: () => setLinkLR(!linkLR) }}
      tapTempo={{ onTap: handleTap, bpm: parameters.tempo }}
      feedback={{
        label: 'Feedback',
        value: parameters.feedback,
        min: 0, max: 100, defaultValue: 30,
        unit: '%',
        onChange: setFeedback,
        midi: { pluginUri: DELAY_URI, paramIndex: PARAM.FEEDBACK },
      }}
      mix={{
        label: 'Mix',
        value: parameters.mix,
        min: 0, max: 100, defaultValue: 50,
        unit: '%',
        onChange: setMix,
        midi: { pluginUri: DELAY_URI, paramIndex: PARAM.MIX },
      }}
      inputLevel={Math.max(metering.inputLevelL, metering.inputLevelR)}
      outputLevel={Math.max(metering.outputLevelL, metering.outputLevelR)}
      advancedSections={advancedSections}
      extraContent={tempoSyncContent}
    />
  )
}

export { NativeDelayCardBase as NativeDelayCard }
export default withMidiDialog(NativeDelayCardBase, DELAY_URI, DELAY_PARAMS)
