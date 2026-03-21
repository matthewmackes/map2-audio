/**
 * ShoeGazeCard - Wall of sound multi-effect processor
 *
 * Inspired by boutique ambient and shimmer pedals.
 * Captures the aesthetic of My Bloody Valentine, Slowdive, and Cocteau Twins.
 */

import { useShoeGaze, SHOEGAZE_PRESETS } from '../../../../hooks/useShoeGaze'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { MultiEffectCategoryLayout, type ParamSlot } from '../../Layouts/MultiEffectCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { CarbonParameterSection } from '../../Base/CarbonParameterSection'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import { formatSemitones } from '../../utils/formatters'


// Plugin URI for MIDI mappings
const SHOEGAZE_URI = 'map2://juce/multieffect/shoegaze'

// Parameter indices (must match juce_processors.json order)
const PARAM = {
  ATMOSPHERE: 0,
  DECAY: 1,
  SHIMMER: 2,
  SHIMMER_PITCH: 3,
  MODULATION: 4,
  MOD_RATE: 5,
  DRIVE: 6,
  DELAY_TIME: 7,
  DELAY_FEEDBACK: 8,
  DELAY_MOD: 9,
  LOW_CUT: 10,
  HIGH_CUT: 11,
  MIX: 12,
  STEREO_WIDTH: 13,
  REVERB_DIFFUSION: 14,
  REVERB_DAMPING: 15,
  SHIMMER_FEEDBACK: 16,
  CHORUS_VOICES: 17,
  DUCKING: 18,
  SPILLOVER: 19,
  BYPASS: 20,
}

// Parameter definitions for MIDI mapping dialog
const SHOEGAZE_PARAMS: PluginParamDef[] = [
  { index: PARAM.ATMOSPHERE, name: 'Atmosphere', symbol: 'atmosphere' },
  { index: PARAM.DECAY, name: 'Decay', symbol: 'decay' },
  { index: PARAM.SHIMMER, name: 'Shimmer', symbol: 'shimmer' },
  { index: PARAM.SHIMMER_PITCH, name: 'Shimmer Pitch', symbol: 'shimmerPitch' },
  { index: PARAM.MODULATION, name: 'Modulation', symbol: 'modulation' },
  { index: PARAM.MOD_RATE, name: 'Mod Rate', symbol: 'modRate' },
  { index: PARAM.DRIVE, name: 'Drive', symbol: 'drive' },
  { index: PARAM.DELAY_TIME, name: 'Delay Time', symbol: 'delayTime' },
  { index: PARAM.DELAY_FEEDBACK, name: 'Delay Feedback', symbol: 'delayFeedback' },
  { index: PARAM.DELAY_MOD, name: 'Delay Mod', symbol: 'delayMod' },
  { index: PARAM.LOW_CUT, name: 'Low Cut', symbol: 'lowCut' },
  { index: PARAM.HIGH_CUT, name: 'High Cut', symbol: 'highCut' },
  { index: PARAM.MIX, name: 'Mix', symbol: 'mix' },
  { index: PARAM.STEREO_WIDTH, name: 'Stereo Width', symbol: 'stereoWidth' },
  { index: PARAM.REVERB_DIFFUSION, name: 'Reverb Diffusion', symbol: 'reverbDiffusion' },
  { index: PARAM.REVERB_DAMPING, name: 'Reverb Damping', symbol: 'reverbDamping' },
  { index: PARAM.SHIMMER_FEEDBACK, name: 'Shimmer Feedback', symbol: 'shimmerFeedback' },
  { index: PARAM.CHORUS_VOICES, name: 'Chorus Voices', symbol: 'chorusVoices' },
  { index: PARAM.DUCKING, name: 'Ducking', symbol: 'ducking' },
  { index: PARAM.SPILLOVER, name: 'Spillover', symbol: 'spillover' },
]

interface ShoeGazeCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function ShoeGazeCardBase({
  plugin,
  accentColor = '#8e44ad', // Dreamy purple
  compact = false,
  onOpenMidiMappings,
}: ShoeGazeCardProps) {
  const {
    parameters,
    metering,
    presets,
    currentPreset,
    setAtmosphere,
    setDecay,
    setShimmer,
    setShimmerPitch,
    setModulation,
    setModRate,
    setDrive,
    setDelayTime,
    setDelayFeedback,
    setDelayMod,
    setLowCut,
    setHighCut,
    setMix,
    setStereoWidth,
    setReverbDiffusion,
    setReverbDamping,
    setShimmerFeedback,
    setChorusVoices,
    setDucking,
    setSpillover,
    setDuckingAmount,
    setBypass,
    setPreset,
    isConnected,
  } = useShoeGaze()

  // Primary controls as ParamSlot objects
  const atmosphereSlot: ParamSlot = {
    label: 'Atmos',
    value: parameters.atmosphere,
    min: 0,
    max: 100,
    defaultValue: 50,
    unit: '%',
    onChange: setAtmosphere,
    midi: { pluginUri: SHOEGAZE_URI, paramIndex: PARAM.ATMOSPHERE },
  }

  const decaySlot: ParamSlot = {
    label: 'Decay',
    value: parameters.decay,
    min: 0.5,
    max: 30,
    defaultValue: 4,
    unit: 's',
    onChange: setDecay,
    isLogarithmic: true,
    midi: { pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DECAY },
  }

  const mixSlot: ParamSlot = {
    label: 'Mix',
    value: parameters.mix,
    min: 0,
    max: 100,
    defaultValue: 50,
    unit: '%',
    onChange: setMix,
    midi: { pluginUri: SHOEGAZE_URI, paramIndex: PARAM.MIX },
  }

  // Dreamy visualization with shimmer particles and reverb waves
  const dreamyVisualization = (
    <div className="shoegaze-visualization">
      <svg viewBox="0 0 200 80" className="shoegaze-visual-svg">
        <defs>
          {/* Gradient for reverb tail */}
          <linearGradient id="shoegazeReverb" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
          {/* Shimmer sparkle gradient */}
          <radialGradient id="shoegazeShimmer" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </radialGradient>
          {/* Glow filter */}
          <filter id="shoegazeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background haze */}
        <rect x="0" y="0" width="200" height="80" fill="rgba(0,0,0,0.4)" rx="4" />

        {/* Reverb level bar */}
        <rect
          x="5"
          y={70 - Math.max(0, (metering.reverbLevel + 60) * 0.8)}
          width="8"
          height={Math.max(0, (metering.reverbLevel + 60) * 0.8)}
          fill="url(#shoegazeReverb)"
          opacity="0.7"
        />

        {/* Modulation sine wave */}
        <path
          d={`M 20 40 ${Array.from({ length: 40 }, (_, i) => {
            const x = 20 + i * 4.5
            const phase = (metering.lfoPhase * Math.PI * 2) + (i * 0.15)
            const y = 40 + Math.sin(phase) * 15 * (parameters.modulation / 100)
            return `L ${x} ${y}`
          }).join(' ')}`}
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
          opacity="0.6"
        />

        {/* Shimmer particles */}
        {Array.from({ length: 8 }, (_, i) => {
          const shimmerLevel = (metering.shimmerLevel + 60) / 60
          const activity = Math.max(0, shimmerLevel) * (parameters.shimmer / 100)
          const x = 30 + ((i * 23 + metering.grainActivity * 100) % 160)
          const y = 15 + ((i * 17 + metering.grainActivity * 50) % 50)
          const size = 2 + activity * 4
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={size}
              fill="url(#shoegazeShimmer)"
              opacity={activity * 0.8}
              filter="url(#shoegazeGlow)"
            />
          )
        })}

        {/* Stereo field indicator */}
        <line
          x1={100 - parameters.stereoWidth * 0.4}
          y1="75"
          x2={100 + parameters.stereoWidth * 0.4}
          y2="75"
          stroke={accentColor}
          strokeWidth="2"
          opacity="0.5"
        />
        <circle cx={100 - parameters.stereoWidth * 0.4} cy="75" r="2" fill={accentColor} opacity="0.8" />
        <circle cx={100 + parameters.stereoWidth * 0.4} cy="75" r="2" fill={accentColor} opacity="0.8" />

        {/* Input/output level bars */}
        <rect x="190" y={70 - Math.max(0, (metering.inputLevel + 60) * 0.8)} width="3" height={Math.max(0, (metering.inputLevel + 60) * 0.8)} fill="#4ecdc4" opacity="0.7" />
        <rect x="195" y={70 - Math.max(0, (metering.outputLevel + 60) * 0.8)} width="3" height={Math.max(0, (metering.outputLevel + 60) * 0.8)} fill={accentColor} opacity="0.9" />
      </svg>

      {/* Visual labels */}
      <div className="shoegaze-visual-labels">
        <span>REVERB</span>
        <span>SHIMMER × {parameters.shimmer.toFixed(0)}%</span>
        <span>I/O</span>
      </div>
    </div>
  )

  // Preset selector
  const presetSelector = (
    <div className="shoegaze-preset-section">
      <select
        className="shoegaze-preset-select"
        value={currentPreset.id}
        onChange={(e) => setPreset(e.target.value)}
        style={{ borderColor: accentColor }}
      >
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} {preset.artist ? `- ${preset.artist}` : ''}
          </option>
        ))}
      </select>
      {currentPreset.description && (
        <div className="shoegaze-preset-info">{currentPreset.description}</div>
      )}
    </div>
  )

  // Advanced sections for per-module controls
  const advancedSections: AdvancedSection[] = [
    {
      id: 'shimmer',
      title: 'Shimmer',
      defaultOpen: true,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Amount"
            value={parameters.shimmer}
            min={0}
            max={100}
            defaultValue={25}
            unit="%"
            onChange={setShimmer}
            accentColor="#9b59b6"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.SHIMMER }}
          />
          <ParameterKnob
            label="Pitch"
            value={parameters.shimmerPitch}
            min={-12}
            max={24}
            defaultValue={12}
            unit=""
            valueFormatter={(v: number) => formatSemitones(Math.round(v))}
            onChange={(v) => setShimmerPitch(Math.round(v))}
            accentColor="#9b59b6"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.SHIMMER_PITCH }}
          />
          <ParameterKnob
            label="Feedback"
            value={parameters.shimmerFeedback}
            min={0}
            max={80}
            defaultValue={35}
            unit="%"
            onChange={setShimmerFeedback}
            accentColor="#9b59b6"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.SHIMMER_FEEDBACK }}
          />
        </div>
      ),
    },
    {
      id: 'modulation',
      title: 'Modulation',
      defaultOpen: false,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Depth"
            value={parameters.modulation}
            min={0}
            max={100}
            defaultValue={35}
            unit="%"
            onChange={setModulation}
            accentColor="#3498db"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.MODULATION }}
          />
          <ParameterKnob
            label="Rate"
            value={parameters.modRate}
            min={0.1}
            max={5}
            defaultValue={0.7}
            unit="Hz"
            onChange={setModRate}
            isLogarithmic
            accentColor="#3498db"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.MOD_RATE }}
          />
          <ParameterKnob
            label="Voices"
            value={parameters.chorusVoices}
            min={1}
            max={6}
            defaultValue={4}
            unit=""
            step={1}
            onChange={(value) => setChorusVoices(Math.round(value))}
            accentColor="#3498db"
            size={compact ? 'small' : 'medium'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.CHORUS_VOICES }}
          />
        </div>
      ),
    },
    {
      id: 'delay',
      title: 'Delay',
      defaultOpen: false,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Time"
            value={parameters.delayTime}
            min={0}
            max={1000}
            defaultValue={200}
            unit="ms"
            onChange={setDelayTime}
            accentColor="#1abc9c"
            size={compact ? 'small' : 'small'}
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DELAY_TIME }}
          />
          <ParameterKnob
            label="Feedback"
            value={parameters.delayFeedback}
            min={0}
            max={90}
            defaultValue={30}
            unit="%"
            onChange={setDelayFeedback}
            accentColor="#1abc9c"
            size="small"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DELAY_FEEDBACK }}
          />
          <ParameterKnob
            label="Mod"
            value={parameters.delayMod}
            min={0}
            max={100}
            defaultValue={20}
            unit="%"
            onChange={setDelayMod}
            accentColor="#1abc9c"
            size="small"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DELAY_MOD }}
          />
        </div>
      ),
    },
    {
      id: 'tone',
      title: 'Tone',
      defaultOpen: false,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Drive"
              value={parameters.drive}
              min={0}
              max={100}
              defaultValue={15}
              unit="%"
              onChange={setDrive}
              accentColor="#e67e22"
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DRIVE }}
            />
            <ParameterKnob
              label="Lo Cut"
              value={parameters.lowCut}
              min={20}
              max={500}
              defaultValue={80}
              unit="Hz"
              onChange={setLowCut}
              isLogarithmic
              accentColor="#e67e22"
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.LOW_CUT }}
            />
            <ParameterKnob
              label="Hi Cut"
              value={parameters.highCut}
              min={2000}
              max={20000}
              defaultValue={8000}
              unit=""
              valueFormatter={(v: number) => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : (v / 1000).toFixed(1) + 'k'}
              onChange={setHighCut}
              isLogarithmic
              accentColor="#e67e22"
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.HIGH_CUT }}
            />
          </div>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Diffuse"
              value={parameters.reverbDiffusion}
              min={0}
              max={100}
              defaultValue={85}
              unit="%"
              onChange={setReverbDiffusion}
              accentColor="#e67e22"
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.REVERB_DIFFUSION }}
            />
            <ParameterKnob
              label="Damping"
              value={parameters.reverbDamping}
              min={0}
              max={100}
              defaultValue={40}
              unit="%"
              onChange={setReverbDamping}
              accentColor="#e67e22"
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.REVERB_DAMPING }}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'output',
      title: 'Output',
      defaultOpen: false,
      children: (
        <>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Width"
              value={parameters.stereoWidth}
              min={0}
              max={200}
              defaultValue={150}
              unit="%"
              onChange={setStereoWidth}
              accentColor={accentColor}
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.STEREO_WIDTH }}
            />
            <ParameterKnob
              label="Duck"
              value={parameters.ducking}
              min={0}
              max={100}
              defaultValue={20}
              unit="%"
              onChange={setDucking}
              accentColor={accentColor}
              size="small"
              midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DUCKING }}
            />
          </div>
          <div className="carbon-param-row" style={{ marginTop: 8 }}>
            <button
              className={`carbon-toggle-btn ${parameters.spillover ? 'active' : ''}`}
              onClick={() => setSpillover(!parameters.spillover)}
              style={parameters.spillover ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              Spillover
            </button>
          </div>
        </>
      ),
    },
  ]

  // Extra content: quick presets + footer
  const extraContent = (
    <>
      {/* Quick Preset Buttons */}
      <div className="shoegaze-quick-presets">
        {SHOEGAZE_PRESETS.slice(1, 5).map((preset) => (
          <button
            key={preset.id}
            onClick={() => setPreset(preset.id)}
            className={currentPreset.id === preset.id ? 'active' : ''}
            style={{
              '--preset-color': accentColor,
              borderColor: currentPreset.id === preset.id ? accentColor : undefined
            } as React.CSSProperties}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Footer with metering */}
      <div className="shoegaze-footer">
        <span className="shoegaze-meter">IN: {metering.inputLevel.toFixed(1)} dB</span>
        <span className="shoegaze-meter">OUT: {metering.outputLevel.toFixed(1)} dB</span>
        <span className="shoegaze-cpu">CPU: {metering.cpuLoad.toFixed(0)}%</span>
      </div>
    </>
  )

  return (
    <MultiEffectCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={dreamyVisualization}
      inputGain={atmosphereSlot}
      outputGain={decaySlot}
      mix={mixSlot}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      advancedSections={advancedSections}
      presets={presetSelector}
      extraContent={extraContent}
      cardWidth={760}
    />
  )
}

// Export base component for testing
export { ShoeGazeCardBase as ShoeGazeCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(ShoeGazeCardBase, SHOEGAZE_URI, SHOEGAZE_PARAMS)
