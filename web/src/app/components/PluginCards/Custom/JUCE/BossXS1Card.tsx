/**
 * BossXS1Card - Custom card for JUCE Boss XS-1 Polyphonic Pitch Shifter
 *
 * Features Boss-style presets for drop tunings, capo simulation, octave effects,
 * and creative pitch shifting with expression pedal control.
 */

import { useState, useCallback } from 'react'
import { Flow, Music, SettingsAdjust } from '@carbon/icons-react'
import { useBossXS1, BOSS_XS1_PRESETS } from '../../../../hooks/useModulation'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { NumberInput } from '../../../ParameterControl'
import { ParameterKnob } from '../../../ParameterControl'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { formatSemitones, formatPitch, formatDetune, formatShift } from '../../utils/formatters'
import { dbToNormalized } from '../../utils/metering'

// Plugin URI for MIDI mappings
const BOSS_XS1_URI = 'map2://juce/pitch/boss-xs1'

// Parameter definitions for MIDI mapping dialog
const BOSS_XS1_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Shift Amount', symbol: 'shiftAmount' },
  { index: 1, name: 'Balance', symbol: 'balance' },
  { index: 2, name: 'Detune Amount', symbol: 'detuneAmount' },
  { index: 3, name: 'Glide', symbol: 'glide' },
  { index: 4, name: 'Feedback', symbol: 'feedback' },
  { index: 5, name: 'Pedal Position', symbol: 'pedalPosition' },
  { index: 6, name: 'Pedal Min', symbol: 'pedalMin' },
  { index: 7, name: 'Pedal Max', symbol: 'pedalMax' },
]

// Category groupings for preset browser
const PRESET_CATEGORIES = {
  tuning: { label: 'Drop Tunings', presets: ['drop_d', 'drop_d_sharp', 'half_step_down'] },
  capo: { label: 'Capo Simulation', presets: ['capo_2nd_fret', 'capo_3rd_fret', 'capo_5th_fret'] },
  octave: { label: 'Octave Effects', presets: ['octave_up', 'octave_down', 'octave_up_down', 'sub_bass', 'sonic_screamer'] },
  doubling: { label: 'Doubling/Detune', presets: ['micro_pitch_wide', 'micro_pitch_narrow', 'voice_doubling', 'string_doubling', 'pianist_octaves'] },
  creative: { label: 'Creative', presets: ['unique_intervals', 'minor_third', 'chord_shift', 'detune_chorus', 'spacey_vibrato', 'robotic_mod'] },
}

interface BossXS1CardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function BossXS1CardBase({
  plugin,
  pluginPosition,
  accentColor = '#ff6600', // Boss orange
  compact = false,
  onOpenMidiMappings,
}: BossXS1CardProps) {
  const {
    parameters,
    metering,
    presets,
    setShiftAmount,
    setBalance,
    setDetuneMode,
    setDetuneAmount,
    setGlide,
    setFeedback,
    setPedalEnabled,
    setPedalPosition,
    setPedalRange,
    setPreset,
    setBypass,
    isConnected,
  } = useBossXS1({
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
  })

  const [showPresetBrowser, setShowPresetBrowser] = useState(false)

  const currentPreset = presets.find((_, idx) => idx === parameters.preset) || presets[0]

  // Pitch visualization
  const visualization = (
    <div className="boss-visualization">
      <div className="boss-pitch-display">
        <div className="boss-pitch-indicator">
          <div
            className="boss-pitch-bar"
            style={{
              '--shift': Math.abs(parameters.shiftAmount) / 7,
              '--direction': parameters.shiftAmount >= 0 ? 1 : -1,
            } as React.CSSProperties}
          />
          <span className="boss-pitch-value">
            {parameters.detuneMode
              ? formatPitch(parameters.detuneAmount)
              : formatSemitones(parameters.shiftAmount)}
          </span>
        </div>
        <div className="boss-mode-badge">
          {parameters.detuneMode ? 'DETUNE' : 'SHIFT'}
        </div>
      </div>
      {/* Metering */}
      <div className="boss-meters">
        <div className="boss-meter">
          <span>IN</span>
          <div className="boss-meter-bar">
            <div
              className="boss-meter-fill"
              style={{ width: `${dbToNormalized(metering.inputLevel) * 100}%` }}
            />
          </div>
        </div>
        <div className="boss-meter">
          <span>OUT</span>
          <div className="boss-meter-bar">
            <div
              className="boss-meter-fill boss-meter-output"
              style={{ width: `${dbToNormalized(metering.outputLevel) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )

  // ParamSlots - conditional on mode
  const semitonesSlot: ParamSlot | undefined = !parameters.detuneMode ? {
    label: 'Shift',
    value: parameters.shiftAmount,
    min: -7,
    max: 7,
    defaultValue: 0,
    unit: 'st',
    onChange: setShiftAmount,
    valueFormatter: formatShift,
  } : undefined

  const detuneSlot: ParamSlot | undefined = parameters.detuneMode ? {
    label: 'Detune',
    value: parameters.detuneAmount,
    min: -20,
    max: 20,
    defaultValue: 20,
    unit: 'c',
    onChange: setDetuneAmount,
    valueFormatter: formatDetune,
  } : undefined

  const glideSlot: ParamSlot = {
    label: 'Glide',
    value: parameters.glide,
    min: 0,
    max: 100,
    defaultValue: 0,
    unit: 'ms',
    onChange: setGlide,
  }

  const feedbackSlot: ParamSlot = {
    label: 'Feedback',
    value: parameters.feedback * 100,
    min: 0,
    max: 70,
    defaultValue: 0,
    unit: '%',
    onChange: (v: number) => setFeedback(v / 100),
  }

  const mixSlot: ParamSlot = {
    label: 'Balance',
    value: parameters.balance,
    min: 0,
    max: 100,
    defaultValue: 50,
    unit: '%',
    onChange: setBalance,
  }

  // Expression pedal in advanced section
  const advancedSections: AdvancedSection[] = [
    {
      id: 'expression-pedal',
      title: 'Expression Pedal',
      defaultOpen: false,
      children: (
        <div className="boss-pedal-section">
          <button
            className={`boss-pedal-toggle ${parameters.pedalEnabled ? 'active' : ''}`}
            onClick={() => setPedalEnabled(!parameters.pedalEnabled)}
            style={{ '--accent': accentColor } as React.CSSProperties}
          >
            <Flow size={16} />
            <span>{parameters.pedalEnabled ? 'Enabled' : 'Disabled'}</span>
          </button>

          {parameters.pedalEnabled && (
            <div className="boss-pedal-controls">
              <ParameterKnob
                label="Position"
                value={parameters.pedalPosition}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={setPedalPosition}
                accentColor={accentColor}
                size="small"
              />
              <div className="boss-pedal-range">
                <label>Range</label>
                <div className="boss-pedal-range-inputs">
                  <NumberInput
                    value={parameters.pedalMin}
                    min={-36}
                    max={36}
                    step={1}
                    defaultValue={-12}
                    profile="integer"
                    onChange={(value) => setPedalRange(value, parameters.pedalMax)}
                    size="small"
                    showLabel={false}
                    inline
                    accentColor={accentColor}
                    className="boss-pedal-range-input"
                  />
                  <span>to</span>
                  <NumberInput
                    value={parameters.pedalMax}
                    min={-36}
                    max={36}
                    step={1}
                    defaultValue={12}
                    profile="integer"
                    onChange={(value) => setPedalRange(parameters.pedalMin, value)}
                    size="small"
                    showLabel={false}
                    inline
                    accentColor={accentColor}
                    className="boss-pedal-range-input"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ),
    },
  ]

  // Quick shift preset buttons
  const presetsNode = (
    <>
      {/* Mode Toggle */}
      <div className="boss-mode-toggle">
        <button
          className={`boss-mode-btn ${!parameters.detuneMode ? 'active' : ''}`}
          onClick={() => setDetuneMode(false)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <SettingsAdjust size={14} />
          <span>Shift</span>
        </button>
        <button
          className={`boss-mode-btn ${parameters.detuneMode ? 'active' : ''}`}
          onClick={() => setDetuneMode(true)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Music size={14} />
          <span>Detune</span>
        </button>
      </div>

      {/* Quick shift buttons */}
      {!parameters.detuneMode && (
        <div className="carbon-preset-row">
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(-2)} title="Drop D">-2</button>
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(-1)} title="Half step down">-1</button>
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(0)} title="No shift">0</button>
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(2)} title="Capo 2">+2</button>
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(5)} title="Capo 5">+5</button>
          <button className="carbon-preset-btn" onClick={() => setShiftAmount(7)} title="Fifth">+7</button>
        </div>
      )}

      {/* Categorized preset browser */}
      <div className="boss-preset-section">
        <button
          className="boss-preset-button"
          onClick={() => setShowPresetBrowser(!showPresetBrowser)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Music size={14} />
          <span className="boss-preset-name">{currentPreset.name}</span>
        </button>

        {showPresetBrowser && (
          <div className="boss-preset-browser">
            {/* Manual */}
            <button
              className={`boss-preset-item ${parameters.preset === 0 ? 'active' : ''}`}
              onClick={() => { setPreset(0); setShowPresetBrowser(false) }}
            >
              <span className="boss-preset-item-name">Manual</span>
              <span className="boss-preset-item-desc">Custom settings</span>
            </button>

            {/* Categorized presets */}
            {Object.entries(PRESET_CATEGORIES).map(([catKey, category]) => (
              <div key={catKey}>
                <div className="boss-category-header">
                  <span>{category.label}</span>
                </div>
                {category.presets.map((presetId) => {
                  const presetIndex = presets.findIndex(p => p.id === presetId)
                  const preset = presets[presetIndex]
                  if (!preset) return null
                  return (
                    <button
                      key={presetId}
                      className={`boss-preset-item ${parameters.preset === presetIndex ? 'active' : ''}`}
                      onClick={() => { setPreset(presetIndex); setShowPresetBrowser(false) }}
                      style={{ '--accent': accentColor } as React.CSSProperties}
                    >
                      <span className="boss-preset-item-name">{preset.name}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
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
      detune={detuneSlot}
      glide={glideSlot}
      feedback={feedbackSlot}
      mix={mixSlot}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      advancedSections={advancedSections}
      presets={presetsNode}
    />
  )
}

// Export base component for testing
export { BossXS1CardBase as BossXS1Card }

// Export wrapped component with MIDI dialog
export default withMidiDialog(BossXS1CardBase, BOSS_XS1_URI, BOSS_XS1_PARAMS)
