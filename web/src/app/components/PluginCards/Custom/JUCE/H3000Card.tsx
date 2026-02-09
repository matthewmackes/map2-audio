/**
 * H3000Card - Eventide H3000 Ultra-Harmonizer Card
 *
 * Features iconic blue VFD-style display, 10 algorithm preset buttons,
 * and Eventide-branded styling capturing the legendary harmonizer sound
 */

import { useH3000, H3000_ALGORITHMS } from '../../../../hooks/useH3000'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import { formatPitch, formatFrequency, formatFreq } from '../../utils/formatters'
import { VFDPitchDisplay } from '../../components/Visualizations/LCDDisplay'
import './H3000Card.css'

// Plugin URI for MIDI mappings
const H3000_URI = 'map2://juce/pitch/h3000'

// Parameter definitions for MIDI mapping dialog
const H3000_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Algorithm', symbol: 'algorithm' },
  { index: 1, name: 'Pitch L', symbol: 'pitchL' },
  { index: 2, name: 'Pitch R', symbol: 'pitchR' },
  { index: 3, name: 'Delay L', symbol: 'delayL' },
  { index: 4, name: 'Delay R', symbol: 'delayR' },
  { index: 5, name: 'Feedback', symbol: 'feedback' },
  { index: 6, name: 'Cross Feedback', symbol: 'crossFeedback' },
  { index: 7, name: 'Mod Depth', symbol: 'modDepth' },
  { index: 8, name: 'Mod Rate', symbol: 'modRate' },
  { index: 9, name: 'Low Cut', symbol: 'lowCut' },
  { index: 10, name: 'High Cut', symbol: 'highCut' },
  { index: 11, name: 'Mix', symbol: 'mix' },
  { index: 12, name: 'Level L', symbol: 'levelL' },
  { index: 13, name: 'Level R', symbol: 'levelR' },
  { index: 14, name: 'Glide', symbol: 'glide' },
]

interface H3000CardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function H3000CardBase({
  plugin,
  accentColor = '#00aaff', // Eventide blue
  compact = false,
  onOpenMidiMappings,
}: H3000CardProps) {
  const {
    parameters,
    metering,
    algorithms,
    currentAlgorithm,
    setAlgorithm,
    setPitchL,
    setPitchR,
    setDelayL,
    setDelayR,
    setFeedback,
    setCrossFeedback,
    setModDepth,
    setModRate,
    setLowCut,
    setHighCut,
    setMix,
    setLevelL,
    setLevelR,
    setGlide,
    setBypass,
    isConnected,
  } = useH3000()

  // VFD-style Display visualization using shared component
  const vfdVisualization = (
    <VFDPitchDisplay
      algorithmName={currentAlgorithm.name}
      pitchL={formatPitch(parameters.pitchL)}
      pitchR={formatPitch(parameters.pitchR)}
      meterLevel={(metering.inputLevelL + 60) * 1.67}
      accentColor={accentColor}
    />
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={vfdVisualization}
      compact={compact}
      customHeader={
        <div className="h3000-card-header">
          <span className="h3000-card-title">H3000</span>
          <span className="h3000-card-subtitle">Ultra-Harmonizer</span>
        </div>
      }
    >
      {/* Algorithm Selector Grid - 5x2 layout */}
      <div className="h3000-algorithm-section">
        <div className="h3000-section-label">ALGORITHM</div>
        <div className="h3000-algorithm-grid">
          {algorithms.map((alg) => (
            <button
              key={alg.index}
              className={`h3000-algorithm-btn ${parameters.algorithm === alg.index ? 'active' : ''}`}
              onClick={() => setAlgorithm(alg.index)}
              title={alg.description}
            >
              {alg.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Pitch Shift Controls - Left and Right */}
      <ParameterSection title="Pitch Shift" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Pitch L"
            value={parameters.pitchL}
            min={-2400}
            max={2400}
            defaultValue={0}
            unit="c"
            valueFormatter={formatPitch}
            onChange={setPitchL}
            accentColor="#ff6600"
            size="large"
            midi={{ pluginUri: H3000_URI, paramIndex: 1 }}
          />
          <ParameterKnob
            label="Pitch R"
            value={parameters.pitchR}
            min={-2400}
            max={2400}
            defaultValue={0}
            unit="c"
            valueFormatter={formatPitch}
            onChange={setPitchR}
            accentColor="#ff9900"
            size="large"
            midi={{ pluginUri: H3000_URI, paramIndex: 2 }}
          />
          <ParameterKnob
            label="Glide"
            value={parameters.glide}
            min={0}
            max={1000}
            defaultValue={0}
            unit="ms"
            onChange={setGlide}
            accentColor="#ffcc00"
            size="medium"
            midi={{ pluginUri: H3000_URI, paramIndex: 14 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Delay Section */}
      <ParameterSection title="Delay" accentColor="#00ccff">
        <ParameterRow>
          <ParameterKnob
            label="Delay L"
            value={parameters.delayL}
            min={0}
            max={1000}
            defaultValue={15}
            unit="ms"
            onChange={setDelayL}
            accentColor="#00ccff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 3 }}
          />
          <ParameterKnob
            label="Delay R"
            value={parameters.delayR}
            min={0}
            max={1000}
            defaultValue={20}
            unit="ms"
            onChange={setDelayR}
            accentColor="#00ccff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 4 }}
          />
          <ParameterKnob
            label="Feedback"
            value={parameters.feedback}
            min={0}
            max={100}
            defaultValue={0}
            unit="%"
            onChange={setFeedback}
            accentColor="#00aacc"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 5 }}
          />
          <ParameterKnob
            label="X-Feed"
            value={parameters.crossFeedback}
            min={0}
            max={100}
            defaultValue={0}
            unit="%"
            onChange={setCrossFeedback}
            accentColor="#0088aa"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 6 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Modulation Section */}
      <ParameterSection title="Modulation" accentColor="#aa66ff">
        <ParameterRow>
          <ParameterKnob
            label="Depth"
            value={parameters.modDepth}
            min={0}
            max={100}
            defaultValue={0}
            unit="%"
            onChange={setModDepth}
            accentColor="#aa66ff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 7 }}
          />
          <ParameterKnob
            label="Rate"
            value={parameters.modRate}
            min={0.1}
            max={10}
            defaultValue={0.5}
            unit="Hz"
            onChange={setModRate}
            isLogarithmic
            accentColor="#aa66ff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 8 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Filter & Output Section */}
      <ParameterSection title="Output" accentColor="#66ccff">
        <ParameterRow>
          <ParameterKnob
            label="Low Cut"
            value={parameters.lowCut}
            min={20}
            max={500}
            defaultValue={80}
            unit=""
            valueFormatter={formatFreq}
            onChange={setLowCut}
            isLogarithmic
            accentColor="#66ccff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 9 }}
          />
          <ParameterKnob
            label="High Cut"
            value={parameters.highCut}
            min={2000}
            max={20000}
            defaultValue={12000}
            unit=""
            valueFormatter={formatFreq}
            onChange={setHighCut}
            isLogarithmic
            accentColor="#66ccff"
            size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: 10 }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.mix}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: H3000_URI, paramIndex: 11 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Footer with metering */}
      <div className="h3000-footer">
        <div className="h3000-meter">
          <span className="h3000-meter-label">IN</span>
          <span className="h3000-meter-value">{metering.inputLevelL.toFixed(1)} dB</span>
        </div>
        <div className="h3000-meter">
          <span className="h3000-meter-label">OUT</span>
          <span className="h3000-meter-value">{metering.outputLevelL.toFixed(1)} dB</span>
        </div>
        <div className="h3000-meter">
          <span className="h3000-meter-label">PITCH</span>
          <span className="h3000-meter-value">{formatPitch(metering.pitchLActual)}</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { H3000CardBase as H3000Card }

// Export wrapped component with MIDI dialog
export default withMidiDialog(H3000CardBase, H3000_URI, H3000_PARAMS)
