/**
 * WhammyCard - dm-Whammy Pitch Shifter
 *
 * DigiTech Whammy inspired pitch shifter interface with expression pedal,
 * interval selection, and octave controls.
 *
 * LV2 URI: http://drobilla.net/plugins/mda/dm-Whammy
 */

import { useState, useMemo } from 'react'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { NumberInput } from '../../../Controls/NumberInput'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { PitchDisplay } from '../../Visualizations/PitchDisplay'
import { ArrowUp, ArrowDown, Link, LinkBreak } from '@phosphor-icons/react'
import type { PluginCardProps } from '../../types'
import './WhammyCard.css'

// Parameter indices
const PARAM_MAP = {
  pitch: 0,        // Pitch shift amount
  mix: 1,          // Dry/Wet mix
  mode: 2,         // Whammy mode
  detune: 3,       // Fine detune
  formant: 4,      // Formant preservation
}

// Whammy modes inspired by DigiTech
const WHAMMY_MODES = [
  { name: '2nd Up', semitones: 2, icon: 'up' },
  { name: '2nd Down', semitones: -2, icon: 'down' },
  { name: '4th Up', semitones: 5, icon: 'up' },
  { name: '4th Down', semitones: -5, icon: 'down' },
  { name: '5th Up', semitones: 7, icon: 'up' },
  { name: '5th Down', semitones: -7, icon: 'down' },
  { name: 'Oct Up', semitones: 12, icon: 'up' },
  { name: 'Oct Down', semitones: -12, icon: 'down' },
  { name: '2 Oct Up', semitones: 24, icon: 'up' },
  { name: '2 Oct Down', semitones: -24, icon: 'down' },
  { name: 'Dive Bomb', semitones: -36, icon: 'down' },
  { name: 'Deep', semitones: -24, icon: 'down' },
]

// Harmony modes
const HARMONY_MODES = [
  { name: 'Unison', interval1: 0, interval2: 0 },
  { name: '3rd', interval1: 4, interval2: 4 },
  { name: '4th', interval1: 5, interval2: 5 },
  { name: '5th', interval1: 7, interval2: 7 },
  { name: 'Octave', interval1: 12, interval2: -12 },
  { name: 'Oct + 5th', interval1: 12, interval2: 7 },
]

export function WhammyCard({
  plugin,
  parameterValues,
  onParameterChange,
  realtimeData,
  accentColor = '#ef4444', // Red for Whammy
  compact = false,
}: PluginCardProps) {
  const [selectedMode, setSelectedMode] = useState(6) // Oct Up
  const [isHarmonyMode, setIsHarmonyMode] = useState(false)
  const [pedalPosition, setPedalPosition] = useState(100) // 0-100%

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  // Calculate current pitch shift based on pedal position
  const currentShift = useMemo(() => {
    const mode = WHAMMY_MODES[selectedMode]
    return (mode.semitones * pedalPosition) / 100
  }, [selectedMode, pedalPosition])

  // Handle pedal position change
  const handlePedalChange = (position: number) => {
    setPedalPosition(position)
    const mode = WHAMMY_MODES[selectedMode]
    const pitchValue = (mode.semitones * position) / 100
    setValue('pitch', pitchValue)
  }

  // Handle mode change
  const handleModeChange = (modeIndex: number) => {
    setSelectedMode(modeIndex)
    const mode = WHAMMY_MODES[modeIndex]
    const pitchValue = (mode.semitones * pedalPosition) / 100
    setValue('pitch', pitchValue)
    setValue('mode', modeIndex)
  }

  // Visualization
  const visualization = (
    <div className="whammy-visualization">
      {/* Pedal Display */}
      <div className="whammy-pedal-container">
        <div className="whammy-pedal-label">
          <span>HEEL</span>
          <span>TOE</span>
        </div>
        <div className="whammy-pedal-track">
          <NumberInput
            value={pedalPosition}
            min={0}
            max={100}
            step={1}
            defaultValue={100}
            profile="integer"
            unit="%"
            onChange={handlePedalChange}
            size="small"
            showLabel={false}
            accentColor={accentColor}
            className="whammy-pedal-slider"
          />
        </div>
        <div className="whammy-pedal-value">
          {pedalPosition.toFixed(0)}%
        </div>
      </div>

      {/* Pitch Display */}
      <div className="whammy-pitch-display">
        <div className={`whammy-shift-indicator ${currentShift > 0 ? 'up' : currentShift < 0 ? 'down' : ''}`}>
          {currentShift > 0 ? <ArrowUp size={20} weight="duotone" /> : currentShift < 0 ? <ArrowDown size={20} weight="duotone" /> : null}
          <span className="whammy-shift-value">
            {currentShift >= 0 ? '+' : ''}{currentShift.toFixed(1)}
          </span>
          <span className="whammy-shift-unit">semitones</span>
        </div>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Mode Toggle */}
      <div className="whammy-mode-toggle">
        <button
          className={`whammy-mode-btn ${!isHarmonyMode ? 'active' : ''}`}
          onClick={() => setIsHarmonyMode(false)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <LinkBreak size={12} weight="duotone" />
          Whammy
        </button>
        <button
          className={`whammy-mode-btn ${isHarmonyMode ? 'active' : ''}`}
          onClick={() => setIsHarmonyMode(true)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Link size={12} weight="duotone" />
          Harmony
        </button>
      </div>

      {/* Whammy Mode Selection */}
      {!isHarmonyMode && (
        <div className="whammy-modes">
          {WHAMMY_MODES.map((mode, index) => (
            <button
              key={mode.name}
              className={`whammy-mode-chip ${selectedMode === index ? 'active' : ''}`}
              onClick={() => handleModeChange(index)}
              style={{ '--accent': accentColor } as React.CSSProperties}
            >
              {mode.icon === 'up' ? <ArrowUp size={10} weight="duotone" /> : <ArrowDown size={10} weight="duotone" />}
              {mode.name}
            </button>
          ))}
        </div>
      )}

      {/* Harmony Mode Selection */}
      {isHarmonyMode && (
        <div className="whammy-modes harmony">
          {HARMONY_MODES.map((mode, index) => (
            <button
              key={mode.name}
              className={`whammy-mode-chip ${selectedMode === index ? 'active' : ''}`}
              onClick={() => setSelectedMode(index)}
              style={{ '--accent': accentColor } as React.CSSProperties}
            >
              {mode.name}
            </button>
          ))}
        </div>
      )}

      {/* Fine Controls */}
      <ParameterSection title="Fine Tune" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Detune"
            value={getValue('detune', 0)}
            min={-100}
            max={100}
            defaultValue={0}
            unit="¢"
            onChange={(v) => setValue('detune', v)}
            accentColor="#6b7280"
            size="medium"
            valueFormatter={(v) => (v >= 0 ? '+' : '') + v.toFixed(0)}
          />
          <ParameterKnob
            label="Formant"
            value={getValue('formant', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('formant', v)}
            accentColor="#f59e0b"
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Mix"
            value={getValue('mix', 100)}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={(v) => setValue('mix', v)}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Current Mode Info */}
      <div className="whammy-footer">
        <div className="whammy-current-mode">
          <span className="whammy-mode-label">Mode:</span>
          <span className="whammy-mode-name" style={{ color: accentColor }}>
            {isHarmonyMode ? HARMONY_MODES[selectedMode]?.name : WHAMMY_MODES[selectedMode]?.name}
          </span>
        </div>
        <div className="whammy-range">
          <span>
            {isHarmonyMode
              ? `±${Math.abs(HARMONY_MODES[selectedMode]?.interval1 || 0)} st`
              : `0 → ${WHAMMY_MODES[selectedMode]?.semitones > 0 ? '+' : ''}${WHAMMY_MODES[selectedMode]?.semitones} st`
            }
          </span>
        </div>
      </div>
    </PluginCardShell>
  )
}

export default WhammyCard
