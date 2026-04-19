/**
 * Peavey5150Card - Block Letter 5150 Tube Amplifier Simulator
 *
 * Dark chassis aesthetic with blue LED accents.
 * 6-stage preamp, cold clipper, Yeh/Smith tone stack,
 * push-pull 6L6GC power amp with supply sag.
 *
 * Parameters:
 * - preGain: 0-10 (preamp drive)
 * - postGain: 0-10 (master volume)
 * - low/mid/high: 0-10 (tone stack)
 * - presence/resonance: 0-10 (power amp NFB)
 * - bright: boolean (treble bypass cap)
 * - bias: 0-10 (power tube bias)
 */

import { usePeavey5150, PEAVEY5150_PRESETS } from '../../../../hooks/usePeavey5150'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { AmplifierCategoryLayout, type ParamSlot } from '../../Layouts/AmplifierCategoryLayout'
import type { PluginCardProps } from '../../types'
import { TubeGlowGradient, VerticalMeterGradient } from '../../components/SVGGradients'
import { TubeBank } from '../../components/Visualizations/TubeGlowCircle'
import { MeterBar } from '../../components/Visualizations/MeterBar'

// Plugin URI for MIDI mappings
const PEAVEY5150_URI = 'map2://juce/amp/peavey5150'

// Accent color: 5150 blue LED
const ACCENT = '#00A0FF'
const ACCENT_DIM = '#0066AA'

// Parameter indices (must match juce_processors.json order)
const PARAM = {
  PRE_GAIN: 0,
  POST_GAIN: 1,
  LOW: 2,
  MID: 3,
  HIGH: 4,
  PRESENCE: 5,
  RESONANCE: 6,
  BRIGHT: 7,
  BIAS: 8,
  BYPASS: 9,
}

// Parameter definitions for MIDI mapping dialog
const PEAVEY5150_PARAMS: PluginParamDef[] = [
  { index: PARAM.PRE_GAIN, name: 'Pre Gain', symbol: 'preGain' },
  { index: PARAM.POST_GAIN, name: 'Post Gain', symbol: 'postGain' },
  { index: PARAM.LOW, name: 'Low', symbol: 'low' },
  { index: PARAM.MID, name: 'Mid', symbol: 'mid' },
  { index: PARAM.HIGH, name: 'High', symbol: 'high' },
  { index: PARAM.PRESENCE, name: 'Presence', symbol: 'presence' },
  { index: PARAM.RESONANCE, name: 'Resonance', symbol: 'resonance' },
  { index: PARAM.BIAS, name: 'Bias', symbol: 'bias' },
]

interface Peavey5150CardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function Peavey5150CardBase({
  plugin,
  accentColor = ACCENT,
  compact = false,
  onOpenMidiMappings,
}: Peavey5150CardProps) {
  const {
    parameters,
    metering,
    presets,
    currentPreset,
    setPreGain,
    setPostGain,
    setLow,
    setMid,
    setHigh,
    setPresence,
    setResonance,
    setBright,
    setBias,
    setBypass,
    setPreset,
    isConnected,
  } = usePeavey5150()

  // Visualization: tube amp face with gain staging meters & tube glow
  const ampVisualization = (
    <div className="peavey5150-visualization">
      <svg viewBox="0 0 240 70" className="peavey5150-visual-svg">
        <defs>
          <TubeGlowGradient id="p5150TubeGlow" color="#ff6622" />
          <VerticalMeterGradient id="p5150Meter" color={accentColor} />
        </defs>

        {/* Background panel */}
        <rect x="0" y="0" width="240" height="70" rx="3" fill="#0A0A0A" />
        <rect x="1" y="1" width="238" height="68" rx="2" fill="none" stroke="#333340" strokeWidth="0.5" />

        {/* Preamp tubes (5 tubes) - using shared TubeBank component */}
        <TubeBank
          positions={[30, 60, 90, 120, 150]}
          cy={25}
          intensities={[30, 60, 90, 120, 150].map((_, i) =>
            Math.min(1, (parameters.preGain / 10) * (1 + i * 0.15))
          )}
          baseRadius={7}
          tubeType="preamp"
          glowGradientId="p5150TubeGlow"
          color="#ff6622"
          className="tube-glow"
        />

        {/* Power tubes (2 tubes) */}
        <TubeBank
          positions={[185, 210]}
          cy={25}
          intensities={[185, 210].map(() => {
            const intensity = Math.min(1, parameters.postGain / 10)
            const biasGlow = parameters.bias / 10
            return intensity + biasGlow * 0.3
          })}
          baseRadius={9}
          tubeType="power"
          glowGradientId="p5150TubeGlow"
          color="#ff6622"
          className="tube-glow"
        />

        {/* Labels */}
        <text x="90" y="48" textAnchor="middle" fontSize="7" fill="#808090" fontWeight="600" letterSpacing="1.5">12AX7</text>
        <text x="197" y="48" textAnchor="middle" fontSize="7" fill="#808090" fontWeight="600" letterSpacing="1.5">6L6GC</text>

        {/* Input meter - using shared MeterBar */}
        <MeterBar level={metering.inputLevel} x={6} y={0} width={4} height={60} color={accentColor} />

        {/* Preamp level meter */}
        <MeterBar level={metering.preampLevel} x={12} y={0} width={4} height={60} color={accentColor} />

        {/* Output meter */}
        <MeterBar level={metering.outputLevel} x={230} y={0} width={4} height={60} color={accentColor} showClipping />

        {/* Supply sag indicator */}
        <rect x="170" y="55" width={40 * metering.supplySag} height="3" fill={accentColor} opacity="0.4" rx="1" />
        <text x="170" y="64" fontSize="5" fill="#808090">SAG</text>
      </svg>

      <div className="peavey5150-visual-labels">
        <span>IN</span>
        <span>PREAMP</span>
        <span>POWER</span>
        <span>OUT</span>
      </div>
    </div>
  )

  // Map parameters to AmplifierCategoryLayout slots
  const inputGainSlot: ParamSlot = {
    label: 'PRE',
    value: parameters.preGain,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setPreGain,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.PRE_GAIN },
  }

  const bassSlot: ParamSlot = {
    label: 'LOW',
    value: parameters.low,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setLow,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.LOW },
  }

  const midSlot: ParamSlot = {
    label: 'MID',
    value: parameters.mid,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setMid,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.MID },
  }

  const trebleSlot: ParamSlot = {
    label: 'HIGH',
    value: parameters.high,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setHigh,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.HIGH },
  }

  const presenceSlot: ParamSlot = {
    label: 'PRES',
    value: parameters.presence,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setPresence,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.PRESENCE },
  }

  const resonanceSlot: ParamSlot = {
    label: 'RES',
    value: parameters.resonance,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setResonance,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.RESONANCE },
  }

  const biasSlot: ParamSlot = {
    label: 'BIAS',
    value: parameters.bias,
    min: 0,
    max: 10,
    defaultValue: 3,
    step: 0.1,
    onChange: setBias,
    valueFormatter: (v: number) => v < 3 ? 'COLD' : v > 7 ? 'HOT' : v.toFixed(1),
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.BIAS },
  }

  const masterVolumeSlot: ParamSlot = {
    label: 'POST',
    value: parameters.postGain,
    min: 0,
    max: 10,
    defaultValue: 3,
    step: 0.1,
    onChange: setPostGain,
    midi: { pluginUri: PEAVEY5150_URI, paramIndex: PARAM.POST_GAIN },
  }

  const brightProp = {
    enabled: parameters.bright,
    onToggle: () => setBright(!parameters.bright),
  }

  // Presets as ReactNode
  const presetsNode = (
    <>
      <div className="carbon-preset-row">
        <select
          className="carbon-select"
          value={currentPreset.id}
          onChange={(e) => setPreset(e.target.value)}
          style={{ width: '100%' }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>
      {currentPreset.description && (
        <div style={{ fontSize: '11px', color: '#888', padding: '0 8px 4px', fontStyle: 'italic' }}>
          {currentPreset.description}
        </div>
      )}
      <div className="carbon-preset-row">
        {PEAVEY5150_PRESETS.slice(1).map((preset) => (
          <button
            key={preset.id}
            className={`carbon-preset-btn ${currentPreset.id === preset.id ? 'active' : ''}`}
            onClick={() => setPreset(preset.id)}
            style={currentPreset.id === preset.id ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </>
  )

  // Footer with sag/CPU info as extra content
  const extraContent = (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: '10px', color: '#888' }}>
      <span>SAG: {(metering.supplySag * 100).toFixed(0)}%</span>
      <span>CPU: {metering.cpuLoad.toFixed(0)}%</span>
    </div>
  )

  return (
    <AmplifierCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={ampVisualization}
      inputGain={inputGainSlot}
      bright={brightProp}
      bass={bassSlot}
      mid={midSlot}
      treble={trebleSlot}
      presence={presenceSlot}
      resonance={resonanceSlot}
      bias={biasSlot}
      masterVolume={masterVolumeSlot}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      presets={presetsNode}
      extraContent={extraContent}
    />
  )
}

// Export base component for testing
export { Peavey5150CardBase as Peavey5150Card }

// Export wrapped component with MIDI dialog
export default withMidiDialog(Peavey5150CardBase, PEAVEY5150_URI, PEAVEY5150_PARAMS)
