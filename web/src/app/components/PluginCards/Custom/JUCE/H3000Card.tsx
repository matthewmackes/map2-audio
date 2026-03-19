import { useH3000, H3000_ALGORITHMS } from '../../../../hooks/useH3000'
import { PitchCategoryLayout } from '../../Layouts/PitchCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { formatPitch, formatFreq } from '../../utils/formatters'
import { VFDPitchDisplay } from '../../components/Visualizations/LCDDisplay'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { Activity, SettingsAdjust, VolumeUpFilled } from '@carbon/icons-react'

const H3000_URI = 'map2://juce/pitch/h3000'

const PARAM = {
  ALGORITHM: 0, PITCH_L: 1, PITCH_R: 2, DELAY_L: 3, DELAY_R: 4,
  FEEDBACK: 5, CROSS_FEEDBACK: 6, MOD_DEPTH: 7, MOD_RATE: 8,
  LOW_CUT: 9, HIGH_CUT: 10, MIX: 11, LEVEL_L: 12, LEVEL_R: 13, GLIDE: 14,
} as const

const H3000_PARAMS: PluginParamDef[] = [
  { index: PARAM.ALGORITHM, name: 'Algorithm', symbol: 'algorithm' },
  { index: PARAM.PITCH_L, name: 'Pitch L', symbol: 'pitchL' },
  { index: PARAM.PITCH_R, name: 'Pitch R', symbol: 'pitchR' },
  { index: PARAM.DELAY_L, name: 'Delay L', symbol: 'delayL' },
  { index: PARAM.DELAY_R, name: 'Delay R', symbol: 'delayR' },
  { index: PARAM.FEEDBACK, name: 'Feedback', symbol: 'feedback' },
  { index: PARAM.CROSS_FEEDBACK, name: 'Cross Feedback', symbol: 'crossFeedback' },
  { index: PARAM.MOD_DEPTH, name: 'Mod Depth', symbol: 'modDepth' },
  { index: PARAM.MOD_RATE, name: 'Mod Rate', symbol: 'modRate' },
  { index: PARAM.LOW_CUT, name: 'Low Cut', symbol: 'lowCut' },
  { index: PARAM.HIGH_CUT, name: 'High Cut', symbol: 'highCut' },
  { index: PARAM.MIX, name: 'Mix', symbol: 'mix' },
  { index: PARAM.LEVEL_L, name: 'Level L', symbol: 'levelL' },
  { index: PARAM.LEVEL_R, name: 'Level R', symbol: 'levelR' },
  { index: PARAM.GLIDE, name: 'Glide', symbol: 'glide' },
]

interface H3000CardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function H3000CardBase({
  plugin,
  accentColor = '#00aaff',
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

  const vfdVisualization = (
    <VFDPitchDisplay
      algorithmName={currentAlgorithm.name}
      pitchL={formatPitch(parameters.pitchL)}
      pitchR={formatPitch(parameters.pitchR)}
      meterLevel={(metering.inputLevelL + 60) * 1.67}
      accentColor={accentColor}
    />
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
      id: 'delay',
      title: 'Delay',
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Delay L" value={parameters.delayL}
            min={0} max={1000} defaultValue={15} unit="ms"
            onChange={setDelayL} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.DELAY_L }}
          />
          <ParameterKnob
            label="Delay R" value={parameters.delayR}
            min={0} max={1000} defaultValue={20} unit="ms"
            onChange={setDelayR} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.DELAY_R }}
          />
          <ParameterKnob
            label="X-Feed" value={parameters.crossFeedback}
            min={0} max={100} defaultValue={0} unit="%"
            onChange={setCrossFeedback} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.CROSS_FEEDBACK }}
          />
        </div>
      ),
    },
    {
      id: 'modulation',
      title: 'Modulation',
      icon: <Activity size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Depth" value={parameters.modDepth}
            min={0} max={100} defaultValue={0} unit="%"
            onChange={setModDepth} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.MOD_DEPTH }}
          />
          <ParameterKnob
            label="Rate" value={parameters.modRate}
            min={0.1} max={10} defaultValue={0.5} unit="Hz"
            onChange={setModRate} isLogarithmic accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.MOD_RATE }}
          />
        </div>
      ),
    },
    {
      id: 'filter',
      title: 'Filter',
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Low Cut" value={parameters.lowCut}
            min={20} max={500} defaultValue={80} unit=""
            valueFormatter={formatFreq}
            onChange={setLowCut} isLogarithmic accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.LOW_CUT }}
          />
          <ParameterKnob
            label="High Cut" value={parameters.highCut}
            min={2000} max={20000} defaultValue={12000} unit=""
            valueFormatter={formatFreq}
            onChange={setHighCut} isLogarithmic accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.HIGH_CUT }}
          />
        </div>
      ),
    },
    {
      id: 'levels',
      title: 'Levels',
      icon: <VolumeUpFilled size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Level L" value={parameters.levelL}
            min={0} max={100} defaultValue={100} unit="%"
            onChange={setLevelL} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.LEVEL_L }}
          />
          <ParameterKnob
            label="Level R" value={parameters.levelR}
            min={0} max={100} defaultValue={100} unit="%"
            onChange={setLevelR} accentColor={accentColor} size="small"
            midi={{ pluginUri: H3000_URI, paramIndex: PARAM.LEVEL_R }}
          />
        </div>
      ),
    },
  ]

  return (
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={vfdVisualization}
      semitones={{
        label: 'Pitch L', value: parameters.pitchL,
        min: -2400, max: 2400, defaultValue: 0, unit: 'c',
        valueFormatter: formatPitch,
        onChange: setPitchL,
        midi: { pluginUri: H3000_URI, paramIndex: PARAM.PITCH_L },
      }}
      cents={{
        label: 'Pitch R', value: parameters.pitchR,
        min: -2400, max: 2400, defaultValue: 0, unit: 'c',
        valueFormatter: formatPitch,
        onChange: setPitchR,
        midi: { pluginUri: H3000_URI, paramIndex: PARAM.PITCH_R },
      }}
      glide={{
        label: 'Glide', value: parameters.glide,
        min: 0, max: 1000, defaultValue: 0, unit: 'ms',
        onChange: setGlide,
        midi: { pluginUri: H3000_URI, paramIndex: PARAM.GLIDE },
      }}
      feedback={{
        label: 'Feedback', value: parameters.feedback,
        min: 0, max: 100, defaultValue: 0, unit: '%',
        onChange: setFeedback,
        midi: { pluginUri: H3000_URI, paramIndex: PARAM.FEEDBACK },
      }}
      mix={{
        label: 'Mix', value: parameters.mix,
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: setMix,
        midi: { pluginUri: H3000_URI, paramIndex: PARAM.MIX },
      }}
      inputLevel={metering.inputLevelL}
      outputLevel={metering.outputLevelL}
      advancedSections={advancedSections}
    />
  )
}

export { H3000CardBase as H3000Card }
export default withMidiDialog(H3000CardBase, H3000_URI, H3000_PARAMS)
