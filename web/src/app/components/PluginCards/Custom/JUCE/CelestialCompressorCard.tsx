/**
 * CelestialCompressorCard - Artist-preset compressor with gear imagery
 *
 * 50 artist presets organized by era, each mapped to a compressor topology
 * (FET/Opto/VCA/Vari-Mu/Limiter) with detailed SVG illustrations of the
 * associated hardware that change as the preset changes.
 *
 * Drives the existing DynamicsProcessor compressor via useDynamics.
 */

import { useCelestialCompressor } from '../../../../hooks/useCelestialCompressor'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { GainReductionMeter } from '../../../Dynamics/GainReductionMeter'
import { TransferCurve } from '../../Visualizations/TransferCurve'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { GearImage } from './celestial/GearImages'
import { ArtistGrid } from './celestial/ArtistGrid'
import { TOPOLOGY_LABELS, TOPOLOGY_COLORS, TOPOLOGY_GEAR_NAMES } from './celestial/types'
import type { PluginCardProps } from '../../types'
import type { CelestialPreset } from './celestial/types'
import './CelestialCompressorCard.css'

const CELESTIAL_URI = 'map2://juce/dynamics/celestial'

const PARAM = {
  THRESHOLD: 0,
  RATIO: 1,
  ATTACK: 2,
  RELEASE: 3,
  KNEE: 4,
  MAKEUP_GAIN: 5,
}

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
  accentColor = '#d4a574',
  compact = false,
  onOpenMidiMappings,
}: CelestialCompressorCardProps) {
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
    isConnected,
  } = useCelestialCompressor()

  const topoColor = TOPOLOGY_COLORS[topology]

  const handleSelectPreset = (preset: CelestialPreset) => {
    setPreset(preset)
  }

  // Gear image visualization
  const visualization = (
    <div className="celestial-visualization">
      {/* Ambient glow behind the gear */}
      <div
        className="celestial-gear-glow"
        style={{ background: topoColor }}
      />

      {/* Gear SVG */}
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

      {/* Gear name label */}
      <div className="celestial-gear-label">
        <span className="celestial-gear-name">{TOPOLOGY_GEAR_NAMES[topology]}</span>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
      customHeader={
        <div className="celestial-card-header">
          <span className="celestial-card-title">CELESTIAL COMPRESSOR</span>
          <span className="celestial-card-subtitle">Artist Dynamics Collection</span>
        </div>
      }
    >
      {/* Preset Info Bar */}
      <div className="celestial-preset-info">
        {selectedPreset ? (
          <>
            <span className="celestial-preset-artist">{selectedPreset.name}</span>
            <span className="celestial-preset-year">~{selectedPreset.year}</span>
            <span
              className="celestial-preset-topology"
              style={{ background: topoColor }}
            >
              {TOPOLOGY_LABELS[selectedPreset.topology]}
            </span>
            <span className="celestial-preset-confidence" title={`Confidence: ${selectedPreset.confidence}-tier`}>
              {selectedPreset.confidence}
            </span>
            <span className="celestial-preset-description">
              {selectedPreset.description}
              <div className="celestial-preset-albums">
                {selectedPreset.referenceAlbums.join(' / ')}
              </div>
            </span>
          </>
        ) : (
          <span className="celestial-preset-info-empty">
            Select an artist to load their compression preset
          </span>
        )}
      </div>

      {/* Artist Selector Grid */}
      <ArtistGrid
        selectedPresetId={selectedPresetId}
        onSelectPreset={handleSelectPreset}
      />

      {/* Dynamics Section */}
      <ParameterSection title="Dynamics" accentColor={topoColor}>
        <ParameterRow>
          <ParameterKnob
            label="Threshold"
            value={parameters.threshold}
            min={-60}
            max={0}
            defaultValue={-12}
            step={0.5}
            unit="dB"
            onChange={setThreshold}
            accentColor={topoColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.THRESHOLD }}
          />
          <ParameterKnob
            label="Ratio"
            value={parameters.ratio}
            min={1}
            max={20}
            defaultValue={4}
            step={0.1}
            unit=":1"
            onChange={setRatio}
            valueFormatter={(v) => (v >= 20 ? '∞' : v.toFixed(1))}
            accentColor={topoColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.RATIO }}
          />
          <ParameterKnob
            label="Knee"
            value={parameters.knee}
            min={0}
            max={24}
            defaultValue={6}
            step={0.5}
            unit="dB"
            onChange={setKnee}
            accentColor={topoColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.KNEE }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Timing Section */}
      <ParameterSection title="Timing" accentColor={topoColor}>
        <ParameterRow>
          <ParameterKnob
            label="Attack"
            value={parameters.attack}
            min={0.1}
            max={500}
            defaultValue={10}
            step={0.1}
            unit="ms"
            onChange={setAttack}
            isLogarithmic
            accentColor={topoColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.ATTACK }}
          />
          <ParameterKnob
            label="Release"
            value={parameters.release}
            min={10}
            max={5000}
            defaultValue={100}
            step={1}
            unit="ms"
            onChange={setRelease}
            isLogarithmic
            accentColor={topoColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.RELEASE }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Output Section */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Makeup"
            value={parameters.makeupGain}
            min={-12}
            max={24}
            defaultValue={0}
            step={0.5}
            unit="dB"
            onChange={setMakeupGain}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: CELESTIAL_URI, paramIndex: PARAM.MAKEUP_GAIN }}
          />
          <GainReductionMeter
            gainReduction={metering.gainReduction}
            height={compact ? 112 : 140}
          />
          <button
            className={`toggle-btn ${parameters.autoMakeup ? 'active' : ''}`}
            onClick={() => setAutoMakeup(!parameters.autoMakeup)}
            style={{
              background: parameters.autoMakeup ? accentColor : '#333',
              border: `1px solid ${parameters.autoMakeup ? accentColor : '#555'}`,
              color: parameters.autoMakeup ? '#000' : '#888',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              transition: 'all 0.2s',
            }}
          >
            Auto Makeup
          </button>
        </ParameterRow>
      </ParameterSection>

      {/* Metering Footer */}
      <div className="celestial-footer">
        <span>IN: {metering.inputLevel.toFixed(1)} dB</span>
        <span className="celestial-meter-gr">GR: {metering.gainReduction.toFixed(1)} dB</span>
        <span>OUT: {metering.outputLevel.toFixed(1)} dB</span>
      </div>
    </PluginCardShell>
  )
}

export { CelestialCompressorCardBase as CelestialCompressorCard }

export default withMidiDialog(CelestialCompressorCardBase, CELESTIAL_URI, CELESTIAL_PARAMS)
