/**
 * CompressorCard - Custom card for JUCE DynamicsProcessor (Compressor mode)
 *
 * Parameters from DynamicsProcessor.h:
 * - threshold: dB (-60 to 0)
 * - ratio: x:1 (1 to 20, 100+ for limiting)
 * - attack: ms (0.1 to 500)
 * - release: ms (10 to 5000)
 * - knee: dB (0 to 24)
 * - makeupGain: dB (-12 to 24)
 * - autoMakeup: boolean
 * - bypass: boolean
 *
 * Metering:
 * - inputLevel, outputLevel: dB peak
 * - gainReduction: dB (positive = reduction)
 * - inputRms, outputRms: dB RMS
 *
 * Supports MIDI CC assignment on all parameters.
 */

import { useDynamics } from '../../../../hooks/useDynamics'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { TransferCurve } from '../../Visualizations/TransferCurve'
import { GainReductionMeter } from '../../../Dynamics/GainReductionMeter'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const COMPRESSOR_URI = 'map2://juce/dynamics/compressor'

// Parameter indices (must match juce_processors.json order)
const PARAM = {
  THRESHOLD: 0,
  RATIO: 1,
  ATTACK: 2,
  RELEASE: 3,
  KNEE: 4,
  MAKEUP_GAIN: 5,
}

// Parameter definitions for MIDI mapping dialog
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
  accentColor = '#22c55e',
  compact = false,
  onOpenMidiMappings,
}: CompressorCardProps) {
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
    isConnected,
  } = useDynamics()

  const { parameters, metering } = compressor

  const visualization = (
    <div className="compressor-viz" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <GainReductionMeter gainReduction={metering.gainReduction} height={compact ? 140 : 168} />
      <TransferCurve
        threshold={parameters.threshold}
        ratio={parameters.ratio}
        knee={parameters.knee}
        makeupGain={parameters.makeupGain}
        inputLevel={metering.inputLevel}
        outputLevel={metering.outputLevel}
        accentColor={accentColor}
        width={compact ? 224 : 280}
        height={compact ? 140 : 168}
      />
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setCompressorBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      compact={compact}
    >
      {/* Dynamics Section */}
      <ParameterSection title="Dynamics" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Threshold"
            value={parameters.threshold}
            min={-60}
            max={0}
            defaultValue={-12}
            step={0.5}
            unit="dB"
            onChange={setCompressorThreshold}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.THRESHOLD }}
          />
          <ParameterKnob
            label="Ratio"
            value={parameters.ratio}
            min={1}
            max={20}
            defaultValue={4}
            step={0.1}
            unit=":1"
            onChange={setCompressorRatio}
            valueFormatter={(v) => (v >= 20 ? '∞' : v.toFixed(1))}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.RATIO }}
          />
          <ParameterKnob
            label="Knee"
            value={parameters.knee}
            min={0}
            max={24}
            defaultValue={6}
            step={0.5}
            unit="dB"
            onChange={setCompressorKnee}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.KNEE }}
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
            defaultValue={10}
            step={0.1}
            unit="ms"
            onChange={setCompressorAttack}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.ATTACK }}
          />
          <ParameterKnob
            label="Release"
            value={parameters.release}
            min={10}
            max={5000}
            defaultValue={100}
            step={1}
            unit="ms"
            onChange={setCompressorRelease}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.RELEASE }}
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
            onChange={setCompressorMakeupGain}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: COMPRESSOR_URI, paramIndex: PARAM.MAKEUP_GAIN }}
          />
          <button
            className={`toggle-btn ${parameters.autoMakeup ? 'active' : ''}`}
            onClick={() => setCompressorAutoMakeup(!parameters.autoMakeup)}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 0',
          borderTop: '1px solid #333',
          marginTop: '8px',
          fontSize: '10px',
          color: '#666',
          fontFamily: 'var(--font-mono)',
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
export { CompressorCardBase as CompressorCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(CompressorCardBase, COMPRESSOR_URI, COMPRESSOR_PARAMS)
