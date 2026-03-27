/**
 * IntelliFXCard - Carbon-compliant JUCE IntelliFX 8-Voice Chorus Processor
 *
 * Uses ModulationCategoryLayout for AXE-FX Edit structural parity.
 * Rocktron IntelliFX-style multi-voice chorus with independent control of 8 voices.
 * Each voice has pan, level, delay, depth, and rate parameters.
 * Includes HUSH noise reduction and voice mixing controls.
 * Per-voice controls are in Carbon Accordion advancedSections.
 */

import { useState } from 'react'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { ModulationCategoryLayout, type ParamSlot } from '../../Layouts/ModulationCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { CarbonParameterSection } from '../../Base/CarbonParameterSection'
import { ParameterKnob } from '../../../ParameterControl'
import type { PluginCardProps } from '../../types'

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
  bypass: 49,
}

// Parameter definitions for MIDI mapping dialog
const INTELLIFX_PARAMS: PluginParamDef[] = [
  ...VOICE_PARAMS.flatMap((voice, index) => [
    { index: voice.level, name: `Voice ${index + 1} Level`, symbol: `v${index + 1}_level` },
    { index: voice.pan, name: `Voice ${index + 1} Pan`, symbol: `v${index + 1}_pan` },
    { index: voice.delay, name: `Voice ${index + 1} Delay`, symbol: `v${index + 1}_delay` },
    { index: voice.depth, name: `Voice ${index + 1} Depth`, symbol: `v${index + 1}_depth` },
    { index: voice.rate, name: `Voice ${index + 1} Rate`, symbol: `v${index + 1}_rate` },
  ]),
  { index: GLOBAL_PARAMS.chorus_level, name: 'Chorus Level', symbol: 'chorus_level' },
  { index: GLOBAL_PARAMS.direct_level_l, name: 'Direct Level L', symbol: 'direct_level_l' },
  { index: GLOBAL_PARAMS.direct_level_r, name: 'Direct Level R', symbol: 'direct_level_r' },
  { index: GLOBAL_PARAMS.regen_l, name: 'Regeneration L', symbol: 'regen_l' },
  { index: GLOBAL_PARAMS.regen_r, name: 'Regeneration R', symbol: 'regen_r' },
  { index: GLOBAL_PARAMS.hush_enabled, name: 'HUSH Enabled', symbol: 'hush_enabled' },
  { index: GLOBAL_PARAMS.hush_threshold, name: 'HUSH Threshold', symbol: 'hush_threshold' },
  { index: GLOBAL_PARAMS.hush_release, name: 'HUSH Release', symbol: 'hush_release' },
  { index: GLOBAL_PARAMS.preset, name: 'Preset', symbol: 'preset' },
  { index: GLOBAL_PARAMS.bypass, name: 'Bypass', symbol: 'bypass' },
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
  const [showPresets, setShowPresets] = useState(true)

  const getValue = (index: number, defaultVal: number) =>
    parameterValues[index] ?? defaultVal

  const setValue = (index: number, value: number) =>
    onParameterChange(index, value)

  const getVoiceValue = (voiceIdx: number, param: keyof typeof VOICE_PARAMS[0]) =>
    getValue(VOICE_PARAMS[voiceIdx][param], 0)

  const setVoiceValue = (voiceIdx: number, param: keyof typeof VOICE_PARAMS[0], value: number) =>
    setValue(VOICE_PARAMS[voiceIdx][param], value)

  const presetIdx = Math.round(getValue(GLOBAL_PARAMS.preset, 0))
  const presetName = PRESET_NAMES[presetIdx] || 'Custom'
  const hushEnabled = getValue(GLOBAL_PARAMS.hush_enabled, 1) > 0.5

  // Multi-voice visualization
  const voiceVisualization = (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <svg viewBox="0 0 200 60" style={{ width: '100%', maxWidth: 280, height: 60 }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const level = getVoiceValue(i, 'level')
          const pan = getVoiceValue(i, 'pan')
          const depth = getVoiceValue(i, 'depth')

          const levelNorm = (level + 60) / 72
          const panNorm = (pan + 100) / 200
          const depthNorm = depth / 100
          const cx = 12 + panNorm * 176
          const cy = 30

          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={4 + depthNorm * 6}
                fill={accentColor}
                opacity={Math.max(0.2, levelNorm * 0.7)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={2}
                fill={accentColor}
                opacity={1}
              />
            </g>
          )
        })}
        <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, color: '#a8a8a8' }}>
        <span>Chorus: {getValue(GLOBAL_PARAMS.chorus_level, 0).toFixed(0)}dB</span>
        <span>Direct: {getValue(GLOBAL_PARAMS.direct_level_l, 0).toFixed(0)}dB</span>
        <span>Regen: {getValue(GLOBAL_PARAMS.regen_l, 30).toFixed(0)}%</span>
      </div>
    </div>
  )

  // Preset browser as ReactNode for presets prop
  const presetBrowser = showPresets ? (
    <div style={{ padding: '0 12px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: accentColor, fontSize: 11, fontWeight: 600 }}>Presets</span>
        <button
          onClick={() => setShowPresets(false)}
          style={{ background: 'none', border: 'none', color: '#a8a8a8', cursor: 'pointer', fontSize: 12 }}
        >
          x
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESET_NAMES.map((name, idx) => (
          <button
            key={idx}
            onClick={() => {
              setValue(GLOBAL_PARAMS.preset, idx)
              setShowPresets(false)
            }}
            className={`carbon-preset-btn ${presetIdx === idx ? 'active' : ''}`}
            style={presetIdx === idx ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <div style={{ padding: '0 12px 4px' }}>
      <button
        className="carbon-preset-btn"
        onClick={() => setShowPresets(true)}
        style={{ borderColor: accentColor, color: accentColor }}
      >
        {presetName} &#x25BC;
      </button>
    </div>
  )

  // Master mixer as extraContent (above the accordion voices)
  const masterMixer = (
    <>
      <CarbonParameterSection title="Master" accentColor={accentColor}>
        <div className="carbon-param-row">
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.chorus_level }}
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.direct_level_l }}
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.direct_level_r }}
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.regen_l }}
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.regen_r }}
          />
        </div>
      </CarbonParameterSection>

      <CarbonParameterSection title="HUSH" accentColor={accentColor}>
        <div className="carbon-param-row">
          <button
            className={`carbon-toggle-btn ${hushEnabled ? 'active' : ''}`}
            onClick={() => setValue(GLOBAL_PARAMS.hush_enabled, hushEnabled ? 0 : 1)}
            style={hushEnabled ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            HUSH
          </button>
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.hush_threshold }}
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
            midi={{ pluginUri: INTELLIFX_URI, paramIndex: GLOBAL_PARAMS.hush_release }}
          />
        </div>
      </CarbonParameterSection>
    </>
  )

  // Build 8-voice advanced sections for Carbon Accordion
  const voiceSections: AdvancedSection[] = Array.from({ length: 8 }, (_, voiceIdx) => ({
    id: `voice-${voiceIdx + 1}`,
    title: `Voice ${voiceIdx + 1} — ${getVoiceValue(voiceIdx, 'level').toFixed(0)}dB @ ${getVoiceValue(voiceIdx, 'pan').toFixed(0)}%`,
    defaultOpen: voiceIdx === 0,
    children: (
      <div className="carbon-param-row">
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
          midi={{ pluginUri: INTELLIFX_URI, paramIndex: VOICE_PARAMS[voiceIdx].level }}
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
          midi={{ pluginUri: INTELLIFX_URI, paramIndex: VOICE_PARAMS[voiceIdx].pan }}
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
          midi={{ pluginUri: INTELLIFX_URI, paramIndex: VOICE_PARAMS[voiceIdx].delay }}
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
          midi={{ pluginUri: INTELLIFX_URI, paramIndex: VOICE_PARAMS[voiceIdx].depth }}
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
          midi={{ pluginUri: INTELLIFX_URI, paramIndex: VOICE_PARAMS[voiceIdx].rate }}
        />
      </div>
    ),
  }))

  return (
    <ModulationCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={getValue(GLOBAL_PARAMS.bypass, 0) > 0.5}
      onBypassToggle={(bypassed) => setValue(GLOBAL_PARAMS.bypass, bypassed ? 1 : 0)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={voiceVisualization}
      advancedSections={voiceSections}
      presets={presetBrowser}
      extraContent={masterMixer}
      cardWidth={800}
    />
  )
}

// Export base component for testing
export { IntelliFXCardBase as IntelliFXCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(IntelliFXCardBase, INTELLIFX_URI, INTELLIFX_PARAMS)
