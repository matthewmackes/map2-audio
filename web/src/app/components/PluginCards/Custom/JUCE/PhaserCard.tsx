/**
 * PhaserCard - Custom card for JUCE 6-Stage Phaser Processor
 *
 * Classic phaser with sweeping notch filters.
 */

import { usePhaser } from '../../../../hooks/useModulation'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import './PhaserCard.css'

export function PhaserCard({
  plugin,
  accentColor = '#e74c3c',
  compact = false,
}: PluginCardProps) {
  const {
    parameters,
    metering,
    setRate,
    setDepth,
    setCentreFrequency,
    setFeedback,
    setMix,
    setBypass,
    isConnected,
  } = usePhaser()

  // Phaser notch visualization
  const phaserVisualization = (
    <div className="phaser-visualization">
      <svg viewBox="0 0 200 60" className="phaser-sweep">
        {/* Frequency response with moving notches */}
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

      <div className="phaser-meters">
        <span>6-Stage All-Pass</span>
        <span>Rate: {parameters.rate.toFixed(2)} Hz</span>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      visualization={phaserVisualization}
      compact={compact}
      customHeader={
        <div className="phaser-card-header">
          <span className="phaser-card-title">6-STAGE PHASER</span>
        </div>
      }
    >
      {/* Modulation Controls */}
      <ParameterSection title="Modulation" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={parameters.rate}
            min={0.05}
            max={5}
            defaultValue={0.5}
            unit="Hz"
            onChange={setRate}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
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
          />
          <ParameterKnob
            label="Centre"
            value={parameters.centreFrequency}
            min={100}
            max={10000}
            defaultValue={1000}
            unit="Hz"
            onChange={setCentreFrequency}
            isLogarithmic
            valueFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`}
            accentColor={accentColor}
            size="medium"
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
            defaultValue={50}
            unit="%"
            onChange={(v) => setFeedback(v / 100)}
            accentColor={accentColor}
            size="small"
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
          />
        </ParameterRow>
      </ParameterSection>

      {/* Preset Quick Buttons */}
      <div className="phaser-presets">
        <button onClick={() => { setRate(0.3); setDepth(0.5); setCentreFrequency(800); setFeedback(0.5); setMix(0.5); }}>
          Classic
        </button>
        <button onClick={() => { setRate(0.1); setDepth(0.8); setCentreFrequency(600); setFeedback(0.7); setMix(0.6); }}>
          Slow Sweep
        </button>
        <button onClick={() => { setRate(2); setDepth(0.6); setCentreFrequency(1500); setFeedback(0.6); setMix(0.7); }}>
          Fast Jet
        </button>
        <button onClick={() => { setRate(0.5); setDepth(1.0); setCentreFrequency(400); setFeedback(0.9); setMix(0.5); }}>
          Deep Space
        </button>
      </div>

      {/* Footer */}
      <div className="phaser-footer">
        <span>IN: {metering.inputLevel.toFixed(1)} dB</span>
        <span>OUT: {metering.outputLevel.toFixed(1)} dB</span>
      </div>
    </PluginCardShell>
  )
}

export default PhaserCard
