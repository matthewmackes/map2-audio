/**
 * ChorusCard - Custom card for JUCE Stereo Chorus Processor
 *
 * Classic chorus with depth, rate, and centre delay controls.
 * Supports MIDI CC assignment on all parameters.
 */

import { useChorus } from '../../../../hooks/useModulation'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { formatPercentage, formatRate } from '../../utils/formatters'
import { HorizontalGlowGradient } from '../../components/SVGGradients'
import './ChorusCard.css'

// Plugin URI for MIDI mappings
const CHORUS_URI = 'map2://juce/modulation/chorus'

// Parameter indices for MIDI CC assignments
const PARAM = {
  RATE: 0,
  DEPTH: 1,
  CENTRE_DELAY: 2,
  FEEDBACK: 3,
  MIX: 4,
  SPREAD: 5,
} as const

// Parameter definitions for MIDI mapping dialog
const CHORUS_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Rate', symbol: 'rate' },
  { index: 1, name: 'Depth', symbol: 'depth' },
  { index: 2, name: 'Centre Delay', symbol: 'centreDelay' },
  { index: 3, name: 'Feedback', symbol: 'feedback' },
  { index: 4, name: 'Mix', symbol: 'mix' },
  { index: 5, name: 'Stereo Spread', symbol: 'spread' },
]

interface ChorusCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function ChorusCardBase({
  plugin,
  accentColor = '#9b59b6',
  compact = false,
  onOpenMidiMappings,
}: ChorusCardProps) {
  const {
    parameters,
    metering,
    setRate,
    setDepth,
    setCentreDelay,
    setFeedback,
    setMix,
    setSpread,
    setBypass,
    isConnected,
  } = useChorus()

  // LFO visualization
  const lfoVisualization = (
    <div className="chorus-visualization">
      <svg viewBox="0 0 200 60" className="chorus-lfo-wave">
        <defs>
          <HorizontalGlowGradient id="chorusGradient" color={accentColor} />
        </defs>
        {/* Animated sine wave */}
        <path
          d={`M 0 30 ${Array.from({ length: 50 }, (_, i) => {
            const x = i * 4
            const phase = (metering.lfoPhase * Math.PI * 2) + (i * 0.3)
            const y = 30 + Math.sin(phase) * 20 * parameters.depth
            return `L ${x} ${y}`
          }).join(' ')}`}
          fill="none"
          stroke="url(#chorusGradient)"
          strokeWidth="2"
        />
        {/* Centre line */}
        <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
      </svg>
      <div className="chorus-meters">
        <span>Depth: {formatPercentage(parameters.depth, true)}</span>
        <span>Rate: {formatRate(parameters.rate)}</span>
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
      visualization={lfoVisualization}
      compact={compact}
      customHeader={
        <div className="chorus-card-header">
          <span className="chorus-card-title">STEREO CHORUS</span>
        </div>
      }
    >
      {/* Main Controls */}
      <ParameterSection title="Modulation" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={parameters.rate}
            min={0.1}
            max={10}
            defaultValue={1.0}
            unit="Hz"
            onChange={setRate}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.RATE }}
          />
          <ParameterKnob
            label="Depth"
            value={parameters.depth * 100}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setDepth(v / 100)}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.DEPTH }}
          />
          <ParameterKnob
            label="Centre"
            value={parameters.centreDelay}
            min={1}
            max={30}
            defaultValue={7}
            unit="ms"
            onChange={setCentreDelay}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.CENTRE_DELAY }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Output Controls */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Feedback"
            value={parameters.feedback * 100}
            min={-100}
            max={100}
            defaultValue={0}
            unit="%"
            onChange={(v) => setFeedback(v / 100)}
            accentColor={accentColor}
            size="small"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.FEEDBACK }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.mix * 100}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setMix(v / 100)}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.MIX }}
          />
          <ParameterKnob
            label="Spread"
            value={parameters.spread * 100}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={(v) => setSpread(v / 100)}
            accentColor={accentColor}
            size="small"
            midi={{ pluginUri: CHORUS_URI, paramIndex: PARAM.SPREAD }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Preset Quick Buttons */}
      <div className="chorus-presets">
        <button onClick={() => { setRate(1.0); setDepth(0.5); setCentreDelay(7); setFeedback(0); setMix(0.5); }}>
          Classic
        </button>
        <button onClick={() => { setRate(0.3); setDepth(0.8); setCentreDelay(15); setFeedback(0.3); setMix(0.6); }}>
          Slow Wash
        </button>
        <button onClick={() => { setRate(3); setDepth(0.4); setCentreDelay(3); setFeedback(-0.5); setMix(0.7); }}>
          Flanger
        </button>
        <button onClick={() => { setRate(5); setDepth(1.0); setCentreDelay(5); setFeedback(0); setMix(1.0); }}>
          Vibrato
        </button>
      </div>

      {/* Footer */}
      <div className="chorus-footer">
        <span>IN: {metering.inputLevel.toFixed(1)} dB</span>
        <span>OUT: {metering.outputLevel.toFixed(1)} dB</span>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { ChorusCardBase as ChorusCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(ChorusCardBase, CHORUS_URI, CHORUS_PARAMS)
