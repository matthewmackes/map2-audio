/**
 * CompressorCard - Carbon-compliant JUCE DynamicsProcessor (Compressor mode)
 *
 * Uses DynamicsCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: threshold, ratio, attack, release, knee, makeup, auto-makeup.
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { DynamicsCategoryLayout } from '../../Layouts/DynamicsCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const COMPRESSOR_URI = 'map2://juce/dynamics/compressor'

const PARAM = {
  THRESHOLD: 0,
  RATIO: 1,
  ATTACK: 2,
  RELEASE: 3,
  KNEE: 4,
  MAKEUP_GAIN: 5,
} as const

const COMPRESSOR_PARAMS: PluginParamDef[] = [
  { index: PARAM.THRESHOLD, name: 'Threshold', symbol: 'threshold' },
  { index: PARAM.RATIO, name: 'Ratio', symbol: 'ratio' },
  { index: PARAM.ATTACK, name: 'Attack', symbol: 'attack' },
  { index: PARAM.RELEASE, name: 'Release', symbol: 'release' },
  { index: PARAM.KNEE, name: 'Knee', symbol: 'knee' },
  { index: PARAM.MAKEUP_GAIN, name: 'Makeup Gain', symbol: 'makeupGain' },
]

interface CompressorCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function CompressorCardBase({
  plugin,
  pluginPosition,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
}: CompressorCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const {
    compressor,
    setCompressorThreshold,
    setCompressorRatio,
    setCompressorAttack,
    setCompressorRelease,
    setCompressorKnee,
    setCompressorMakeupGain,
    setCompressorAutoMakeup,
    setCompressorBypass,
  } = useDynamics({
    processor: 'compressor',
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
  })

  const { parameters, metering } = compressor

  return (
    <DynamicsCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setCompressorBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      threshold={{
        label: 'Threshold',
        value: parameters.threshold,
        min: -60, max: 0, defaultValue: -12, step: 0.5,
        unit: 'dB',
        onChange: setCompressorThreshold,
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.THRESHOLD },
      }}
      ratio={{
        label: 'Ratio',
        value: parameters.ratio,
        min: 1, max: 20, defaultValue: 4, step: 0.1,
        unit: ':1',
        onChange: setCompressorRatio,
        valueFormatter: (v) => (v >= 20 ? '∞' : v.toFixed(1)),
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.RATIO },
      }}
      knee={{
        label: 'Knee',
        value: parameters.knee,
        min: 0, max: 24, defaultValue: 6, step: 0.5,
        unit: 'dB',
        onChange: setCompressorKnee,
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.KNEE },
      }}
      attack={{
        label: 'Attack',
        value: parameters.attack,
        min: 0.1, max: 500, defaultValue: 10, step: 0.1,
        unit: 'ms',
        onChange: setCompressorAttack,
        isLogarithmic: true,
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.ATTACK },
      }}
      release={{
        label: 'Release',
        value: parameters.release,
        min: 10, max: 5000, defaultValue: 100, step: 1,
        unit: 'ms',
        onChange: setCompressorRelease,
        isLogarithmic: true,
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.RELEASE },
      }}
      makeupGain={{
        label: 'Makeup',
        value: parameters.makeupGain,
        min: -12, max: 24, defaultValue: 0, step: 0.5,
        unit: 'dB',
        onChange: setCompressorMakeupGain,
        midi: { pluginUri: COMPRESSOR_URI, paramIndex: PARAM.MAKEUP_GAIN },
      }}
      autoMakeup={{
        enabled: parameters.autoMakeup,
        onToggle: () => setCompressorAutoMakeup(!parameters.autoMakeup),
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      gainReduction={metering.gainReduction}
    />
  )
}

export { CompressorCardBase as CompressorCard }
export default withMidiDialog(CompressorCardBase, COMPRESSOR_URI, COMPRESSOR_PARAMS)
