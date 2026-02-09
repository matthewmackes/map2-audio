/**
 * ShoeGazeCard - Wall of sound multi-effect processor
 *
 * Inspired by Eventide, Strymon, and Meris pedals.
 * Captures the aesthetic of My Bloody Valentine, Slowdive, and Cocteau Twins.
 */

import { useShoeGaze, SHOEGAZE_PRESETS } from '../../../../hooks/useShoeGaze'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import { formatSemitones } from '../../utils/formatters'
import { dbToVerticalBar } from '../../utils/metering'
import { ReverbTailGradient, ShimmerGradient } from '../../components/SVGGradients'
import './ShoeGazeCard.css'

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
  DUCKING: 14,
  PRESET: 15,
  BYPASS: 16,
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
  { index: PARAM.DUCKING, name: 'Ducking', symbol: 'duckingAmount' },
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
    setDuckingAmount,
    setBypass,
    setPreset,
    isConnected,
  } = useShoeGaze()

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

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={dreamyVisualization}
      compact={compact}
      customHeader={
        <div className="shoegaze-card-header">
          <span className="shoegaze-card-title">SHOEGAZE</span>
          <span className="shoegaze-card-subtitle">Multi-Effect</span>
        </div>
      }
    >
      {/* Preset Selector */}
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

      {/* Main Controls - Atmosphere & Character */}
      <ParameterSection title="Atmosphere" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Atmos"
            value={parameters.atmosphere}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setAtmosphere}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.ATMOSPHERE }}
          />
          <ParameterKnob
            label="Decay"
            value={parameters.decay}
            min={0.5}
            max={30}
            defaultValue={4}
            unit="s"
            onChange={setDecay}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DECAY }}
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
            size="large"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Shimmer Section */}
      <ParameterSection title="Shimmer" accentColor="#9b59b6">
        <ParameterRow>
          <ParameterKnob
            label="Amount"
            value={parameters.shimmer}
            min={0}
            max={100}
            defaultValue={25}
            unit="%"
            onChange={setShimmer}
            accentColor="#9b59b6"
            size="medium"
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
            size="medium"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.SHIMMER_PITCH }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Modulation Section */}
      <ParameterSection title="Modulation" accentColor="#3498db">
        <ParameterRow>
          <ParameterKnob
            label="Depth"
            value={parameters.modulation}
            min={0}
            max={100}
            defaultValue={35}
            unit="%"
            onChange={setModulation}
            accentColor="#3498db"
            size="medium"
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
            size="medium"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.MOD_RATE }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Delay Section */}
      <ParameterSection title="Delay" accentColor="#1abc9c">
        <ParameterRow>
          <ParameterKnob
            label="Time"
            value={parameters.delayTime}
            min={0}
            max={1000}
            defaultValue={200}
            unit="ms"
            onChange={setDelayTime}
            accentColor="#1abc9c"
            size="small"
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
        </ParameterRow>
      </ParameterSection>

      {/* Tone Section */}
      <ParameterSection title="Tone" accentColor="#e67e22">
        <ParameterRow>
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
            valueFormatter={(v: number) => v >= 10000 ? (v/1000).toFixed(0) + 'k' : (v/1000).toFixed(1) + 'k'}
            onChange={setHighCut}
            isLogarithmic
            accentColor="#e67e22"
            size="small"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.HIGH_CUT }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Output Section */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
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
            value={parameters.duckingAmount}
            min={0}
            max={100}
            defaultValue={20}
            unit="%"
            onChange={setDuckingAmount}
            accentColor={accentColor}
            size="small"
            midi={{ pluginUri: SHOEGAZE_URI, paramIndex: PARAM.DUCKING }}
          />
        </ParameterRow>
      </ParameterSection>

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
    </PluginCardShell>
  )
}

// Export base component for testing
export { ShoeGazeCardBase as ShoeGazeCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(ShoeGazeCardBase, SHOEGAZE_URI, SHOEGAZE_PARAMS)
