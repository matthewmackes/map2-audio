/**
 * LimiterCard - Carbon-compliant JUCE DynamicsProcessor (Limiter mode)
 *
 * Uses DynamicsCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: ceiling (threshold), release.
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { DynamicsCategoryLayout } from '../../Layouts/DynamicsCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

const LIMITER_URI = 'map2://juce/dynamics/limiter'

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
  } = useDynamics()

  const { parameters, metering } = limiter

  return (
    <DynamicsCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setLimiterBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      threshold={{
        label: 'Ceiling',
        value: parameters.threshold,
        min: -60, max: 0, defaultValue: -1, step: 0.1,
        unit: 'dB',
        onChange: setLimiterThreshold,
        midi: { pluginUri: LIMITER_URI, paramIndex: 0 },
      }}
      ratio={{
        label: 'Ratio',
        value: 100,
        min: 1, max: 100, defaultValue: 100, step: 1,
        unit: ':1',
        onChange: () => {},
        valueFormatter: () => '∞',
      }}
      release={{
        label: 'Release',
        value: parameters.release,
        min: 10, max: 5000, defaultValue: 100, step: 1,
        unit: 'ms',
        onChange: setLimiterRelease,
        isLogarithmic: true,
        midi: { pluginUri: LIMITER_URI, paramIndex: 1 },
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      gainReduction={metering.gainReduction}
    />
  )
}

export { LimiterCardBase as LimiterCard }
export default withMidiDialog(LimiterCardBase, LIMITER_URI, LIMITER_PARAMS)
