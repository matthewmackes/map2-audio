import { useLexiLove, LEXI_ALGORITHMS } from '../../../../hooks/useLexiLove'
import { ReverbCategoryLayout } from '../../Layouts/ReverbCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { formatDecay, formatFreq } from '../../utils/formatters'
import { LCDDisplay } from '../../components/Visualizations/LCDDisplay'
import { ParameterKnob } from '../../../ParameterControl'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { Activity, SettingsAdjust } from '@carbon/icons-react'

const LEXI_LOVE_URI = 'map2://juce/reverb/pcm70'

const PARAM = {
  ALGORITHM: 0, PRE_DELAY: 1, DECAY_TIME: 2, DIFFUSION: 3,
  MIX: 4, HIGH_CUT: 5, LOW_CUT: 6, LOW_DECAY_MULT: 7, HIGH_DECAY_MULT: 8,
  LOW_CROSSOVER: 9, HIGH_CROSSOVER: 10, EARLY_LEVEL: 11, EARLY_PATTERN: 12,
  MOD_DEPTH: 13, MOD_RATE: 14, SPILLOVER: 15, BYPASS: 16,
} as const

const LEXI_LOVE_PARAMS: PluginParamDef[] = [
  { index: PARAM.ALGORITHM, name: 'Algorithm', symbol: 'algorithm' },
  { index: PARAM.PRE_DELAY, name: 'Pre-Delay', symbol: 'preDelay' },
  { index: PARAM.DECAY_TIME, name: 'Decay Time', symbol: 'decayTime' },
  { index: PARAM.DIFFUSION, name: 'Diffusion', symbol: 'diffusion' },
  { index: PARAM.MIX, name: 'Mix', symbol: 'mix' },
  { index: PARAM.HIGH_CUT, name: 'High Cut', symbol: 'highCut' },
  { index: PARAM.LOW_CUT, name: 'Low Cut', symbol: 'lowCut' },
  { index: PARAM.LOW_DECAY_MULT, name: 'Low Decay', symbol: 'lowDecayMult' },
  { index: PARAM.HIGH_DECAY_MULT, name: 'High Decay', symbol: 'highDecayMult' },
  { index: PARAM.LOW_CROSSOVER, name: 'Low Crossover', symbol: 'lowCrossover' },
  { index: PARAM.HIGH_CROSSOVER, name: 'High Crossover', symbol: 'highCrossover' },
  { index: PARAM.EARLY_LEVEL, name: 'Early Level', symbol: 'earlyLevel' },
  { index: PARAM.EARLY_PATTERN, name: 'Early Pattern', symbol: 'earlyPattern' },
  { index: PARAM.MOD_DEPTH, name: 'Mod Depth', symbol: 'modDepth' },
  { index: PARAM.MOD_RATE, name: 'Mod Rate', symbol: 'modRate' },
  { index: PARAM.SPILLOVER, name: 'Spillover', symbol: 'spillover' },
]

interface LexiLoveCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function LexiLoveCardBase({
  plugin,
  pluginPosition,
  accentColor = '#00cc00',
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
    setLowCrossover,
    setHighCrossover,
    setEarlyLevel,
    setEarlyPattern,
    setModDepth,
    setModRate,
    setMix,
    setHighCut,
    setLowCut,
    setSpillover,
    setBypass,
    isConnected,
  } = useLexiLove({
    instanceId: plugin.instance_id ?? null,
    pluginPosition,
  })

  const lcdVisualization = (
    <div style={{ width: '100%' }}>
      <LCDDisplay
        style="lexicon-green"
        rows={[
          { label: 'PROGRAM', value: currentAlgorithm.name, size: 'medium' },
          { label: 'DECAY', value: formatDecay(parameters.decayTime), size: 'large' },
        ]}
        logo="LEXI LOVE"
      />
      <div className="carbon-progress-bar" style={{ marginTop: 4 }}>
        <div
          className="carbon-progress-fill"
          style={{ width: `${Math.min(100, (parameters.decayTime / 10) * 100)}%`, background: accentColor }}
        />
      </div>
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'algorithm',
      title: 'Algorithm',
      icon: <SettingsAdjust size={16} />,
      defaultOpen: true,
      children: (
        <div className="carbon-preset-row" style={{ flexWrap: 'wrap' }}>
          {algorithms.map((alg) => (
            <button
              key={alg.index}
              className={`carbon-preset-btn ${parameters.algorithm === alg.index ? 'carbon-preset-btn--active' : ''}`}
              onClick={() => setAlgorithm(alg.index)}
              title={alg.description}
            >
              {alg.shortName}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'early-reflections',
      title: 'Early Reflections',
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="ER Level" value={parameters.earlyLevel}
            min={0} max={100} defaultValue={70} unit="%"
            onChange={setEarlyLevel} accentColor={accentColor} size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.EARLY_LEVEL }}
          />
          <ParameterKnob
            label="ER Density" value={parameters.earlyPattern}
            min={0} max={100} defaultValue={50} unit="%"
            onChange={setEarlyPattern} accentColor={accentColor} size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.EARLY_PATTERN }}
          />
        </div>
      ),
    },
    {
      id: 'modulation',
      title: 'Modulation (Sparkle)',
      icon: <Activity size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Depth" value={parameters.modDepth}
            min={0} max={100} defaultValue={15} unit="%"
            onChange={setModDepth} accentColor={accentColor} size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.MOD_DEPTH }}
          />
          <ParameterKnob
            label="Rate" value={parameters.modRate}
            min={0.1} max={10} defaultValue={0.8} unit="Hz"
            onChange={setModRate} isLogarithmic accentColor={accentColor} size="small"
            midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.MOD_RATE }}
          />
        </div>
      ),
    },
    {
      id: 'tone-shaping',
      title: 'Tone Shaping',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Lo Decay" value={parameters.lowDecayMult}
              min={0.25} max={2} defaultValue={1} unit="x"
              onChange={setLowDecayMult} accentColor={accentColor} size="small"
              midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.LOW_DECAY_MULT }}
            />
            <ParameterKnob
              label="Hi Decay" value={parameters.highDecayMult}
              min={0.25} max={2} defaultValue={0.8} unit="x"
              onChange={setHighDecayMult} accentColor={accentColor} size="small"
              midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.HIGH_DECAY_MULT }}
            />
          </div>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Lo Xover" value={parameters.lowCrossover}
              min={100} max={2000} defaultValue={500} unit=""
              valueFormatter={formatFreq}
              onChange={setLowCrossover} isLogarithmic accentColor={accentColor} size="small"
              midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.LOW_CROSSOVER }}
            />
            <ParameterKnob
              label="Hi Xover" value={parameters.highCrossover}
              min={2000} max={15000} defaultValue={9000} unit=""
              valueFormatter={formatFreq}
              onChange={setHighCrossover} isLogarithmic accentColor={accentColor} size="small"
              midi={{ pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.HIGH_CROSSOVER }}
            />
          </div>
          <div className="carbon-param-row">
            <button
              className={`carbon-toggle-btn ${parameters.spillover ? 'active' : ''}`}
              onClick={() => setSpillover(!parameters.spillover)}
              style={parameters.spillover ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              Spillover
            </button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <ReverbCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={lcdVisualization}
      preDelay={{
        label: 'Pre-Delay', value: parameters.preDelay,
        min: 0, max: 500, defaultValue: 40, unit: 'ms',
        onChange: setPreDelay,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.PRE_DELAY },
      }}
      decay={{
        label: 'Decay', value: parameters.decayTime,
        min: 0.5, max: 30, defaultValue: 2.5, unit: 's',
        onChange: setDecayTime, isLogarithmic: true,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.DECAY_TIME },
      }}
      diffusion={{
        label: 'Diffusion', value: parameters.diffusion,
        min: 0, max: 100, defaultValue: 85, unit: '%',
        onChange: setDiffusion,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.DIFFUSION },
      }}
      damping={{
        label: 'Hi Cut', value: parameters.highCut,
        min: 1000, max: 20000, defaultValue: 12000, unit: '',
        valueFormatter: formatFreq,
        onChange: setHighCut, isLogarithmic: true,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.HIGH_CUT },
      }}
      lowCut={{
        label: 'Lo Cut', value: parameters.lowCut,
        min: 20, max: 500, defaultValue: 80, unit: '',
        valueFormatter: formatFreq,
        onChange: setLowCut, isLogarithmic: true,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.LOW_CUT },
      }}
      mix={{
        label: 'Mix', value: parameters.mix,
        min: 0, max: 100, defaultValue: 35, unit: '%',
        onChange: setMix,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.MIX },
      }}
      earlyLevel={{
        label: 'ER Level', value: parameters.earlyLevel,
        min: 0, max: 100, defaultValue: 70, unit: '%',
        onChange: setEarlyLevel,
        midi: { pluginUri: LEXI_LOVE_URI, paramIndex: PARAM.EARLY_LEVEL },
      }}
      inputLevel={metering.inputLevelL}
      outputLevel={metering.outputLevelL}
      advancedSections={advancedSections}
      cardWidth={700}
    />
  )
}

export { LexiLoveCardBase as LexiLoveCard }
export default withMidiDialog(LexiLoveCardBase, LEXI_LOVE_URI, LEXI_LOVE_PARAMS)
