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
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

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
  pluginPosition,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
}: GateCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const {
    gate,
    setGateThreshold,
    setGateRatio,
    setGateAttack,
    setGateRelease,
    setGateBypass,
  } = useDynamics({
    processor: 'gate',
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
  })

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
          {/* T2474 E2: Was rendering a 12px LED dot with 8px boxShadow glow
              halo + Carbon red-50 (#fa4d56) hardcoded. Per Q1=A (no glow
              halos) the dot is now flat, and the closed-state color routes
              through --map2-health-critical from B1. The PASSING/GATING
              text alternation already conveys state without the glow. */}
          <div style={{
            width: 12, height: 12,
            borderRadius: '50%',
            background: isOpen ? accentColor : 'var(--map2-health-critical, #fa4d56)',
            // carbon-allow: gate state-LED 100ms — explicit T2466 carve-out (audio-domain motion).
            transition: 'background 0.1s ease-out',
          }} />
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: isOpen ? accentColor : 'var(--map2-health-critical, #fa4d56)',
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
