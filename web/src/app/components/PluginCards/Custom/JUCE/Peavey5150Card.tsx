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
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import { TubeGlowGradient, VerticalMeterGradient } from '../../components/SVGGradients'
import { TubeBank } from '../../components/Visualizations/TubeGlowCircle'
import { MeterBar } from '../../components/Visualizations/MeterBar'
import './Peavey5150Card.css'

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

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={ampVisualization}
      compact={compact}
      customHeader={
        <div className="peavey5150-card-header">
          <span className="peavey5150-card-title">PEAVEY</span>
          <span className="peavey5150-card-subtitle">BLOCK LETTER 5150</span>
        </div>
      }
    >
      {/* Preset Selector */}
      <div className="peavey5150-preset-section">
        <select
          className="peavey5150-preset-select"
          value={currentPreset.id}
          onChange={(e) => setPreset(e.target.value)}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        {currentPreset.description && (
          <div className="peavey5150-preset-info">{currentPreset.description}</div>
        )}
      </div>

      {/* PREAMP Section */}
      <ParameterSection title="Preamp" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="PRE"
            value={parameters.preGain}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setPreGain}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.PRE_GAIN }}
          />
          <ParameterKnob
            label="POST"
            value={parameters.postGain}
            min={0}
            max={10}
            defaultValue={3}
            step={0.1}
            onChange={setPostGain}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.POST_GAIN }}
          />
        </ParameterRow>
        <ParameterRow justify="center">
          <button
            className={`peavey5150-bright-btn ${parameters.bright ? 'active' : ''}`}
            onClick={() => setBright(!parameters.bright)}
          >
            BRIGHT
          </button>
        </ParameterRow>
      </ParameterSection>

      {/* TONE Section */}
      <ParameterSection title="Tone" accentColor="#4ecdc4">
        <ParameterRow>
          <ParameterKnob
            label="LOW"
            value={parameters.low}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setLow}
            accentColor="#4ecdc4"
            size="medium"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.LOW }}
          />
          <ParameterKnob
            label="MID"
            value={parameters.mid}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setMid}
            accentColor="#4ecdc4"
            size="medium"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.MID }}
          />
          <ParameterKnob
            label="HIGH"
            value={parameters.high}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setHigh}
            accentColor="#4ecdc4"
            size="medium"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.HIGH }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* POWER Section */}
      <ParameterSection title="Power" accentColor="#ff6b6b">
        <ParameterRow>
          <ParameterKnob
            label="PRES"
            value={parameters.presence}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setPresence}
            accentColor="#ff6b6b"
            size="medium"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.PRESENCE }}
          />
          <ParameterKnob
            label="RES"
            value={parameters.resonance}
            min={0}
            max={10}
            defaultValue={5}
            step={0.1}
            onChange={setResonance}
            accentColor="#ff6b6b"
            size="medium"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.RESONANCE }}
          />
          <ParameterKnob
            label="BIAS"
            value={parameters.bias}
            min={0}
            max={10}
            defaultValue={3}
            step={0.1}
            onChange={setBias}
            valueFormatter={(v: number) => v < 3 ? 'COLD' : v > 7 ? 'HOT' : v.toFixed(1)}
            accentColor="#ff6b6b"
            size="small"
            midi={{ pluginUri: PEAVEY5150_URI, paramIndex: PARAM.BIAS }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Quick Preset Buttons */}
      <div className="peavey5150-quick-presets">
        {PEAVEY5150_PRESETS.slice(1).map((preset) => (
          <button
            key={preset.id}
            onClick={() => setPreset(preset.id)}
            className={currentPreset.id === preset.id ? 'active' : ''}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Footer with metering */}
      <div className="peavey5150-footer">
        <span className="peavey5150-meter">IN: {metering.inputLevel.toFixed(1)}</span>
        <span className="peavey5150-sag">SAG: {(metering.supplySag * 100).toFixed(0)}%</span>
        <span className="peavey5150-meter">OUT: {metering.outputLevel.toFixed(1)}</span>
        <span className="peavey5150-cpu">CPU: {metering.cpuLoad.toFixed(0)}%</span>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { Peavey5150CardBase as Peavey5150Card }

// Export wrapped component with MIDI dialog
export default withMidiDialog(Peavey5150CardBase, PEAVEY5150_URI, PEAVEY5150_PARAMS)
