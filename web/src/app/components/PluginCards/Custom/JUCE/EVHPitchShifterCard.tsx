/**
 * EVHPitchShifterCard - Custom card for JUCE EVH-style Pitch Shifter
 *
 * Features Van Halen song-inspired presets based on documented Eventide settings.
 * Sources: Eventide forums, VHLinks.com, Metropoulos Forum, Premier Guitar
 */

import { useState, useCallback } from 'react'
import { ChevronDown, Link2, Link2Off, Music2, Disc3, Calendar } from 'lucide-react'
import { usePitchShifter, VAN_HALEN_PRESETS } from '../../../../hooks/useModulation'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import './EVHPitchShifterCard.css'

// Plugin URI for MIDI mappings
const EVH_PITCH_URI = 'map2://juce/pitch/evh'

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
        <div className="evh-card-header">
          <span className="evh-card-title">EVH HARMONIZER</span>
          <span className="evh-subtitle">Eventide H910/H949/H3000 Style</span>
        </div>
      }
    >
      {/* Preset Selector */}
      <div className="evh-preset-section">
        <button
          className="evh-preset-button"
          onClick={() => setShowPresetBrowser(!showPresetBrowser)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Music2 size={14} />
          <span className="evh-preset-name">{currentPreset.name}</span>
          {currentPreset.index > 0 && (
            <span className="evh-preset-song">"{currentPreset.song}"</span>
          )}
          <ChevronDown size={14} className={showPresetBrowser ? 'rotated' : ''} />
        </button>

        {currentPreset.index > 0 && (
          <div className="evh-preset-info">
            <span><Disc3 size={12} /> {currentPreset.album}</span>
            <span><Calendar size={12} /> {currentPreset.year}</span>
          </div>
        )}

        {/* Preset Browser Dropdown */}
        {showPresetBrowser && (
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
              <span className="evh-era-gear">H910 / H949</span>
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
              <span className="evh-era-gear">H3000 Micropitch</span>
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
        )}
      </div>

      {/* Pitch Controls */}
      <ParameterSection title="Pitch Shift" accentColor={accentColor}>
        <div className="evh-pitch-controls">
          <ParameterKnob
            label="Pitch L"
            value={parameters.pitchL}
            min={-100}
            max={100}
            defaultValue={0}
            unit="c"
            onChange={handlePitchL}
            valueFormatter={formatCents}
            accentColor="#4ecdc4"
            size="medium"
          />

          <button
            className={`evh-link-btn ${linkLR ? 'linked' : ''}`}
            onClick={() => setLinkLR(!linkLR)}
            style={{ '--accent': accentColor } as React.CSSProperties}
            title={linkLR ? 'Mirrored L/R' : 'Independent L/R'}
          >
            {linkLR ? <Link2 size={16} /> : <Link2Off size={16} />}
          </button>

          <ParameterKnob
            label="Pitch R"
            value={parameters.pitchR}
            min={-100}
            max={100}
            defaultValue={0}
            unit="c"
            onChange={handlePitchR}
            valueFormatter={formatCents}
            accentColor="#f59e0b"
            size="medium"
            disabled={linkLR}
          />
        </div>

        {/* Octave quick buttons for special effects like Drop Dead Legs */}
        <div className="evh-quick-pitch">
          <button onClick={() => setPitchBoth(-1200, 0)} title="Octave down (Drop Dead Legs)">-OCT</button>
          <button onClick={() => setPitchBoth(-700, 700)} title="5th harmony">5th</button>
          <button onClick={() => setPitchBoth(9, -9)} title="Sammy era micropitch">+/-9c</button>
          <button onClick={() => setPitchBoth(4, -4)} title="Roth era detune">+/-4c</button>
          <button onClick={() => setPitchBoth(1200, 0)} title="Octave up">+OCT</button>
        </div>
      </ParameterSection>

      {/* Delay / Stereo Spread */}
      <ParameterSection title="Stereo Stagger" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Delay L"
            value={parameters.delayL}
            min={0}
            max={100}
            defaultValue={0}
            unit="ms"
            onChange={setDelayL}
            accentColor="#4ecdc4"
            size="small"
          />
          <ParameterKnob
            label="Delay R"
            value={parameters.delayR}
            min={0}
            max={100}
            defaultValue={0}
            unit="ms"
            onChange={setDelayR}
            accentColor="#f59e0b"
            size="small"
          />
          <ParameterKnob
            label="Spread"
            value={parameters.spread}
            min={0}
            max={200}
            defaultValue={100}
            unit="%"
            onChange={setSpread}
            accentColor={accentColor}
            size="small"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix & Output */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Feedback"
            value={parameters.feedback * 100}
            min={0}
            max={90}
            defaultValue={0}
            unit="%"
            onChange={(v) => setFeedback(v / 100)}
            accentColor={accentColor}
            size="small"
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
        </ParameterRow>
      </ParameterSection>

      {/* Metering Footer */}
      <div className="evh-footer">
        <div className="evh-metering">
          <span>IN: {Math.max(metering.inputLevelL, metering.inputLevelR).toFixed(1)} dB</span>
          <span>OUT: {Math.max(metering.outputLevelL, metering.outputLevelR).toFixed(1)} dB</span>
        </div>
        <div className="evh-source-note">
          Settings based on Eventide Audio Forums & VHLinks.com research
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { EVHPitchShifterCardBase as EVHPitchShifterCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(EVHPitchShifterCardBase, EVH_PITCH_URI, EVH_PITCH_PARAMS)
