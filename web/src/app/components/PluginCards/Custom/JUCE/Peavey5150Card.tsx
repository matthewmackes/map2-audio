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
          <radialGradient id="p5150TubeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6622" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#ff4400" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ff4400" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="p5150Meter" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.9" />
            <stop offset="80%" stopColor={accentColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffaa00" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Background panel */}
        <rect x="0" y="0" width="240" height="70" rx="3" fill="#0A0A0A" />
        <rect x="1" y="1" width="238" height="68" rx="2" fill="none" stroke="#333340" strokeWidth="0.5" />

        {/* Tube glow circles (5 preamp tubes) */}
        {[30, 60, 90, 120, 150].map((cx, i) => {
          const intensity = Math.min(1, (parameters.preGain / 10) * (1 + i * 0.15))
          return (
            <g key={i}>
              <circle
                className="tube-glow"
                cx={cx}
                cy="25"
                r={8 + intensity * 3}
                fill="url(#p5150TubeGlow)"
                opacity={0.3 + intensity * 0.5}
              />
              <circle cx={cx} cy="25" r="4" fill="none" stroke="#333340" strokeWidth="0.5" />
              <circle cx={cx} cy="25" r="1.5" fill={`rgba(255, ${100 - i * 10}, 0, ${0.3 + intensity * 0.5})`} />
            </g>
          )
        })}

        {/* Power tubes (2 pairs) */}
        {[185, 210].map((cx, i) => {
          const intensity = Math.min(1, parameters.postGain / 10)
          const biasGlow = parameters.bias / 10
          return (
            <g key={`pt${i}`}>
              <circle
                className="tube-glow"
                cx={cx}
                cy="25"
                r={10 + biasGlow * 4}
                fill="url(#p5150TubeGlow)"
                opacity={0.2 + intensity * 0.4 + biasGlow * 0.2}
              />
              <circle cx={cx} cy="25" r="5.5" fill="none" stroke="#333340" strokeWidth="0.5" />
              <circle cx={cx} cy="25" r="2.5" fill={`rgba(255, ${80 + biasGlow * 40}, 0, ${0.3 + biasGlow * 0.4})`} />
            </g>
          )
        })}

        {/* Labels */}
        <text x="90" y="48" textAnchor="middle" fontSize="7" fill="#808090" fontWeight="600" letterSpacing="1.5">12AX7</text>
        <text x="197" y="48" textAnchor="middle" fontSize="7" fill="#808090" fontWeight="600" letterSpacing="1.5">6L6GC</text>

        {/* Input meter */}
        <rect x="6" y={60 - Math.max(0, (metering.inputLevel + 60) * 0.7)} width="4" height={Math.max(0, (metering.inputLevel + 60) * 0.7)} fill="url(#p5150Meter)" rx="1" />

        {/* Preamp level meter */}
        <rect x="12" y={60 - Math.max(0, (metering.preampLevel + 60) * 0.7)} width="4" height={Math.max(0, (metering.preampLevel + 60) * 0.7)} fill={accentColor} opacity="0.6" rx="1" />

        {/* Output meter */}
        <rect x="230" y={60 - Math.max(0, (metering.outputLevel + 60) * 0.7)} width="4" height={Math.max(0, (metering.outputLevel + 60) * 0.7)} fill="url(#p5150Meter)" rx="1" />

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
