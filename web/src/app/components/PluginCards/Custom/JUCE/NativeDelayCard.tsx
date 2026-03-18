/**
 * NativeDelayCard - Custom card for JUCE Stereo Delay Processor
 *
 * World-class UI with tap tempo, beat-sync divisions, and collapsible sections.
 * Inspired by Axe-FX II Delay block.
 */

import { useState, useCallback, useEffect } from 'react'
import { ChevronDown, ChevronRight, Link, Unlink } from '@carbon/icons-react'
import { useDelay, TEMPO_DIVISIONS, STEREO_MODES, MOD_WAVEFORMS, calculateDelayFromSync } from '../../../../hooks/useDelay'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { NumberInput } from '../../../Controls/NumberInput'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { DelayTapGrid } from '../../Visualizations/DelayTapGrid'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import './NativeDelayCard.css'

// Plugin URI for MIDI mappings
const DELAY_URI = 'map2://juce/delay/stereo'

// Parameter definitions for MIDI mapping dialog
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

// Common divisions for quick access buttons
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
    parameters,
    metering,
    effectiveDelayL,
    effectiveDelayR,
    setDelayTimeL,
    setDelayTimeR,
    setDelayTimeBoth,
    setFeedback,
    setMix,
    setTempo,
    setTempoSyncL,
    setTempoSyncR,
    setTempoSyncBoth,
    setTap1Level,
    setTap2Level,
    setTap2Ratio,
    setTap3Level,
    setTap3Ratio,
    setTap4Level,
    setTap4Ratio,
    setStereoMode,
    setStereoSpread,
    setPan,
    setModRate,
    setModDepth,
    setModWaveform,
    setLowCut,
    setHighCut,
    setFilterInLoop,
    setDiffusion,
    setDuckThreshold,
    setDuckAmount,
    setDuckRelease,
    setOutputLevel,
    setSpillover,
    setBypass,
    tapTempo,
    clearTaps,
    tapCount,
    isConnected,
  } = useDelay()

  // UI state
  const [linkLR, setLinkLR] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    modulation: false,
    filters: false,
    ducking: false,
    multiTap: false,
  })
  const [tapPulse, setTapPulse] = useState(false)

  // Toggle section expansion
  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Handle linked L/R delay time changes
  const handleDelayTimeL = useCallback((v: number) => {
    if (linkLR) {
      setDelayTimeBoth(v)
    } else {
      setDelayTimeL(v)
    }
  }, [linkLR, setDelayTimeBoth, setDelayTimeL])

  const handleDelayTimeR = useCallback((v: number) => {
    if (linkLR) {
      setDelayTimeBoth(v)
    } else {
      setDelayTimeR(v)
    }
  }, [linkLR, setDelayTimeBoth, setDelayTimeR])

  // Handle linked sync division changes
  const handleSyncL = useCallback((v: number) => {
    if (linkLR) {
      setTempoSyncBoth(v)
    } else {
      setTempoSyncL(v)
    }
  }, [linkLR, setTempoSyncBoth, setTempoSyncL])

  const handleSyncR = useCallback((v: number) => {
    if (linkLR) {
      setTempoSyncBoth(v)
    } else {
      setTempoSyncR(v)
    }
  }, [linkLR, setTempoSyncBoth, setTempoSyncR])

  // Handle tap tempo with visual feedback
  const handleTap = useCallback(() => {
    setTapPulse(true)
    tapTempo()
    setTimeout(() => setTapPulse(false), 150)
  }, [tapTempo])

  // Keyboard shortcut for tap tempo (T key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        // Don't trigger if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        handleTap()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTap])

  // Format delay time
  const formatDelay = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`

  // Visualization
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

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
      customHeader={
        <div className="delay-card-header">
          <span className="delay-card-title">STEREO DELAY</span>
          <button
            className={`delay-tap-button ${tapPulse ? 'pulse' : ''}`}
            onClick={handleTap}
            style={{ '--accent': accentColor } as React.CSSProperties}
            title="Tap Tempo (T key)"
          >
            TAP
          </button>
        </div>
      }
    >
      {/* Tempo Sync Section */}
      <div className="delay-tempo-section">
        <div className="delay-tempo-display">
          <span className="delay-tempo-label">BPM</span>
          <NumberInput
            value={parameters.tempo}
            min={20}
            max={300}
            step={1}
            defaultValue={120}
            profile="integer"
            onChange={setTempo}
            size="small"
            showLabel={false}
            inline
            accentColor={accentColor}
            className="delay-tempo-input"
            valueFormatter={(value) => Math.round(value).toString()}
          />
          {tapCount > 0 && <span className="delay-tap-count">{tapCount} taps</span>}
        </div>

        {/* Division selectors */}
        <div className="delay-sync-channels">
          <div className="delay-sync-row">
            <span className="delay-sync-label" style={{ color: '#4ecdc4' }}>L</span>
            <div className="delay-sync-chips">
              {QUICK_DIVISIONS.map((div) => (
                <button
                  key={div.index}
                  className={`delay-sync-chip ${parameters.tempoSyncL === div.index ? 'active' : ''}`}
                  onClick={() => handleSyncL(div.index)}
                  style={{ '--accent': accentColor } as React.CSSProperties}
                >
                  {div.name}
                </button>
              ))}
              <button
                className={`delay-sync-chip ${parameters.tempoSyncL === 0 ? 'active' : ''}`}
                onClick={() => handleSyncL(0)}
                style={{ '--accent': accentColor } as React.CSSProperties}
              >
                OFF
              </button>
            </div>
            <span className="delay-sync-time">{formatDelay(effectiveDelayL)}</span>
          </div>
          <div className="delay-sync-row">
            <span className="delay-sync-label" style={{ color: '#f59e0b' }}>R</span>
            <div className="delay-sync-chips">
              {QUICK_DIVISIONS.map((div) => (
                <button
                  key={div.index}
                  className={`delay-sync-chip ${parameters.tempoSyncR === div.index ? 'active' : ''}`}
                  onClick={() => handleSyncR(div.index)}
                  style={{ '--accent': accentColor } as React.CSSProperties}
                  disabled={linkLR}
                >
                  {div.name}
                </button>
              ))}
              <button
                className={`delay-sync-chip ${parameters.tempoSyncR === 0 ? 'active' : ''}`}
                onClick={() => handleSyncR(0)}
                style={{ '--accent': accentColor } as React.CSSProperties}
                disabled={linkLR}
              >
                OFF
              </button>
            </div>
            <span className="delay-sync-time">{formatDelay(effectiveDelayR)}</span>
          </div>
        </div>

        {/* Link L/R toggle */}
        <button
          className={`delay-link-btn ${linkLR ? 'linked' : ''}`}
          onClick={() => setLinkLR(!linkLR)}
          style={{ '--accent': accentColor } as React.CSSProperties}
          title={linkLR ? 'L/R Linked' : 'L/R Independent'}
        >
          {linkLR ? <Link size={14} /> : <Unlink size={14} />}
          <span>{linkLR ? 'LINKED' : 'UNLINK'}</span>
        </button>
      </div>

      {/* Manual Time (when sync is off) */}
      {(parameters.tempoSyncL === 0 || parameters.tempoSyncR === 0) && (
        <ParameterSection title="Manual Time" accentColor={accentColor}>
          <ParameterRow>
            {parameters.tempoSyncL === 0 && (
              <ParameterKnob
                label="Delay L"
                value={parameters.delayTimeL}
                min={1}
                max={2000}
                defaultValue={500}
                unit="ms"
                onChange={handleDelayTimeL}
                isLogarithmic
                valueFormatter={formatDelay}
                accentColor="#4ecdc4"
                size="medium"
              />
            )}
            {parameters.tempoSyncR === 0 && !linkLR && (
              <ParameterKnob
                label="Delay R"
                value={parameters.delayTimeR}
                min={1}
                max={2000}
                defaultValue={500}
                unit="ms"
                onChange={handleDelayTimeR}
                isLogarithmic
                valueFormatter={formatDelay}
                accentColor="#f59e0b"
                size="medium"
              />
            )}
          </ParameterRow>
        </ParameterSection>
      )}

      {/* Main Section */}
      <ParameterSection title="Main" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Feedback"
            value={parameters.feedback}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={setFeedback}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Mix"
            value={parameters.mix}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="medium"
          />
          <div className="delay-stereo-mode">
            <label>Mode</label>
            <select
              value={parameters.stereoMode}
              onChange={(e) => setStereoMode(parseInt(e.target.value))}
              style={{ '--accent': accentColor } as React.CSSProperties}
            >
              {STEREO_MODES.map((mode) => (
                <option key={mode.index} value={mode.index}>{mode.name}</option>
              ))}
            </select>
          </div>
          <ParameterKnob
            label="Output"
            value={parameters.outputLevel}
            min={-12}
            max={12}
            defaultValue={0}
            unit="dB"
            onChange={setOutputLevel}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Collapsible: Modulation */}
      <div className="delay-collapsible">
        <button
          className="delay-collapsible-header"
          onClick={() => toggleSection('modulation')}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          {expandedSections.modulation ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>MODULATION</span>
          {parameters.modDepth > 0 && <span className="delay-indicator active" />}
        </button>
        {expandedSections.modulation && (
          <div className="delay-collapsible-content">
            <ParameterRow>
              <ParameterKnob
                label="Rate"
                value={parameters.modRate}
                min={0.01}
                max={10}
                defaultValue={0.5}
                unit="Hz"
                onChange={setModRate}
                isLogarithmic
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Depth"
                value={parameters.modDepth}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setModDepth}
                accentColor={accentColor}
                size="small"
              />
              <div className="delay-waveform-select">
                <label>Waveform</label>
                <select
                  value={parameters.modWaveform}
                  onChange={(e) => setModWaveform(parseInt(e.target.value))}
                >
                  {MOD_WAVEFORMS.map((w) => (
                    <option key={w.index} value={w.index}>{w.name}</option>
                  ))}
                </select>
              </div>
            </ParameterRow>
          </div>
        )}
      </div>

      {/* Collapsible: Filters */}
      <div className="delay-collapsible">
        <button
          className="delay-collapsible-header"
          onClick={() => toggleSection('filters')}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          {expandedSections.filters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>FILTERS</span>
          {(parameters.lowCut > 20 || parameters.highCut < 12000 || parameters.diffusion > 0) && (
            <span className="delay-indicator active" />
          )}
        </button>
        {expandedSections.filters && (
          <div className="delay-collapsible-content">
            <ParameterRow>
              <ParameterKnob
                label="Low Cut"
                value={parameters.lowCut}
                min={20}
                max={2000}
                defaultValue={20}
                unit="Hz"
                onChange={setLowCut}
                isLogarithmic
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="High Cut"
                value={parameters.highCut}
                min={1000}
                max={20000}
                defaultValue={12000}
                unit="Hz"
                onChange={setHighCut}
                isLogarithmic
                valueFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Diffusion"
                value={parameters.diffusion}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setDiffusion}
                accentColor={accentColor}
                size="small"
              />
              <button
                className={`delay-toggle-btn ${parameters.filterInLoop ? 'active' : ''}`}
                onClick={() => setFilterInLoop(!parameters.filterInLoop)}
                style={{ '--accent': accentColor } as React.CSSProperties}
              >
                In Loop
              </button>
            </ParameterRow>
          </div>
        )}
      </div>

      {/* Collapsible: Ducking */}
      <div className="delay-collapsible">
        <button
          className="delay-collapsible-header"
          onClick={() => toggleSection('ducking')}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          {expandedSections.ducking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>DUCKING</span>
          {parameters.duckAmount > 0 && <span className="delay-indicator active" />}
        </button>
        {expandedSections.ducking && (
          <div className="delay-collapsible-content">
            <ParameterRow>
              <ParameterKnob
                label="Threshold"
                value={parameters.duckThreshold}
                min={-60}
                max={0}
                defaultValue={-20}
                unit="dB"
                onChange={setDuckThreshold}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Amount"
                value={parameters.duckAmount}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setDuckAmount}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Release"
                value={parameters.duckRelease}
                min={10}
                max={2000}
                defaultValue={200}
                unit="ms"
                onChange={setDuckRelease}
                isLogarithmic
                accentColor={accentColor}
                size="small"
              />
            </ParameterRow>
            {/* Ducking meter */}
            <div className="delay-duck-meter">
              <span>Ducking:</span>
              <div className="delay-duck-bar">
                <div
                  className="delay-duck-fill"
                  style={{
                    width: `${Math.min(100, Math.abs(metering.duckingGain) * 5)}%`,
                    background: accentColor
                  }}
                />
              </div>
              <span className="delay-duck-value">{metering.duckingGain.toFixed(1)} dB</span>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible: Multi-Tap */}
      <div className="delay-collapsible">
        <button
          className="delay-collapsible-header"
          onClick={() => toggleSection('multiTap')}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          {expandedSections.multiTap ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>MULTI-TAP</span>
          {(parameters.tap2Level > 0 || parameters.tap3Level > 0 || parameters.tap4Level > 0) && (
            <span className="delay-indicator active" />
          )}
        </button>
        {expandedSections.multiTap && (
          <div className="delay-collapsible-content delay-multitap">
            <div className="delay-tap-row">
              <span className="delay-tap-label">TAP 1</span>
              <ParameterKnob
                label="Level"
                value={parameters.tap1Level}
                min={0}
                max={100}
                defaultValue={100}
                unit="%"
                onChange={setTap1Level}
                accentColor={accentColor}
                size="small"
              />
              <span className="delay-tap-info">(main)</span>
            </div>
            <div className="delay-tap-row">
              <span className="delay-tap-label">TAP 2</span>
              <ParameterKnob
                label="Level"
                value={parameters.tap2Level}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setTap2Level}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Ratio"
                value={parameters.tap2Ratio}
                min={0.1}
                max={1}
                defaultValue={0.5}
                step={0.01}
                onChange={setTap2Ratio}
                valueFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                accentColor={accentColor}
                size="small"
              />
            </div>
            <div className="delay-tap-row">
              <span className="delay-tap-label">TAP 3</span>
              <ParameterKnob
                label="Level"
                value={parameters.tap3Level}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setTap3Level}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Ratio"
                value={parameters.tap3Ratio}
                min={0.1}
                max={1}
                defaultValue={0.33}
                step={0.01}
                onChange={setTap3Ratio}
                valueFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                accentColor={accentColor}
                size="small"
              />
            </div>
            <div className="delay-tap-row">
              <span className="delay-tap-label">TAP 4</span>
              <ParameterKnob
                label="Level"
                value={parameters.tap4Level}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setTap4Level}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Ratio"
                value={parameters.tap4Ratio}
                min={0.1}
                max={1}
                defaultValue={0.25}
                step={0.01}
                onChange={setTap4Ratio}
                valueFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                accentColor={accentColor}
                size="small"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer toggles */}
      <div className="delay-footer">
        <button
          className={`delay-toggle-btn ${parameters.spillover ? 'active' : ''}`}
          onClick={() => setSpillover(!parameters.spillover)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          Spillover
        </button>
        <div className="delay-metering-footer">
          <span>IN: {Math.max(metering.inputLevelL, metering.inputLevelR).toFixed(1)}</span>
          <span>WET: {Math.max(metering.delayLevelL, metering.delayLevelR).toFixed(1)}</span>
          <span>OUT: {Math.max(metering.outputLevelL, metering.outputLevelR).toFixed(1)}</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { NativeDelayCardBase as NativeDelayCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(NativeDelayCardBase, DELAY_URI, DELAY_PARAMS)
