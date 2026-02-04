/**
 * IntelliFXCard - Custom card for JUCE IntelliFX 8-Voice Chorus Processor
 *
 * Rocktron IntelliFX-style multi-voice chorus with independent control of 8 voices.
 * Each voice has pan, level, delay, depth, and rate parameters.
 * Includes HUSH noise reduction and voice mixing controls.
 */

import { useState } from 'react'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import './IntelliFXCard.css'

// Plugin URI for MIDI mappings
const INTELLIFX_URI = 'map2://juce/modulation/intellifx'

// Voice parameter indices (must match juce_processors.json order)
const VOICE_PARAMS = [
  { level: 0, pan: 1, delay: 2, depth: 3, rate: 4 },  // Voice 1
  { level: 5, pan: 6, delay: 7, depth: 8, rate: 9 },  // Voice 2
  { level: 10, pan: 11, delay: 12, depth: 13, rate: 14 },  // Voice 3
  { level: 15, pan: 16, delay: 17, depth: 18, rate: 19 },  // Voice 4
  { level: 20, pan: 21, delay: 22, depth: 23, rate: 24 },  // Voice 5
  { level: 25, pan: 26, delay: 27, depth: 28, rate: 29 },  // Voice 6
  { level: 30, pan: 31, delay: 32, depth: 33, rate: 34 },  // Voice 7
  { level: 35, pan: 36, delay: 37, depth: 38, rate: 39 },  // Voice 8
]

// Global mixer and HUSH parameters
const GLOBAL_PARAMS = {
  chorus_level: 40,
  direct_level_l: 41,
  direct_level_r: 42,
  regen_l: 43,
  regen_r: 44,
  hush_enabled: 45,
  hush_threshold: 46,
  hush_release: 47,
  preset: 48,
}

// Parameter definitions for MIDI mapping dialog (global params + voice 1 as example)
const INTELLIFX_PARAMS: PluginParamDef[] = [
  // Voice 1 (most commonly MIDI-mapped)
  { index: 0, name: 'V1 Level', symbol: 'v1_level' },
  { index: 1, name: 'V1 Pan', symbol: 'v1_pan' },
  { index: 2, name: 'V1 Delay', symbol: 'v1_delay' },
  { index: 3, name: 'V1 Depth', symbol: 'v1_depth' },
  { index: 4, name: 'V1 Rate', symbol: 'v1_rate' },
  // Global mixer
  { index: GLOBAL_PARAMS.chorus_level, name: 'Chorus Level', symbol: 'chorusLevel' },
  { index: GLOBAL_PARAMS.direct_level_l, name: 'Direct L', symbol: 'directLevelL' },
  { index: GLOBAL_PARAMS.direct_level_r, name: 'Direct R', symbol: 'directLevelR' },
  { index: GLOBAL_PARAMS.regen_l, name: 'Regen L', symbol: 'regenL' },
  { index: GLOBAL_PARAMS.regen_r, name: 'Regen R', symbol: 'regenR' },
  // HUSH
  { index: GLOBAL_PARAMS.hush_threshold, name: 'HUSH Threshold', symbol: 'hushThreshold' },
  { index: GLOBAL_PARAMS.hush_release, name: 'HUSH Release', symbol: 'hushRelease' },
]

const PRESET_NAMES = [
  'User',
  'Lush',
  'Tight',
  'Wide',
  'Ping-Pong',
  'Deep',
  'Classic',
  'Modern',
  'Metallic',
  'Spacious',
  'Retro',
  'Ambient',
  'Vintage',
  'Digital',
  'Ethereal',
  'Rhythmic',
]

interface IntelliFXCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function IntelliFXCardBase({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#ff6b9d',
  compact = false,
  onOpenMidiMappings,
}: IntelliFXCardProps) {
  const [expandedVoice, setExpandedVoice] = useState<number | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(!compact)
  const [showPresets, setShowPresets] = useState(true)

  const getValue = (index: number, defaultVal: number) =>
    parameterValues[index] ?? defaultVal

  const setValue = (index: number, value: number) =>
    onParameterChange(index, value)

  const getVoiceValue = (voiceIdx: number, param: keyof typeof VOICE_PARAMS[0]) =>
    getValue(VOICE_PARAMS[voiceIdx][param], 0)

  const setVoiceValue = (voiceIdx: number, param: keyof typeof VOICE_PARAMS[0], value: number) =>
    setValue(VOICE_PARAMS[voiceIdx][param], value)

  // Multi-voice visualization - Hidden to avoid cluttering the UI
  const voiceVisualization = (
    <div className="intellifx-visualization" style={{ display: 'none' }}>
      <div className="intellifx-voices-grid">
        {Array.from({ length: 8 }).map((_, i) => {
          const level = getVoiceValue(i, 'level')
          const pan = getVoiceValue(i, 'pan')
          const depth = getVoiceValue(i, 'depth')
          const rate = getVoiceValue(i, 'rate')

          // Normalize values for visualization
          const levelNorm = (level + 60) / 72 // -60 to +12 dB range
          const panNorm = (pan + 100) / 200 // -100 to +100 range
          const depthNorm = depth / 100

          return (
            <div
              key={i}
              className="voice-indicator"
              style={{
                opacity: Math.max(0.3, levelNorm),
                transform: `translateX(${panNorm * 30 - 15}px)`,
              }}
              title={`Voice ${i + 1}: Level ${level.toFixed(0)}dB, Pan ${pan.toFixed(0)}%, Depth ${depth.toFixed(0)}%, Rate ${rate.toFixed(0)}`}
            >
              <svg viewBox="0 0 40 60" className="voice-dot">
                <circle
                  cx="20"
                  cy="20"
                  r={10 + depthNorm * 8}
                  fill={accentColor}
                  opacity={0.7 + depthNorm * 0.3}
                />
                <circle
                  cx="20"
                  cy="20"
                  r={5}
                  fill={accentColor}
                  opacity={1}
                />
              </svg>
            </div>
          )
        })}
      </div>
      <div className="intellifx-mixer-info">
        <span>Chorus: {getValue(GLOBAL_PARAMS.chorus_level, 0).toFixed(0)}dB</span>
        <span>Direct: {getValue(GLOBAL_PARAMS.direct_level_l, 0).toFixed(0)}dB</span>
        <span>Regen: {getValue(GLOBAL_PARAMS.regen_l, 30).toFixed(0)}%</span>
      </div>
    </div>
  )

  const presetIdx = Math.round(getValue(GLOBAL_PARAMS.preset, 0))
  const presetName = PRESET_NAMES[presetIdx] || 'Custom'

  // Preset browser component
  const presetBrowser = showPresets && (
    <div className="intellifx-preset-browser">
      <div className="intellifx-preset-browser-header">
        <h3 style={{ color: accentColor }}>Presets</h3>
        <button onClick={() => setShowPresets(false)} className="intellifx-close-btn">✕</button>
      </div>
      <div className="intellifx-preset-list">
        {PRESET_NAMES.map((name, idx) => (
          <button
            key={idx}
            onClick={() => {
              setValue(GLOBAL_PARAMS.preset, idx)
              setShowPresets(false)
            }}
            className={`intellifx-preset-item ${presetIdx === idx ? 'active' : ''}`}
            style={{
              borderLeftColor: presetIdx === idx ? accentColor : 'transparent',
              backgroundColor: presetIdx === idx ? `${accentColor}15` : 'transparent',
            }}
          >
            <span className="intellifx-preset-number">{idx + 1}</span>
            <span className="intellifx-preset-label">{name}</span>
            {presetIdx === idx && <span style={{ color: accentColor }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={getValue(GLOBAL_PARAMS.hush_enabled + 4, 0) === 0} // Adjust if bypass is at a different index
      onBypassToggle={() => {
        // Toggle bypass - adjust index based on actual parameter location
      }}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={voiceVisualization}
      compact={compact}
      customHeader={
        <div className="intellifx-card-header">
          <span className="intellifx-card-title">INTELLIFX 8-VOICE</span>
          <button
            className="intellifx-preset-selector"
            onClick={() => setShowPresets(!showPresets)}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            <span className="intellifx-preset-name">{presetName}</span>
            <span className="intellifx-preset-arrow">▼</span>
          </button>
        </div>
      }
    >
      {presetBrowser}

      {/* Global Mixer Controls - Compact Layout */}
      <ParameterSection title="Master" accentColor={accentColor}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          <ParameterKnob
            label="Chorus"
            value={getValue(GLOBAL_PARAMS.chorus_level, 0)}
            min={-60}
            max={12}
            defaultValue={0}
            onChange={(v) => setValue(GLOBAL_PARAMS.chorus_level, v)}
            accentColor={accentColor}
            size="small"
            unit="dB"
          />
          <ParameterKnob
            label="Dir L"
            value={getValue(GLOBAL_PARAMS.direct_level_l, 0)}
            min={-60}
            max={12}
            defaultValue={0}
            onChange={(v) => setValue(GLOBAL_PARAMS.direct_level_l, v)}
            accentColor={accentColor}
            size="small"
            unit="dB"
          />
          <ParameterKnob
            label="Dir R"
            value={getValue(GLOBAL_PARAMS.direct_level_r, 0)}
            min={-60}
            max={12}
            defaultValue={0}
            onChange={(v) => setValue(GLOBAL_PARAMS.direct_level_r, v)}
            accentColor={accentColor}
            size="small"
            unit="dB"
          />
          <ParameterKnob
            label="Reg L"
            value={getValue(GLOBAL_PARAMS.regen_l, 30)}
            min={0}
            max={100}
            defaultValue={30}
            onChange={(v) => setValue(GLOBAL_PARAMS.regen_l, v)}
            accentColor={accentColor}
            size="small"
            unit="%"
          />
          <ParameterKnob
            label="Reg R"
            value={getValue(GLOBAL_PARAMS.regen_r, 30)}
            min={0}
            max={100}
            defaultValue={30}
            onChange={(v) => setValue(GLOBAL_PARAMS.regen_r, v)}
            accentColor={accentColor}
            size="small"
            unit="%"
          />
        </div>
      </ParameterSection>

      {/* HUSH Noise Reduction - Compact */}
      <ParameterSection title="HUSH" accentColor={accentColor}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          <ParameterKnob
            label="Threshold"
            value={getValue(GLOBAL_PARAMS.hush_threshold, -40)}
            min={-80}
            max={0}
            defaultValue={-40}
            onChange={(v) => setValue(GLOBAL_PARAMS.hush_threshold, v)}
            accentColor={accentColor}
            size="small"
            unit="dB"
          />
          <ParameterKnob
            label="Release"
            value={getValue(GLOBAL_PARAMS.hush_release, 100)}
            min={10}
            max={1000}
            defaultValue={100}
            onChange={(v) => setValue(GLOBAL_PARAMS.hush_release, v)}
            accentColor={accentColor}
            size="small"
            unit="ms"
            isLogarithmic={true}
          />
        </div>
      </ParameterSection>

      {/* Voice Controls - More Compact Layout */}
      <div className="intellifx-voices-container">
        {Array.from({ length: 8 }).map((_, voiceIdx) => (
          <div key={voiceIdx} className="voice-section">
            <button
              className="voice-header"
              onClick={() => setExpandedVoice(expandedVoice === voiceIdx ? null : voiceIdx)}
              style={{ borderColor: accentColor }}
            >
              <span className="voice-number">V{voiceIdx + 1}</span>
              <span className="voice-level">
                {getVoiceValue(voiceIdx, 'level').toFixed(0)}dB @ {getVoiceValue(voiceIdx, 'pan').toFixed(0)}%
              </span>
              <span className="expand-icon">{expandedVoice === voiceIdx ? '−' : '+'}</span>
            </button>

            {(expandedVoice === voiceIdx || !compact) && (
              <div className="voice-controls-grid">
                <ParameterKnob
                  label="Level"
                  value={getVoiceValue(voiceIdx, 'level')}
                  min={-60}
                  max={12}
                  defaultValue={-6}
                  onChange={(v) => setVoiceValue(voiceIdx, 'level', v)}
                  accentColor={accentColor}
                  size="small"
                  unit="dB"
                />
                <ParameterKnob
                  label="Pan"
                  value={getVoiceValue(voiceIdx, 'pan')}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(v) => setVoiceValue(voiceIdx, 'pan', v)}
                  accentColor={accentColor}
                  size="small"
                  unit="%"
                />
                <ParameterKnob
                  label="Delay"
                  value={getVoiceValue(voiceIdx, 'delay')}
                  min={0}
                  max={200}
                  defaultValue={10 + voiceIdx * 5}
                  onChange={(v) => setVoiceValue(voiceIdx, 'delay', v)}
                  accentColor={accentColor}
                  size="small"
                  unit="ms"
                />
                <ParameterKnob
                  label="Depth"
                  value={getVoiceValue(voiceIdx, 'depth')}
                  min={0}
                  max={100}
                  defaultValue={25}
                  onChange={(v) => setVoiceValue(voiceIdx, 'depth', v)}
                  accentColor={accentColor}
                  size="small"
                  unit="%"
                />
                <ParameterKnob
                  label="Rate"
                  value={getVoiceValue(voiceIdx, 'rate')}
                  min={0}
                  max={254}
                  defaultValue={40 + voiceIdx * 5}
                  onChange={(v) => setVoiceValue(voiceIdx, 'rate', v)}
                  accentColor={accentColor}
                  size="small"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { IntelliFXCardBase as IntelliFXCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(IntelliFXCardBase, INTELLIFX_URI, INTELLIFX_PARAMS)
