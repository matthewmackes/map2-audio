/**
 * PhaserCard - Carbon-compliant JUCE 6-Stage Phaser Processor
 *
 * Uses ModulationCategoryLayout for AXE-FX Edit structural parity.
 * Classic phaser with sweeping notch filters.
 */

import { usePhaser } from '../../../../hooks/useModulation'
import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { formatPercentage, formatRate } from '../../utils/formatters'

// Plugin URI for MIDI mappings
const PHASER_URI = 'map2://juce/modulation/phaser'

const PARAM = { RATE: 0, DEPTH: 1, CENTRE_FREQ: 2, FEEDBACK: 3, MIX: 4 } as const

// Parameter definitions for MIDI mapping dialog
const PHASER_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Rate', symbol: 'rate' },
  { index: 1, name: 'Depth', symbol: 'depth' },
  { index: 2, name: 'Centre Frequency', symbol: 'centreFrequency' },
  { index: 3, name: 'Feedback', symbol: 'feedback' },
  { index: 4, name: 'Mix', symbol: 'mix' },
]

interface PhaserCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function PhaserCardBase({
  plugin,
  pluginPosition,
  accentColor = '#e74c3c',
  compact = false,
  onOpenMidiMappings,
}: PhaserCardProps) {
  const {
    parameters,
    metering,
    setRate,
    setDepth,
    setCentreFrequency,
    setFeedback,
    setMix,
    setBypass,
  } = usePhaser({
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
  })

  // Phaser notch visualization
  const phaserVisualization = (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <svg viewBox="0 0 200 60" style={{ width: '100%', maxWidth: 280, height: 60 }}>
        <defs>
          <linearGradient id="phaserGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Background frequency curve */}
        <path
          d="M 0 50 L 200 50"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {/* Animated notches (6 stages) */}
        {Array.from({ length: 6 }, (_, i) => {
          const baseX = 20 + i * 30
          const sweep = Math.sin((metering.lfoPhase * Math.PI * 2) + (i * 0.5)) * 15 * parameters.depth
          const x = baseX + sweep
          const depth = 20 + (i * 3)
          return (
            <g key={i}>
              <path
                d={`M ${x - 8} 50 Q ${x} ${50 - depth} ${x + 8} 50`}
                fill="none"
                stroke={accentColor}
                strokeWidth="2"
                opacity={0.3 + (i * 0.1)}
              />
              <circle
                cx={x}
                cy={50 - depth}
                r="3"
                fill={accentColor}
                opacity={0.5}
              />
            </g>
          )
        })}

        {/* Centre frequency marker */}
        <line
          x1={100}
          y1="5"
          x2={100}
          y2="55"
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="2 2"
        />
        <text x="100" y="8" fill="rgba(255,255,255,0.5)" fontSize="8" textAnchor="middle">
          {parameters.centreFrequency >= 1000
            ? `${(parameters.centreFrequency / 1000).toFixed(1)}kHz`
            : `${parameters.centreFrequency.toFixed(0)}Hz`
          }
        </text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, color: '#a8a8a8' }}>
        <span>6-Stage All-Pass</span>
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
      visualization={phaserVisualization}
      rate={{
        label: 'Rate', value: parameters.rate,
        min: 0.05, max: 5, defaultValue: 0.5, unit: 'Hz',
        onChange: setRate, isLogarithmic: true,
        midi: { pluginUri: PHASER_URI, paramIndex: PARAM.RATE },
      }}
      depth={{
        label: 'Depth', value: parameters.depth * 100,
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setDepth(v / 100),
        midi: { pluginUri: PHASER_URI, paramIndex: PARAM.DEPTH },
      }}
      centreDelay={{
        label: 'Centre', value: parameters.centreFrequency,
        min: 100, max: 10000, defaultValue: 1000, unit: 'Hz',
        onChange: setCentreFrequency, isLogarithmic: true,
        valueFormatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`,
        midi: { pluginUri: PHASER_URI, paramIndex: PARAM.CENTRE_FREQ },
      }}
      feedback={{
        label: 'Feedback', value: parameters.feedback * 100,
        min: -100, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setFeedback(v / 100),
        midi: { pluginUri: PHASER_URI, paramIndex: PARAM.FEEDBACK },
      }}
      mix={{
        label: 'Mix', value: parameters.mix * 100,
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setMix(v / 100),
        midi: { pluginUri: PHASER_URI, paramIndex: PARAM.MIX },
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      presets={
        <div className="carbon-preset-row">
          <button className="carbon-preset-btn" onClick={() => { setRate(0.3); setDepth(0.5); setCentreFrequency(800); setFeedback(0.5); setMix(0.5) }}>Classic</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(0.1); setDepth(0.8); setCentreFrequency(600); setFeedback(0.7); setMix(0.6) }}>Slow Sweep</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(2); setDepth(0.6); setCentreFrequency(1500); setFeedback(0.6); setMix(0.7) }}>Fast Jet</button>
          <button className="carbon-preset-btn" onClick={() => { setRate(0.5); setDepth(1.0); setCentreFrequency(400); setFeedback(0.9); setMix(0.5) }}>Deep Space</button>
        </div>
      }
    />
  )
}

// Export base component for testing
export { PhaserCardBase as PhaserCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(PhaserCardBase, PHASER_URI, PHASER_PARAMS)
