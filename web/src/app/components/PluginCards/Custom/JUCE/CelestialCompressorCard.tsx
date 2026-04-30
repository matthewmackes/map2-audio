/**
 * CelestialCompressorCard - Carbon-compliant artist-preset compressor
 *
 * Uses DynamicsCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed. Artist presets + gear imagery in Accordion advanced section.
 */

import { useCelestialCompressor } from '../../../../hooks/useCelestialCompressor'
import { DynamicsCategoryLayout } from '../../Layouts/DynamicsCategoryLayout'
import { GainReductionMeter } from '../../../Dynamics/GainReductionMeter'
import { TransferCurve } from '../../Visualizations/TransferCurve'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { GearImage } from './celestial/GearImages'
import { ArtistGrid } from './celestial/ArtistGrid'
import { TOPOLOGY_LABELS, TOPOLOGY_COLORS, TOPOLOGY_GEAR_NAMES } from './celestial/types'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import type { CelestialPreset } from './celestial/types'
import { Music } from '@carbon/icons-react'

const CELESTIAL_URI = 'map2://juce/dynamics/celestial'

const PARAM = {
  THRESHOLD: 0, RATIO: 1, ATTACK: 2, RELEASE: 3, KNEE: 4, MAKEUP_GAIN: 5,
} as const

const CELESTIAL_PARAMS: PluginParamDef[] = [
  { index: PARAM.THRESHOLD, name: 'Threshold', symbol: 'threshold' },
  { index: PARAM.RATIO, name: 'Ratio', symbol: 'ratio' },
  { index: PARAM.ATTACK, name: 'Attack', symbol: 'attack' },
  { index: PARAM.RELEASE, name: 'Release', symbol: 'release' },
  { index: PARAM.KNEE, name: 'Knee', symbol: 'knee' },
  { index: PARAM.MAKEUP_GAIN, name: 'Makeup Gain', symbol: 'makeupGain' },
]

interface CelestialCompressorCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function CelestialCompressorCardBase({
  plugin,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
}: CelestialCompressorCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const {
    selectedPreset,
    selectedPresetId,
    topology,
    setPreset,
    parameters,
    metering,
    setThreshold,
    setRatio,
    setAttack,
    setRelease,
    setKnee,
    setMakeupGain,
    setAutoMakeup,
    setBypass,
  } = useCelestialCompressor()

  const topoColor = TOPOLOGY_COLORS[topology]

  const advancedSections: AdvancedSection[] = [
    {
      id: 'artist-presets',
      title: 'Artist Presets',
      icon: <Music size={14} />,
      children: (
        <div>
          {/* Preset Info */}
          {selectedPreset && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#262626', borderRadius: 4, fontSize: 11, color: 'var(--cds-text-secondary, #c6c6c6)' }}>
              <div style={{ fontWeight: 600, color: 'var(--cds-text-primary, #f4f4f4)' }}>{selectedPreset.name} <span style={{ color: 'var(--cds-text-helper, #a8a8a8)' }}>~{selectedPreset.year}</span></div>
              <span style={{ display: 'inline-block', padding: '1px 6px', background: topoColor, borderRadius: 2, fontSize: 9, color: 'var(--cds-background, #161616)', fontWeight: 600, marginTop: 4 }}>
                {TOPOLOGY_LABELS[selectedPreset.topology]}
              </span>
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--cds-text-helper, #a8a8a8)' }}>{selectedPreset.description}</div>
              <div style={{ marginTop: 2, fontSize: 9, color: 'var(--cds-text-disabled, #6f6f6f)' }}>{selectedPreset.referenceAlbums.join(' / ')}</div>
            </div>
          )}
          <ArtistGrid selectedPresetId={selectedPresetId} onSelectPreset={setPreset} />
        </div>
      ),
      defaultOpen: false,
    },
    {
      id: 'gear-visualization',
      title: `Gear: ${TOPOLOGY_GEAR_NAMES[topology]}`,
      children: (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
          <GearImage
            topology={topology}
            params={selectedPreset?.params ?? {
              threshold: parameters.threshold,
              ratio: parameters.ratio,
              attack: parameters.attack,
              release: parameters.release,
              knee: parameters.knee,
              makeupGain: parameters.makeupGain,
              autoMakeup: parameters.autoMakeup,
            }}
            gainReduction={metering.gainReduction}
            inputLevel={metering.inputLevel}
            outputLevel={metering.outputLevel}
          />
        </div>
      ),
      defaultOpen: false,
    },
  ]

  return (
    <DynamicsCategoryLayout
      plugin={plugin}
      accentColor={topoColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      threshold={{
        label: 'Threshold', value: parameters.threshold,
        min: -60, max: 0, defaultValue: -12, step: 0.5, unit: 'dB',
        onChange: setThreshold,
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.THRESHOLD },
      }}
      ratio={{
        label: 'Ratio', value: parameters.ratio,
        min: 1, max: 20, defaultValue: 4, step: 0.1, unit: ':1',
        onChange: setRatio,
        valueFormatter: (v) => (v >= 20 ? '∞' : v.toFixed(1)),
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.RATIO },
      }}
      knee={{
        label: 'Knee', value: parameters.knee,
        min: 0, max: 24, defaultValue: 6, step: 0.5, unit: 'dB',
        onChange: setKnee,
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.KNEE },
      }}
      attack={{
        label: 'Attack', value: parameters.attack,
        min: 0.1, max: 500, defaultValue: 10, step: 0.1, unit: 'ms',
        onChange: setAttack, isLogarithmic: true,
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.ATTACK },
      }}
      release={{
        label: 'Release', value: parameters.release,
        min: 10, max: 5000, defaultValue: 100, step: 1, unit: 'ms',
        onChange: setRelease, isLogarithmic: true,
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.RELEASE },
      }}
      makeupGain={{
        label: 'Makeup', value: parameters.makeupGain,
        min: -12, max: 24, defaultValue: 0, step: 0.5, unit: 'dB',
        onChange: setMakeupGain,
        midi: { pluginUri: CELESTIAL_URI, paramIndex: PARAM.MAKEUP_GAIN },
      }}
      autoMakeup={{
        enabled: parameters.autoMakeup,
        onToggle: () => setAutoMakeup(!parameters.autoMakeup),
      }}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      gainReduction={metering.gainReduction}
      advancedSections={advancedSections}
    />
  )
}

export { CelestialCompressorCardBase as CelestialCompressorCard }
export default withMidiDialog(CelestialCompressorCardBase, CELESTIAL_URI, CELESTIAL_PARAMS)
