/**
 * WhammyCard - dm-Whammy Pitch Shifter (Carbon-compliant)
 *
 * DigiTech Whammy inspired pitch shifter using PitchCategoryLayout.
 *
 * LV2 URI: http://drobilla.net/plugins/mda/dm-Whammy
 */

import { useState, useMemo } from 'react'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { NumberInput } from '../../../ParameterControl'
import { ArrowDown, ArrowUp, Link, Unlink } from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'

const PARAM_MAP = {
  pitch: 0,
  mix: 1,
  mode: 2,
  detune: 3,
  formant: 4,
}

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
  accentColor = '#ef4444',
  compact = false,
}: PluginCardProps) {
  const [selectedMode, setSelectedMode] = useState(6)
  const [isHarmonyMode, setIsHarmonyMode] = useState(false)
  const [pedalPosition, setPedalPosition] = useState(100)

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const currentShift = useMemo(() => {
    const mode = WHAMMY_MODES[selectedMode]
    return (mode.semitones * pedalPosition) / 100
  }, [selectedMode, pedalPosition])

  const handlePedalChange = (position: number) => {
    setPedalPosition(position)
    const mode = WHAMMY_MODES[selectedMode]
    const pitchValue = (mode.semitones * position) / 100
    setValue('pitch', pitchValue)
  }

  const handleModeChange = (modeIndex: number) => {
    setSelectedMode(modeIndex)
    const mode = WHAMMY_MODES[modeIndex]
    const pitchValue = (mode.semitones * pedalPosition) / 100
    setValue('pitch', pitchValue)
    setValue('mode', modeIndex)
  }

  const visualization = (
    <div style={{ padding: '12px 0', textAlign: 'center' }}>
      {/* Pedal display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ flex: 1, maxWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
            <span>HEEL</span>
            <span>TOE</span>
          </div>
          <NumberInput
            value={pedalPosition}
            min={0} max={100} step={1} defaultValue={100}
            profile="integer" unit="%"
            onChange={handlePedalChange}
            size="small" showLabel={false}
            accentColor={accentColor}
          />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {currentShift > 0 ? <ArrowUp size={20} style={{ color: accentColor }} /> : currentShift < 0 ? <ArrowDown size={20} style={{ color: accentColor }} /> : null}
            <span style={{ fontSize: 24, fontWeight: 800, color: accentColor, fontFamily: 'var(--font-mono)' }}>
              {currentShift >= 0 ? '+' : ''}{currentShift.toFixed(1)}
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>semitones</span>
        </div>
      </div>
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'modes',
      title: isHarmonyMode ? 'Harmony Modes' : 'Whammy Modes',
      defaultOpen: true,
      children: (
        <div>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              className={`carbon-preset-btn ${!isHarmonyMode ? 'carbon-preset-btn--active' : ''}`}
              onClick={() => setIsHarmonyMode(false)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <Unlink size={12} /> Whammy
            </button>
            <button
              className={`carbon-preset-btn ${isHarmonyMode ? 'carbon-preset-btn--active' : ''}`}
              onClick={() => setIsHarmonyMode(true)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <Link size={12} /> Harmony
            </button>
          </div>

          {/* Mode chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(isHarmonyMode ? HARMONY_MODES : WHAMMY_MODES).map((mode, index) => (
              <button
                key={mode.name}
                className={`carbon-preset-btn ${selectedMode === index ? 'carbon-preset-btn--active' : ''}`}
                onClick={() => isHarmonyMode ? setSelectedMode(index) : handleModeChange(index)}
                style={{ fontSize: 10 }}
              >
                {'icon' in mode && (mode.icon === 'up' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                {mode.name}
              </button>
            ))}
          </div>

          {/* Current mode info */}
          <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
            Mode: <span style={{ color: accentColor }}>
              {isHarmonyMode ? HARMONY_MODES[selectedMode]?.name : WHAMMY_MODES[selectedMode]?.name}
            </span>
            {' | '}
            {isHarmonyMode
              ? `\u00b1${Math.abs(HARMONY_MODES[selectedMode]?.interval1 || 0)} st`
              : `0 \u2192 ${WHAMMY_MODES[selectedMode]?.semitones > 0 ? '+' : ''}${WHAMMY_MODES[selectedMode]?.semitones} st`
            }
          </div>
        </div>
      ),
    },
  ]

  const semitones: ParamSlot = {
    label: 'Pedal', value: pedalPosition,
    min: 0, max: 100, defaultValue: 100, unit: '%',
    onChange: handlePedalChange,
  }

  const detune: ParamSlot = {
    label: 'Detune', value: getValue('detune', 0),
    min: -100, max: 100, defaultValue: 0, unit: '\u00a2',
    onChange: (v) => setValue('detune', v),
    valueFormatter: (v) => (v >= 0 ? '+' : '') + v.toFixed(0),
  }

  const glide: ParamSlot = {
    label: 'Formant', value: getValue('formant', 50),
    min: 0, max: 100, defaultValue: 50, unit: '%',
    onChange: (v) => setValue('formant', v),
  }

  const mix: ParamSlot = {
    label: 'Mix', value: getValue('mix', 100),
    min: 0, max: 100, defaultValue: 100, unit: '%',
    onChange: (v) => setValue('mix', v),
  }

  return (
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      semitones={semitones}
      detune={detune}
      glide={glide}
      mix={mix}
      advancedSections={advancedSections}
    />
  )
}

export default WhammyCard
