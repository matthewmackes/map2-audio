/**
 * GateCard - Carbon-compliant JUCE DynamicsProcessor (Noise Gate mode)
 *
 * Uses DynamicsCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: threshold, ratio (range), attack, release.
 * Gate open/closed indicator preserved in visualization.
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { DynamicsCategoryLayout } from '../../Layouts/DynamicsCategoryLayout'
import { GainReductionMeter } from '../../../Dynamics/GainReductionMeter'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

const GATE_URI = 'map2://juce/dynamics/gate'

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
  } = useDynamics()

  const { parameters, metering } = gate
  const isOpen = metering.gainReduction < 1

  return (
    <DynamicsCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setGateBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      showTransferCurve={false}
      threshold={{
        label: 'Threshold',
        value: parameters.threshold,
        min: -100, max: 0, defaultValue: -40, step: 0.5,
        unit: 'dB',
        onChange: setGateThreshold,
        midi: { pluginUri: GATE_URI, paramIndex: 0 },
      }}
      ratio={{
        label: 'Range',
        value: parameters.ratio,
        min: 1, max: 100, defaultValue: 10, step: 1,
        unit: ':1',
        onChange: setGateRatio,
        valueFormatter: (v) => (v >= 100 ? '∞' : v.toFixed(0)),
        midi: { pluginUri: GATE_URI, paramIndex: 1 },
      }}
      attack={{
        label: 'Attack',
        value: parameters.attack,
        min: 0.1, max: 500, defaultValue: 1, step: 0.1,
        unit: 'ms',
        onChange: setGateAttack,
        isLogarithmic: true,
        midi: { pluginUri: GATE_URI, paramIndex: 2 },
      }}
      release={{
        label: 'Release',
        value: parameters.release,
        min: 10, max: 5000, defaultValue: 100, step: 1,
        unit: 'ms',
        onChange: setGateRelease,
        isLogarithmic: true,
        midi: { pluginUri: GATE_URI, paramIndex: 3 },
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      gainReduction={metering.gainReduction}
      extraContent={
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          gap: 8,
        }}>
          <div style={{
            width: 12, height: 12,
            borderRadius: '50%',
            background: isOpen ? accentColor : '#fa4d56',
            boxShadow: `0 0 8px ${isOpen ? accentColor : '#fa4d56'}80`,
            transition: 'all 0.1s ease-out',
          }} />
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: isOpen ? accentColor : '#fa4d56',
            textTransform: 'uppercase',
            letterSpacing: '0.32px',
          }}>
            {isOpen ? 'PASSING' : 'GATING'}
          </span>
        </div>
      }
    />
  )
}

export { GateCardBase as GateCard }
export default withMidiDialog(GateCardBase, GATE_URI, GATE_PARAMS)
