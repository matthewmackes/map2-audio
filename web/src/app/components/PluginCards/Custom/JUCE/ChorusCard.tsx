/**
 * ChorusCard - Carbon-compliant JUCE Stereo Chorus Processor
 *
 * Uses ModulationCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: rate, depth, centre delay, feedback, mix, spread.
 */

import { useChorus } from '../../../../hooks/useModulation'
import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { HorizontalGlowGradient } from '../../components/SVGGradients'
import { formatPercentage, formatRate } from '../../utils/formatters'

const CHORUS_URI = 'map2://juce/modulation/chorus'

const PARAM = { RATE: 0, DEPTH: 1, CENTRE_DELAY: 2, FEEDBACK: 3, MIX: 4, SPREAD: 5 } as const

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
    parameters, metering,
    setRate, setDepth, setCentreDelay, setFeedback, setMix, setSpread, setBypass,
  } = useChorus()

  const lfoVisualization = (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <svg viewBox="0 0 200 60" style={{ width: '100%', maxWidth: 280, height: 60 }}>
        <defs>
          <HorizontalGlowGradient id="chorusGradient" color={accentColor} />
        </defs>
        <path
          d={`M 0 30 ${Array.from({ length: 50 }, (_, i) => {
            const x = i * 4
            const phase = (metering.lfoPhase * Math.PI * 2) + (i * 0.3)
            const y = 30 + Math.sin(phase) * 20 * parameters.depth
            return `L ${x} ${y}`
          }).join(' ')}`}
          fill="none" stroke="url(#chorusGradient)" strokeWidth="2"
        />
        <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, color: '#a8a8a8' }}>
        <span>Depth: {formatPercentage(parameters.depth, true)}</span>
        <span>Rate: {formatRate(parameters.rate)}</span>
      </div>
    </div>
  )

  return (
    <ModulationCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={lfoVisualization}
      rate={{
        label: 'Rate', value: parameters.rate,
        min: 0.1, max: 10, defaultValue: 1.0, unit: 'Hz',
        onChange: setRate, isLogarithmic: true,
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.RATE },
      }}
      depth={{
        label: 'Depth', value: parameters.depth * 100,
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setDepth(v / 100),
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.DEPTH },
      }}
      centreDelay={{
        label: 'Centre', value: parameters.centreDelay,
        min: 1, max: 30, defaultValue: 7, unit: 'ms',
        onChange: setCentreDelay,
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.CENTRE_DELAY },
      }}
      feedback={{
        label: 'Feedback', value: parameters.feedback * 100,
        min: -100, max: 100, defaultValue: 0, unit: '%',
        onChange: (v) => setFeedback(v / 100),
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.FEEDBACK },
      }}
      spread={{
        label: 'Spread', value: parameters.spread * 100,
        min: 0, max: 100, defaultValue: 100, unit: '%',
        onChange: (v) => setSpread(v / 100),
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.SPREAD },
      }}
      mix={{
        label: 'Mix', value: parameters.mix * 100,
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setMix(v / 100),
        midi: { pluginUri: CHORUS_URI, paramIndex: PARAM.MIX },
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      presets={
        <div className="carbon-preset-row">
          <button className="carbon-preset-btn" onClick={() => { setRate(1.0); setDepth(0.5); setCentreDelay(7); setFeedback(0); setMix(0.5) }}>Classic</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(0.3); setDepth(0.8); setCentreDelay(15); setFeedback(0.3); setMix(0.6) }}>Slow Wash</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(3); setDepth(0.4); setCentreDelay(3); setFeedback(-0.5); setMix(0.7) }}>Flanger</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(5); setDepth(1.0); setCentreDelay(5); setFeedback(0); setMix(1.0) }}>Vibrato</button>
        </div>
      }
    />
  )
}

export { ChorusCardBase as ChorusCard }
export default withMidiDialog(ChorusCardBase, CHORUS_URI, CHORUS_PARAMS)
