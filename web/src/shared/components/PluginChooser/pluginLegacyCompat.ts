// ============================================================================
// PluginChooser - Legacy PiPedal compatibility surface
// Minimal type/icon helpers needed while MAP2 retires the old web/src/pipedal tree.
// ============================================================================

export enum PluginType {
  None = '',
  InvalidPlugin = 'InvalidPlugin',
  NamPlugin = 'NamPlugin',
  Plugin = 'Plugin',
  AllpassPlugin = 'AllpassPlugin',
  AmplifierPlugin = 'AmplifierPlugin',
  AnalyserPlugin = 'AnalyserPlugin',
  BandpassPlugin = 'BandpassPlugin',
  ChorusPlugin = 'ChorusPlugin',
  CombPlugin = 'CombPlugin',
  CompressorPlugin = 'CompressorPlugin',
  ConstantPlugin = 'ConstantPlugin',
  ConverterPlugin = 'ConverterPlugin',
  DelayPlugin = 'DelayPlugin',
  DistortionPlugin = 'DistortionPlugin',
  DynamicsPlugin = 'DynamicsPlugin',
  EQPlugin = 'EQPlugin',
  EnvelopePlugin = 'EnvelopePlugin',
  ExpanderPlugin = 'ExpanderPlugin',
  FilterPlugin = 'FilterPlugin',
  FlangerPlugin = 'FlangerPlugin',
  FunctionPlugin = 'FunctionPlugin',
  GatePlugin = 'GatePlugin',
  GeneratorPlugin = 'GeneratorPlugin',
  HighpassPlugin = 'HighpassPlugin',
  InstrumentPlugin = 'InstrumentPlugin',
  LimiterPlugin = 'LimiterPlugin',
  LowpassPlugin = 'LowpassPlugin',
  MixerPlugin = 'MixerPlugin',
  ModulatorPlugin = 'ModulatorPlugin',
  MultiEQPlugin = 'MultiEQPlugin',
  OscillatorPlugin = 'OscillatorPlugin',
  ParaEQPlugin = 'ParaEQPlugin',
  PhaserPlugin = 'PhaserPlugin',
  PitchPlugin = 'PitchPlugin',
  ReverbPlugin = 'ReverbPlugin',
  SimulatorPlugin = 'SimulatorPlugin',
  SpatialPlugin = 'SpatialPlugin',
  SpectralPlugin = 'SpectralPlugin',
  UtilityPlugin = 'UtilityPlugin',
  WaveshaperPlugin = 'WaveshaperPlugin',
  PiPedalAmpsNode = 'PiPedalAmpsNode',
  SplitA = 'SplitA',
  SplitB = 'SplitB',
  SplitMix = 'SplitMix',
  SplitLR = 'SplitLR',
  ErrorPlugin = 'ErrorPlugin',
  Terminal = 'Terminal',
}

export interface UiControl {
  name: string
  symbol: string
  default_value: number
  min_value: number
  max_value: number
  units?: string | null
  is_input: boolean
  isHidden?: () => boolean
}

export interface UiPlugin {
  uri: string
  name: string
  minorVersion: number
  microVersion: number
  plugin_type: PluginType
  plugin_display_type: string
  author_name: string
  author_homepage: string
  audio_inputs: number
  audio_outputs: number
  has_midi_input: number
  has_midi_output: number
  description: string
  controls: UiControl[]
  is_vst3: boolean
  modGui: unknown | null
}

export function pluginTypeFromCategory(category: string): PluginType {
  const categoryLower = category.toLowerCase()

  if (categoryLower.includes('compressor')) return PluginType.CompressorPlugin
  if (categoryLower.includes('dynamics')) return PluginType.CompressorPlugin
  if (categoryLower.includes('limiter')) return PluginType.LimiterPlugin
  if (categoryLower.includes('gate')) return PluginType.GatePlugin
  if (categoryLower.includes('delay')) return PluginType.DelayPlugin
  if (categoryLower.includes('reverb')) return PluginType.ReverbPlugin
  if (categoryLower.includes('distortion')) return PluginType.DistortionPlugin
  if (categoryLower.includes('amplifier') || categoryLower.includes('amp')) return PluginType.AmplifierPlugin
  if (categoryLower.includes('chorus')) return PluginType.ChorusPlugin
  if (categoryLower.includes('flanger')) return PluginType.FlangerPlugin
  if (categoryLower.includes('phaser')) return PluginType.PhaserPlugin
  if (categoryLower.includes('eq') || categoryLower.includes('equalizer')) return PluginType.EQPlugin
  if (categoryLower.includes('filter')) return PluginType.FilterPlugin
  if (categoryLower.includes('modulator')) return PluginType.ModulatorPlugin
  if (categoryLower.includes('simulator')) return PluginType.SimulatorPlugin
  if (categoryLower.includes('analyser') || categoryLower.includes('analyzer')) return PluginType.AnalyserPlugin
  if (categoryLower.includes('utility')) return PluginType.UtilityPlugin
  if (categoryLower.includes('generator')) return PluginType.GeneratorPlugin
  if (categoryLower.includes('instrument')) return PluginType.InstrumentPlugin
  if (categoryLower.includes('mixer')) return PluginType.MixerPlugin

  return PluginType.Plugin
}

interface PluginGlyph {
  label: string
  tone: string
}

const DEFAULT_GLYPH: PluginGlyph = {
  label: 'FX',
  tone: 'var(--cds-icon-primary, #525252)',
}

const GLYPHS: Partial<Record<PluginType, PluginGlyph>> = {
  [PluginType.AmplifierPlugin]: { label: 'AMP', tone: '#8a3ffc' },
  [PluginType.AnalyserPlugin]: { label: 'ANA', tone: '#0f62fe' },
  [PluginType.ChorusPlugin]: { label: 'CHR', tone: '#6929c4' },
  [PluginType.CompressorPlugin]: { label: 'CMP', tone: '#198038' },
  [PluginType.DelayPlugin]: { label: 'DLY', tone: '#0f62fe' },
  [PluginType.DistortionPlugin]: { label: 'DST', tone: '#d12771' },
  [PluginType.EQPlugin]: { label: 'EQ', tone: '#1192e8' },
  [PluginType.FilterPlugin]: { label: 'FLT', tone: '#005d5d' },
  [PluginType.FlangerPlugin]: { label: 'FLG', tone: '#7f3ae0' },
  [PluginType.GatePlugin]: { label: 'GTE', tone: '#198038' },
  [PluginType.GeneratorPlugin]: { label: 'GEN', tone: '#9f1853' },
  [PluginType.InstrumentPlugin]: { label: 'INS', tone: '#8a3800' },
  [PluginType.LimiterPlugin]: { label: 'LIM', tone: '#9f1853' },
  [PluginType.MixerPlugin]: { label: 'MIX', tone: '#525252' },
  [PluginType.ModulatorPlugin]: { label: 'MOD', tone: '#a56eff' },
  [PluginType.NamPlugin]: { label: 'NAM', tone: '#ee538b' },
  [PluginType.PhaserPlugin]: { label: 'PHS', tone: '#a56eff' },
  [PluginType.PitchPlugin]: { label: 'PIT', tone: '#ba4e00' },
  [PluginType.ReverbPlugin]: { label: 'REV', tone: '#5e32ca' },
  [PluginType.SimulatorPlugin]: { label: 'SIM', tone: '#8a3ffc' },
  [PluginType.SpatialPlugin]: { label: 'SPC', tone: '#4589ff' },
  [PluginType.SplitA]: { label: 'A', tone: '#0f62fe' },
  [PluginType.SplitB]: { label: 'B', tone: '#24a148' },
  [PluginType.SplitLR]: { label: 'LR', tone: '#525252' },
  [PluginType.SplitMix]: { label: 'MX', tone: '#525252' },
  [PluginType.Terminal]: { label: 'CLI', tone: '#161616' },
  [PluginType.UtilityPlugin]: { label: 'UTL', tone: '#525252' },
}

export function getPluginGlyph(pluginType: PluginType): PluginGlyph {
  return GLYPHS[pluginType] ?? DEFAULT_GLYPH
}
