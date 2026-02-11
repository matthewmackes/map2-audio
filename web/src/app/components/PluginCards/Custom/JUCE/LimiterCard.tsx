/**
 * LimiterCard - Custom card for JUCE DynamicsProcessor (Limiter mode)
 *
 * Parameters:
 * - threshold (ceiling): dB (-60 to 0)
 * - release: ms (10 to 5000)
 * - bypass: boolean
 *
 * Metering:
 * - inputLevel, outputLevel: dB peak
 * - gainReduction: dB (positive = reduction)
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { GainReductionMeter } from '../../../Dynamics/GainReductionMeter'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const LIMITER_URI = 'map2://juce/dynamics/limiter'

// Parameter definitions for MIDI mapping dialog
const LIMITER_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Ceiling', symbol: 'threshold' },
  { index: 1, name: 'Release', symbol: 'release' },
]

interface LimiterCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function LimiterCardBase({
  plugin,
  accentColor = '#22c55e',
  compact = false,
  onOpenMidiMappings,
}: LimiterCardProps) {
  const {
    limiter,
    setLimiterThreshold,
    setLimiterRelease,
    setLimiterBypass,
    isConnected,
  } = useDynamics()

  const { parameters, metering } = limiter

  const visualization = (
    <div className="limiter-viz" style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
      <GainReductionMeter
        gainReduction={metering.gainReduction}
        height={compact ? 140 : 196}
        width={24}
      />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '45px', fontWeight: 'bold', color: accentColor, fontFamily: 'monospace' }}>
          {parameters.threshold.toFixed(1)}
        </div>
        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
          Ceiling dB
        </div>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setLimiterBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
    >
      {/* Ceiling Section */}
      <ParameterSection title="Ceiling" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Ceiling"
            value={parameters.threshold}
            min={-60}
            max={0}
            defaultValue={-1}
            step={0.1}
            unit="dB"
            onChange={setLimiterThreshold}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Timing Section */}
      <ParameterSection title="Timing" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Release"
            value={parameters.release}
            min={10}
            max={5000}
            defaultValue={100}
            step={1}
            unit="ms"
            onChange={setLimiterRelease}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Metering Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 0',
          borderTop: '1px solid #333',
          marginTop: '8px',
          fontSize: '10px',
          color: '#666',
          fontFamily: 'monospace',
        }}
      >
        <span>IN: {metering.inputLevel.toFixed(1)} dB</span>
        <span>GR: {metering.gainReduction.toFixed(1)} dB</span>
        <span>OUT: {metering.outputLevel.toFixed(1)} dB</span>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { LimiterCardBase as LimiterCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(LimiterCardBase, LIMITER_URI, LIMITER_PARAMS)
