/**
 * GateCard - Custom card for JUCE DynamicsProcessor (Noise Gate mode)
 *
 * Parameters:
 * - threshold: dB (-100 to 0)
 * - ratio: x:1 (1 to 100)
 * - attack: ms (0.1 to 500)
 * - release: ms (10 to 5000)
 * - bypass: boolean
 *
 * Metering:
 * - inputLevel, outputLevel: dB peak
 * - gainReduction: dB (positive = reduction/gating)
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const GATE_URI = 'map2://juce/dynamics/gate'

// Parameter definitions for MIDI mapping dialog
const GATE_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Threshold', symbol: 'threshold' },
  { index: 1, name: 'Ratio', symbol: 'ratio' },
  { index: 2, name: 'Attack', symbol: 'attack' },
  { index: 3, name: 'Release', symbol: 'release' },
]

interface GateCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function GateCardBase({
  plugin,
  accentColor = '#22c55e',
  compact = false,
  onOpenMidiMappings,
}: GateCardProps) {
  const {
    gate,
    setGateThreshold,
    setGateRatio,
    setGateAttack,
    setGateRelease,
    setGateBypass,
    isConnected,
  } = useDynamics()

  const { parameters, metering } = gate

  // Gate is "open" when gain reduction is minimal (input > threshold)
  const isOpen = metering.gainReduction < 1

  const visualization = (
    <div className="gate-viz" style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
      {/* Gate Open/Closed Indicator */}
      <div
        style={{
          width: compact ? 60 : 80,
          height: compact ? 60 : 80,
          borderRadius: '50%',
          background: isOpen
            ? `radial-gradient(circle, ${accentColor} 0%, ${accentColor}80 50%, ${accentColor}20 100%)`
            : 'radial-gradient(circle, #ff4444 0%, #ff444480 50%, #ff444420 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isOpen ? `0 0 20px ${accentColor}80` : '0 0 20px #ff444480',
          transition: 'all 0.1s ease-out',
        }}
      >
        <span
          style={{
            fontSize: compact ? '10px' : '12px',
            fontWeight: 'bold',
            color: '#000',
            textTransform: 'uppercase',
          }}
        >
          {isOpen ? 'OPEN' : 'CLOSED'}
        </span>
      </div>

      {/* Threshold Level Display */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', fontFamily: 'monospace' }}>
          {parameters.threshold.toFixed(0)}
        </div>
        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>
          Threshold dB
        </div>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setGateBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
    >
      {/* Threshold Section */}
      <ParameterSection title="Gate" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Threshold"
            value={parameters.threshold}
            min={-100}
            max={0}
            defaultValue={-40}
            step={0.5}
            unit="dB"
            onChange={setGateThreshold}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Range"
            value={parameters.ratio}
            min={1}
            max={100}
            defaultValue={10}
            step={1}
            unit=":1"
            onChange={setGateRatio}
            valueFormatter={(v) => (v >= 100 ? '∞' : v.toFixed(0))}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Timing Section */}
      <ParameterSection title="Timing" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Attack"
            value={parameters.attack}
            min={0.1}
            max={500}
            defaultValue={1}
            step={0.1}
            unit="ms"
            onChange={setGateAttack}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Release"
            value={parameters.release}
            min={10}
            max={5000}
            defaultValue={100}
            step={1}
            unit="ms"
            onChange={setGateRelease}
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
        <span style={{ color: isOpen ? accentColor : '#ff4444' }}>
          {isOpen ? 'PASSING' : `GATING ${metering.gainReduction.toFixed(1)} dB`}
        </span>
        <span>OUT: {metering.outputLevel.toFixed(1)} dB</span>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { GateCardBase as GateCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(GateCardBase, GATE_URI, GATE_PARAMS)
