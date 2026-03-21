/**
 * EVHPitchShifterCard - Custom card for JUCE EVH-style Pitch Shifter
 *
 * Features Van Halen song-inspired presets based on documented harmonizer settings.
 * Sources: Audio equipment forums, VHLinks.com, Metropoulos Forum, Premier Guitar
 */

import { useState, useCallback } from 'react'
import { Calendar, Link, Music, Unlink, Waveform } from '@carbon/icons-react'
import { usePitchShifter, VAN_HALEN_PRESETS } from '../../../../hooks/useModulation'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const EVH_PITCH_URI = 'map2://juce/pitch/shifter'

// Parameter definitions for MIDI mapping dialog
const EVH_PITCH_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Pitch L', symbol: 'pitchL' },
  { index: 1, name: 'Pitch R', symbol: 'pitchR' },
  { index: 2, name: 'Delay L', symbol: 'delayL' },
  { index: 3, name: 'Delay R', symbol: 'delayR' },
  { index: 4, name: 'Feedback', symbol: 'feedback' },
  { index: 5, name: 'Mix', symbol: 'mix' },
  { index: 6, name: 'Spread', symbol: 'spread' },
]

// Era groupings for preset browser
const ROTH_ERA_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8] // 1978-1984
const HAGAR_ERA_PRESETS = [9, 10, 11, 12, 13, 14] // 1986-1996

interface EVHPitchShifterCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function EVHPitchShifterCardBase({
  plugin,
  accentColor = '#ff6b35',
  compact = false,
  onOpenMidiMappings,
}: EVHPitchShifterCardProps) {
  const {
    parameters,
    metering,
    presets,
    setPitchL,
    setPitchR,
    setPitchBoth,
    setDelayL,
    setDelayR,
    setFeedback,
    setMix,
    setSpread,
    setPreset,
    setBypass,
    isConnected,
  } = usePitchShifter()

  const [linkLR, setLinkLR] = useState(true)
  const [showPresetBrowser, setShowPresetBrowser] = useState(false)

  const currentPreset = presets.find((p) => p.index === parameters.preset) || presets[0]

  // Handle linked pitch changes
  const handlePitchL = useCallback((v: number) => {
    if (linkLR) {
      setPitchBoth(v, -v) // Mirror for typical EVH detune
    } else {
      setPitchL(v)
    }
  }, [linkLR, setPitchBoth, setPitchL])

  const handlePitchR = useCallback((v: number) => {
    if (linkLR) {
      setPitchBoth(-v, v)
    } else {
      setPitchR(v)
    }
  }, [linkLR, setPitchBoth, setPitchR])

  // Format cents display
  const formatCents = (cents: number) => {
    if (Math.abs(cents) >= 100) {
      const semitones = cents / 100
      return `${semitones > 0 ? '+' : ''}${semitones.toFixed(0)}st`
    }
    return `${cents > 0 ? '+' : ''}${cents.toFixed(0)}c`
  }

  // Stereo visualization
  const visualization = (
    <div className="evh-visualization">
      <div className="evh-stereo-display">
        <div className="evh-channel evh-left">
          <span className="evh-channel-label">L</span>
          <div className="evh-pitch-indicator" style={{ '--pitch': parameters.pitchL / 12 } as React.CSSProperties}>
            <span>{formatCents(parameters.pitchL)}</span>
          </div>
          <div className="evh-delay-bar">
            <div
              className="evh-delay-fill"
              style={{ width: `${(parameters.delayL / 100) * 100}%`, background: '#4ecdc4' }}
            />
          </div>
          <span className="evh-delay-label">{parameters.delayL.toFixed(0)}ms</span>
        </div>
        <div className="evh-center-line" />
        <div className="evh-channel evh-right">
          <span className="evh-channel-label">R</span>
          <div className="evh-pitch-indicator" style={{ '--pitch': parameters.pitchR / 12 } as React.CSSProperties}>
            <span>{formatCents(parameters.pitchR)}</span>
          </div>
          <div className="evh-delay-bar">
            <div
              className="evh-delay-fill"
              style={{ width: `${(parameters.delayR / 100) * 100}%`, background: '#f59e0b' }}
            />
          </div>
          <span className="evh-delay-label">{parameters.delayR.toFixed(0)}ms</span>
        </div>
      </div>
    </div>
  )

  // ParamSlots
  const centsSlot: ParamSlot = {
    label: 'Pitch L',
    value: parameters.pitchL,
    min: -100,
    max: 100,
    defaultValue: 0,
    unit: 'c',
    onChange: handlePitchL,
    valueFormatter: formatCents,
  }

  const detuneSlot: ParamSlot = {
    label: 'Pitch R',
    value: parameters.pitchR,
    min: -100,
    max: 100,
    defaultValue: 0,
    unit: 'c',
    onChange: handlePitchR,
    valueFormatter: formatCents,
  }

  const delaySlot: ParamSlot = {
    label: 'Delay L',
    value: parameters.delayL,
    min: 0,
    max: 100,
    defaultValue: 0,
    unit: 'ms',
    onChange: setDelayL,
  }

  const feedbackSlot: ParamSlot = {
    label: 'Feedback',
    value: parameters.feedback * 100,
    min: 0,
    max: 90,
    defaultValue: 0,
    unit: '%',
    onChange: (v: number) => setFeedback(v / 100),
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

  // Era presets in advanced sections
  const advancedSections: AdvancedSection[] = [
    {
      id: 'era-presets',
      title: 'Era Presets',
      defaultOpen: false,
      children: (
        <div className="evh-preset-browser">
          {/* Manual */}
          <button
            className={`evh-preset-item ${parameters.preset === 0 ? 'active' : ''}`}
            onClick={() => { setPreset(0); setShowPresetBrowser(false) }}
          >
            <span className="evh-preset-item-name">Manual</span>
            <span className="evh-preset-item-desc">Custom settings</span>
          </button>

          {/* Roth Era */}
          <div className="evh-era-header">
            <span>David Lee Roth Era (1978-1984)</span>
            <span className="evh-era-gear">Dual Rack Detune</span>
          </div>
          {ROTH_ERA_PRESETS.map((idx) => {
            const preset = presets[idx]
            return (
              <button
                key={idx}
                className={`evh-preset-item ${parameters.preset === idx ? 'active' : ''}`}
                onClick={() => { setPreset(idx); setShowPresetBrowser(false) }}
                style={{ '--accent': accentColor } as React.CSSProperties}
              >
                <div className="evh-preset-item-main">
                  <span className="evh-preset-item-name">{preset.name}</span>
                  <span className="evh-preset-item-album">{preset.album} ({preset.year})</span>
                </div>
                <span className="evh-preset-item-desc">{preset.description}</span>
              </button>
            )
          })}

          {/* Hagar Era */}
          <div className="evh-era-header">
            <span>Sammy Hagar Era (1986-1996)</span>
            <span className="evh-era-gear">Micropitch</span>
          </div>
          {HAGAR_ERA_PRESETS.map((idx) => {
            const preset = presets[idx]
            return (
              <button
                key={idx}
                className={`evh-preset-item ${parameters.preset === idx ? 'active' : ''}`}
                onClick={() => { setPreset(idx); setShowPresetBrowser(false) }}
                style={{ '--accent': accentColor } as React.CSSProperties}
              >
                <div className="evh-preset-item-main">
                  <span className="evh-preset-item-name">{preset.name}</span>
                  <span className="evh-preset-item-album">{preset.album} ({preset.year})</span>
                </div>
                <span className="evh-preset-item-desc">{preset.description}</span>
              </button>
            )
          })}
        </div>
      ),
    },
    {
      id: 'stereo-stagger',
      title: 'Stereo Stagger',
      defaultOpen: false,
      children: (
        <div className="carbon-param-row">
          {/* Delay R and Spread rendered here since layout only has one delay slot */}
        </div>
      ),
    },
  ]

  // Quick preset buttons
  const presetsNode = (
    <>
      {/* Current preset info */}
      {currentPreset.index > 0 && (
        <div className="evh-preset-info">
          <span><Waveform size={12} /> {currentPreset.album}</span>
          <span><Calendar size={12} /> {currentPreset.year}</span>
        </div>
      )}
      <div className="carbon-preset-row">
        <button className="carbon-preset-btn" onClick={() => setPitchBoth(-1200, 0)} title="Octave down (Drop Dead Legs)">-OCT</button>
        <button className="carbon-preset-btn" onClick={() => setPitchBoth(-700, 700)} title="5th harmony">5th</button>
        <button className="carbon-preset-btn" onClick={() => setPitchBoth(9, -9)} title="Sammy era micropitch">+/-9c</button>
        <button className="carbon-preset-btn" onClick={() => setPitchBoth(4, -4)} title="Roth era detune">+/-4c</button>
        <button className="carbon-preset-btn" onClick={() => setPitchBoth(1200, 0)} title="Octave up">+OCT</button>
      </div>
    </>
  )

  // Extra content: link button + delay R + spread (not covered by layout slots)
  const extraContent = (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <button
          className={`evh-link-btn ${linkLR ? 'linked' : ''}`}
          onClick={() => setLinkLR(!linkLR)}
          style={{ '--accent': accentColor } as React.CSSProperties}
          title={linkLR ? 'Mirrored L/R' : 'Independent L/R'}
        >
          {linkLR ? <Link size={16} /> : <Unlink size={16} />}
        </button>
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
      cents={centsSlot}
      detune={detuneSlot}
      delay={delaySlot}
      feedback={feedbackSlot}
      mix={mixSlot}
      inputLevel={Math.max(metering.inputLevelL, metering.inputLevelR)}
      outputLevel={Math.max(metering.outputLevelL, metering.outputLevelR)}
      advancedSections={advancedSections}
      presets={presetsNode}
      extraContent={extraContent}
    />
  )
}

// Export base component for testing
export { EVHPitchShifterCardBase as EVHPitchShifterCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(EVHPitchShifterCardBase, EVH_PITCH_URI, EVH_PITCH_PARAMS)
