/**
 * LexiLoveCard - Lexicon PCM 70 Algorithmic Reverb Card
 *
 * Features iconic green LCD display, 9 algorithm preset buttons,
 * and Lexicon-branded styling capturing the legendary "depth and sparkle"
 */

import { useLexiLove, LEXI_ALGORITHMS } from '../../../../hooks/useLexiLove'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import './LexiLoveCard.css'

// Plugin URI for MIDI mappings
const LEXI_LOVE_URI = 'map2://juce/reverb/pcm70'

// Parameter definitions for MIDI mapping dialog
const LEXI_LOVE_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Algorithm', symbol: 'algorithm' },
  { index: 1, name: 'Pre-Delay', symbol: 'preDelay' },
  { index: 2, name: 'Decay Time', symbol: 'decayTime' },
  { index: 3, name: 'Diffusion', symbol: 'diffusion' },
  { index: 4, name: 'Early Level', symbol: 'earlyLevel' },
  { index: 5, name: 'Early Pattern', symbol: 'earlyPattern' },
  { index: 6, name: 'Low Decay', symbol: 'lowDecayMult' },
  { index: 7, name: 'High Decay', symbol: 'highDecayMult' },
  { index: 8, name: 'Mod Depth', symbol: 'modDepth' },
  { index: 9, name: 'Mod Rate', symbol: 'modRate' },
  { index: 10, name: 'Mix', symbol: 'mix' },
  { index: 11, name: 'High Cut', symbol: 'highCut' },
  { index: 12, name: 'Low Cut', symbol: 'lowCut' },
]

interface LexiLoveCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function LexiLoveCardBase({
  plugin,
  accentColor = '#00cc00', // Lexicon green
  compact = false,
  onOpenMidiMappings,
}: LexiLoveCardProps) {
  const {
    parameters,
    metering,
    algorithms,
    currentAlgorithm,
    setAlgorithm,
    setPreDelay,
    setDecayTime,
    setDiffusion,
    setLowDecayMult,
    setHighDecayMult,
    setEarlyLevel,
    setEarlyPattern,
    setModDepth,
    setModRate,
    setMix,
    setHighCut,
    setLowCut,
    setBypass,
    isConnected,
  } = useLexiLove()

  // Format decay time for display
  const formatDecay = (seconds: number) => {
    if (seconds >= 10) return seconds.toFixed(0) + 's'
    return seconds.toFixed(1) + 's'
  }

  // Format frequency for display
  const formatFreq = (hz: number) => {
    if (hz >= 10000) return (hz / 1000).toFixed(0) + 'k'
    if (hz >= 1000) return (hz / 1000).toFixed(1) + 'k'
    return hz.toFixed(0)
  }

  // LCD Display visualization
  const lcdVisualization = (
    <div className="lexi-lcd-container">
      <div className="lexi-lcd-screen">
        <div className="lexi-lcd-row">
          <span className="lexi-lcd-label">PROGRAM</span>
          <span className="lexi-lcd-value">{currentAlgorithm.name}</span>
        </div>
        <div className="lexi-lcd-row">
          <span className="lexi-lcd-label">DECAY</span>
          <span className="lexi-lcd-value">{formatDecay(parameters.decayTime)}</span>
        </div>
        <div className="lexi-lcd-decay-bar">
          <div
            className="lexi-lcd-decay-fill"
            style={{ width: `${Math.min(100, (parameters.decayTime / 10) * 100)}%` }}
          />
        </div>
      </div>
      <div className="lexi-lcd-logo">LEXI LOVE</div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={lcdVisualization}
      compact={compact}
      customHeader={
        <div className="lexi-card-header">
          <span className="lexi-card-title">LEXI LOVE</span>
          <span className="lexi-card-subtitle">PCM 70 Algorithmic Reverb</span>
        </div>
      }
    >
      {/* Algorithm Selector Grid */}
      <div className="lexi-algorithm-section">
        <div className="lexi-section-label">ALGORITHM</div>
        <div className="lexi-algorithm-grid">
          {algorithms.map((alg) => (
            <button
              key={alg.index}
              className={`lexi-algorithm-btn ${parameters.algorithm === alg.index ? 'active' : ''}`}
              onClick={() => setAlgorithm(alg.index)}
              title={alg.description}
            >
              {alg.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Main Controls - Decay & Mix */}
      <ParameterSection title="Decay" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Decay"
            value={parameters.decayTime}
            min={0.5}
            max={30}
            defaultValue={2.5}
            unit="s"
            onChange={setDecayTime}
            isLogarithmic
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 2 }}
          />
          <ParameterKnob
            label="Diffusion"
            value={parameters.diffusion}
            min={0}
            max={100}
            defaultValue={85}
            unit="%"
            onChange={setDiffusion}
            accentColor={accentColor}
            size="medium"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 3 }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.mix}
            min={0}
            max={100}
            defaultValue={35}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 10 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Early Reflections */}
      <ParameterSection title="Early Reflections" accentColor="#00aa88">
        <ParameterRow>
          <ParameterKnob
            label="Pre-Delay"
            value={parameters.preDelay}
            min={0}
            max={500}
            defaultValue={40}
            unit="ms"
            onChange={setPreDelay}
            accentColor="#00aa88"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 1 }}
          />
          <ParameterKnob
            label="ER Level"
            value={parameters.earlyLevel}
            min={0}
            max={100}
            defaultValue={70}
            unit="%"
            onChange={setEarlyLevel}
            accentColor="#00aa88"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 4 }}
          />
          <ParameterKnob
            label="ER Density"
            value={parameters.earlyPattern}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setEarlyPattern}
            accentColor="#00aa88"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 5 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Multi-Band Decay (Lexicon Signature) */}
      <ParameterSection title="Tone" accentColor="#00ccaa">
        <ParameterRow>
          <ParameterKnob
            label="Lo Decay"
            value={parameters.lowDecayMult}
            min={0.25}
            max={2}
            defaultValue={1}
            unit="x"
            onChange={setLowDecayMult}
            accentColor="#00ccaa"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 6 }}
          />
          <ParameterKnob
            label="Hi Decay"
            value={parameters.highDecayMult}
            min={0.25}
            max={2}
            defaultValue={0.8}
            unit="x"
            onChange={setHighDecayMult}
            accentColor="#00ccaa"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 7 }}
          />
          <ParameterKnob
            label="Hi Cut"
            value={parameters.highCut}
            min={1000}
            max={20000}
            defaultValue={12000}
            unit=""
            valueFormatter={formatFreq}
            onChange={setHighCut}
            isLogarithmic
            accentColor="#00ccaa"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 11 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Modulation (Sparkle) */}
      <ParameterSection title="Modulation (Sparkle)" accentColor="#00ffaa">
        <ParameterRow>
          <ParameterKnob
            label="Depth"
            value={parameters.modDepth}
            min={0}
            max={100}
            defaultValue={15}
            unit="%"
            onChange={setModDepth}
            accentColor="#00ffaa"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 8 }}
          />
          <ParameterKnob
            label="Rate"
            value={parameters.modRate}
            min={0.1}
            max={10}
            defaultValue={0.8}
            unit="Hz"
            onChange={setModRate}
            isLogarithmic
            accentColor="#00ffaa"
            size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: 9 }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Footer with metering */}
      <div className="lexi-footer">
        <div className="lexi-meter">
          <span className="lexi-meter-label">IN</span>
          <span className="lexi-meter-value">{metering.inputLevelL.toFixed(1)} dB</span>
        </div>
        <div className="lexi-meter">
          <span className="lexi-meter-label">OUT</span>
          <span className="lexi-meter-value">{metering.outputLevelL.toFixed(1)} dB</span>
        </div>
        <div className="lexi-meter">
          <span className="lexi-meter-label">REV</span>
          <span className="lexi-meter-value">{metering.reverbLevelL.toFixed(1)} dB</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { LexiLoveCardBase as LexiLoveCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(LexiLoveCardBase, LEXI_LOVE_URI, LEXI_LOVE_PARAMS)
