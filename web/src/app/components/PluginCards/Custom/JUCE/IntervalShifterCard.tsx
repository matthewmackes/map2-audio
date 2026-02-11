/**
 * IntervalShifterCard - Musical Interval Pitch Shifter
 *
 * Shifts the full instrument up or down in half or full steps (semitones).
 * Provides musical interval presets for easy harmonization.
 */

import { useState, useCallback } from 'react'
import { CaretUp, CaretDown, Link, LinkBreak, MusicNote, Lightning } from '@phosphor-icons/react'
import {
  useIntervalShifter,
  MUSICAL_INTERVALS,
  INTERVAL_PRESETS,
  type IntervalPreset,
} from '../../../../hooks/useModulation'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import './IntervalShifterCard.css'

// Plugin URI for MIDI mappings
const INTERVAL_SHIFTER_URI = 'map2://juce/pitch/interval'

// Parameter definitions for MIDI mapping dialog
const INTERVAL_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Semitones L', symbol: 'semitonesL' },
  { index: 1, name: 'Semitones R', symbol: 'semitonesR' },
  { index: 2, name: 'Mix', symbol: 'mix' },
]

// Piano key pattern for visualization
const PIANO_KEYS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] // 0=white, 1=black

interface IntervalShifterCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function IntervalShifterCardBase({
  plugin,
  accentColor = '#8b5cf6',
  compact = false,
  onOpenMidiMappings,
}: IntervalShifterCardProps) {
  const {
    parameters,
    metering,
    intervals,
    presets,
    setSemitonesL,
    setSemitonesR,
    setSemitonesBoth,
    setMix,
    setBypass,
    applyPreset,
    getIntervalName,
    isConnected,
  } = useIntervalShifter()

  const [linkLR, setLinkLR] = useState(true)
  const [showPresets, setShowPresets] = useState(false)

  // Handle semitone changes with linking
  const handleSemitonesL = useCallback((delta: number) => {
    const newValue = Math.max(-24, Math.min(24, parameters.semitonesL + delta))
    if (linkLR) {
      setSemitonesBoth(newValue, newValue)
    } else {
      setSemitonesL(newValue)
    }
  }, [linkLR, parameters.semitonesL, setSemitonesL, setSemitonesBoth])

  const handleSemitonesR = useCallback((delta: number) => {
    const newValue = Math.max(-24, Math.min(24, parameters.semitonesR + delta))
    if (linkLR) {
      setSemitonesBoth(newValue, newValue)
    } else {
      setSemitonesR(newValue)
    }
  }, [linkLR, parameters.semitonesR, setSemitonesR, setSemitonesBoth])

  const handleSetBoth = useCallback((semitones: number) => {
    setSemitonesBoth(semitones, semitones)
  }, [setSemitonesBoth])

  // Format semitone display
  const formatSemitones = (st: number) => {
    if (st === 0) return '0'
    return `${st > 0 ? '+' : ''}${st}`
  }

  // Piano keyboard visualization showing shift amount
  const renderPianoVisualization = () => {
    const shiftL = parameters.semitonesL
    const shiftR = parameters.semitonesR

    return (
      <div className="interval-visualization">
        <div className="interval-display">
          {/* Left channel */}
          <div className="interval-channel">
            <span className="interval-label">L</span>
            <div className="interval-value" style={{ '--accent': '#4ecdc4' } as React.CSSProperties}>
              <span className="interval-semitones">{formatSemitones(shiftL)}</span>
              <span className="interval-name">{getIntervalName(shiftL)}</span>
            </div>
          </div>

          {/* Visual shift indicator */}
          <div className="interval-arrow-display">
            <div
              className="interval-arrow"
              style={{
                '--shift': Math.max(-1, Math.min(1, shiftL / 12)),
                '--color': shiftL >= 0 ? '#10b981' : '#ef4444',
              } as React.CSSProperties}
            >
              {shiftL !== 0 && (
                shiftL > 0 ? <CaretUp size={20} weight="bold" /> : <CaretDown size={20} weight="bold" />
              )}
            </div>
            <div
              className="interval-arrow"
              style={{
                '--shift': Math.max(-1, Math.min(1, shiftR / 12)),
                '--color': shiftR >= 0 ? '#10b981' : '#ef4444',
              } as React.CSSProperties}
            >
              {shiftR !== 0 && (
                shiftR > 0 ? <CaretUp size={20} weight="bold" /> : <CaretDown size={20} weight="bold" />
              )}
            </div>
          </div>

          {/* Right channel */}
          <div className="interval-channel">
            <span className="interval-label">R</span>
            <div className="interval-value" style={{ '--accent': '#f59e0b' } as React.CSSProperties}>
              <span className="interval-semitones">{formatSemitones(shiftR)}</span>
              <span className="interval-name">{getIntervalName(shiftR)}</span>
            </div>
          </div>
        </div>

        {/* Mini piano keyboard showing shift */}
        <div className="interval-piano">
          {[...Array(25)].map((_, i) => {
            const noteIndex = i % 12
            const isBlack = PIANO_KEYS[noteIndex] === 1
            const isRoot = i === 12 // Middle C as reference
            const isShiftedL = i === 12 + shiftL
            const isShiftedR = i === 12 + shiftR

            return (
              <div
                key={i}
                className={`piano-key ${isBlack ? 'black' : 'white'} ${isRoot ? 'root' : ''} ${isShiftedL ? 'shifted-l' : ''} ${isShiftedR ? 'shifted-r' : ''}`}
              />
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={renderPianoVisualization()}
      compact={compact}
      customHeader={
        <div className="interval-card-header">
          <span className="interval-card-title">INTERVAL SHIFTER</span>
          <span className="interval-subtitle">Musical Pitch Shift</span>
        </div>
      }
    >
      {/* Quick Presets */}
      <div className="interval-presets-section">
        <button
          className="interval-presets-toggle"
          onClick={() => setShowPresets(!showPresets)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Lightning size={14} weight="duotone" />
          <span>Quick Presets</span>
          <CaretDown size={14} weight="bold" className={showPresets ? 'rotated' : ''} />
        </button>

        {showPresets && (
          <div className="interval-presets-dropdown">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                className="interval-preset-btn"
                onClick={() => { applyPreset(preset); setShowPresets(false) }}
                style={{ '--accent': accentColor } as React.CSSProperties}
              >
                <span className="preset-name">{preset.name}</span>
                <span className="preset-desc">{preset.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Semitone Controls */}
      <ParameterSection title="Interval Shift" accentColor={accentColor}>
        <div className="interval-controls">
          {/* Left Channel */}
          <div className="interval-stepper">
            <span className="stepper-label">Left</span>
            <div className="stepper-buttons">
              <button onClick={() => handleSemitonesL(-12)} title="-Octave">-12</button>
              <button onClick={() => handleSemitonesL(-2)} title="-Full Step" className="step-btn">-2</button>
              <button onClick={() => handleSemitonesL(-1)} title="-Semitone">-1</button>
              <span className="stepper-value">{formatSemitones(parameters.semitonesL)}</span>
              <button onClick={() => handleSemitonesL(1)} title="+Semitone">+1</button>
              <button onClick={() => handleSemitonesL(2)} title="+Full Step" className="step-btn">+2</button>
              <button onClick={() => handleSemitonesL(12)} title="+Octave">+12</button>
            </div>
            <span className="stepper-interval">{getIntervalName(parameters.semitonesL)}</span>
          </div>

          {/* Link Button */}
          <button
            className={`interval-link-btn ${linkLR ? 'linked' : ''}`}
            onClick={() => setLinkLR(!linkLR)}
            style={{ '--accent': accentColor } as React.CSSProperties}
            title={linkLR ? 'Linked L/R' : 'Independent L/R'}
          >
            {linkLR ? <Link size={16} weight="duotone" /> : <LinkBreak size={16} weight="duotone" />}
          </button>

          {/* Right Channel */}
          <div className="interval-stepper">
            <span className="stepper-label">Right</span>
            <div className="stepper-buttons">
              <button
                onClick={() => handleSemitonesR(-12)}
                title="-Octave"
                disabled={linkLR}
              >-12</button>
              <button
                onClick={() => handleSemitonesR(-2)}
                title="-Full Step"
                disabled={linkLR}
                className="step-btn"
              >-2</button>
              <button
                onClick={() => handleSemitonesR(-1)}
                title="-Semitone"
                disabled={linkLR}
              >-1</button>
              <span className="stepper-value">{formatSemitones(parameters.semitonesR)}</span>
              <button
                onClick={() => handleSemitonesR(1)}
                title="+Semitone"
                disabled={linkLR}
              >+1</button>
              <button
                onClick={() => handleSemitonesR(2)}
                title="+Full Step"
                disabled={linkLR}
                className="step-btn"
              >+2</button>
              <button
                onClick={() => handleSemitonesR(12)}
                title="+Octave"
                disabled={linkLR}
              >+12</button>
            </div>
            <span className="stepper-interval">{getIntervalName(parameters.semitonesR)}</span>
          </div>
        </div>

        {/* Quick interval buttons */}
        <div className="interval-quick-buttons">
          <button onClick={() => handleSetBoth(-12)} className={parameters.semitonesL === -12 ? 'active' : ''}>-Oct</button>
          <button onClick={() => handleSetBoth(-7)} className={parameters.semitonesL === -7 ? 'active' : ''}>-5th</button>
          <button onClick={() => handleSetBoth(-5)} className={parameters.semitonesL === -5 ? 'active' : ''}>-4th</button>
          <button onClick={() => handleSetBoth(0)} className={parameters.semitonesL === 0 ? 'active' : ''}>0</button>
          <button onClick={() => handleSetBoth(3)} className={parameters.semitonesL === 3 ? 'active' : ''}>m3</button>
          <button onClick={() => handleSetBoth(4)} className={parameters.semitonesL === 4 ? 'active' : ''}>M3</button>
          <button onClick={() => handleSetBoth(5)} className={parameters.semitonesL === 5 ? 'active' : ''}>4th</button>
          <button onClick={() => handleSetBoth(7)} className={parameters.semitonesL === 7 ? 'active' : ''}>5th</button>
          <button onClick={() => handleSetBoth(12)} className={parameters.semitonesL === 12 ? 'active' : ''}>Oct</button>
        </div>
      </ParameterSection>

      {/* Mix Control */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Mix"
            value={parameters.mix}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
        <div className="interval-mix-labels">
          <span>Dry</span>
          <span>Wet</span>
        </div>
      </ParameterSection>

      {/* Footer */}
      <div className="interval-footer">
        <div className="interval-metering">
          <span>IN: {Math.max(metering.inputLevelL, metering.inputLevelR).toFixed(1)} dB</span>
          <span>OUT: {Math.max(metering.outputLevelL, metering.outputLevelR).toFixed(1)} dB</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { IntervalShifterCardBase as IntervalShifterCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(IntervalShifterCardBase, INTERVAL_SHIFTER_URI, INTERVAL_PARAMS)
