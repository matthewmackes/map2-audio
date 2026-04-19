/**
 * IntervalShifterCard - Musical Interval Pitch Shifter
 *
 * Shifts the full instrument up or down in half or full steps (semitones).
 * Provides musical interval presets for easy harmonization.
 */

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Link, Unlink } from '@carbon/icons-react'
import {
  useIntervalShifter,
  MUSICAL_INTERVALS,
  INTERVAL_PRESETS,
  type IntervalPreset,
} from '../../../../hooks/useModulation'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

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
  pluginPosition,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
}: IntervalShifterCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
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
  } = useIntervalShifter({
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
    pluginUri: plugin.uri,
  })

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
  const visualization = (
    <div className="interval-visualization">
      <div className="interval-display">
        {/* Left channel */}
        <div className="interval-channel">
          <span className="interval-label">L</span>
          <div className="interval-value" style={{ '--accent': '#4ecdc4' } as React.CSSProperties}>
            <span className="interval-semitones">{formatSemitones(parameters.semitonesL)}</span>
            <span className="interval-name">{getIntervalName(parameters.semitonesL)}</span>
          </div>
        </div>

        {/* Visual shift indicator */}
        <div className="interval-arrow-display">
          <div
            className="interval-arrow"
            style={{
              '--shift': Math.max(-1, Math.min(1, parameters.semitonesL / 12)),
              '--color': parameters.semitonesL >= 0 ? '#10b981' : '#ef4444',
            } as React.CSSProperties}
          >
            {parameters.semitonesL !== 0 && (
              parameters.semitonesL > 0 ? <ChevronUp size={20} /> : <ChevronDown size={20} />
            )}
          </div>
          <div
            className="interval-arrow"
            style={{
              '--shift': Math.max(-1, Math.min(1, parameters.semitonesR / 12)),
              '--color': parameters.semitonesR >= 0 ? '#10b981' : '#ef4444',
            } as React.CSSProperties}
          >
            {parameters.semitonesR !== 0 && (
              parameters.semitonesR > 0 ? <ChevronUp size={20} /> : <ChevronDown size={20} />
            )}
          </div>
        </div>

        {/* Right channel */}
        <div className="interval-channel">
          <span className="interval-label">R</span>
          <div className="interval-value" style={{ '--accent': '#f59e0b' } as React.CSSProperties}>
            <span className="interval-semitones">{formatSemitones(parameters.semitonesR)}</span>
            <span className="interval-name">{getIntervalName(parameters.semitonesR)}</span>
          </div>
        </div>
      </div>

      {/* Mini piano keyboard showing shift */}
      <div className="interval-piano">
        {[...Array(25)].map((_, i) => {
          const noteIndex = i % 12
          const isBlack = PIANO_KEYS[noteIndex] === 1
          const isRoot = i === 12 // Middle C as reference
          const isShiftedL = i === 12 + parameters.semitonesL
          const isShiftedR = i === 12 + parameters.semitonesR

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

  // ParamSlots
  const semitonesSlot: ParamSlot = {
    label: 'Semitones L',
    value: parameters.semitonesL,
    min: -24,
    max: 24,
    defaultValue: 0,
    step: 1,
    unit: 'st',
    onChange: (v: number) => {
      if (linkLR) setSemitonesBoth(v, v)
      else setSemitonesL(v)
    },
    valueFormatter: (v: number) => formatSemitones(v),
  }

  const intervalSlot: ParamSlot = {
    label: 'Semitones R',
    value: parameters.semitonesR,
    min: -24,
    max: 24,
    defaultValue: 0,
    step: 1,
    unit: 'st',
    onChange: (v: number) => {
      if (linkLR) setSemitonesBoth(v, v)
      else setSemitonesR(v)
    },
    valueFormatter: (v: number) => formatSemitones(v),
  }

  const mixSlot: ParamSlot = {
    label: 'Mix',
    value: parameters.mix,
    min: 0,
    max: 100,
    defaultValue: 50,
    unit: '%',
    onChange: setMix,
  }

  // Piano keyboard in advanced sections
  const advancedSections: AdvancedSection[] = [
    {
      id: 'keyboard',
      title: 'Piano Keyboard & Controls',
      defaultOpen: true,
      children: (
        <>
          {/* Semitone Stepper Controls */}
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
              {linkLR ? <Link size={16} /> : <Unlink size={16} />}
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
        </>
      ),
    },
  ]

  // Quick presets
  const presetsNode = (
    <div className="carbon-preset-row">
      {presets.map((preset, idx) => (
        <button
          key={idx}
          className="carbon-preset-btn"
          onClick={() => applyPreset(preset)}
        >
          {preset.name}
        </button>
      ))}
    </div>
  )

  return (
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      semitones={semitonesSlot}
      interval={intervalSlot}
      mix={mixSlot}
      inputLevel={Math.max(metering.inputLevelL, metering.inputLevelR)}
      outputLevel={Math.max(metering.outputLevelL, metering.outputLevelR)}
      advancedSections={advancedSections}
      presets={presetsNode}
    />
  )
}

// Export base component for testing
export { IntervalShifterCardBase as IntervalShifterCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(IntervalShifterCardBase, INTERVAL_SHIFTER_URI, INTERVAL_PARAMS)
