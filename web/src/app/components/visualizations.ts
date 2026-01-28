/**
 * Plugin Visualization Components
 *
 * Modern components for displaying audio plugin output data:
 * - AudioMeter, StereoMeter, GainReductionMeter - Level metering
 * - TunerDisplay - Guitar/instrument tuner
 * - SpectrumAnalyzer - FFT spectrum visualization
 * - PluginOutputPanel - Smart auto-rendering panel
 *
 * Supports all plugin formats (VST3, AU, LV2, LADSPA)
 */

export { 
  AudioMeter, 
  StereoMeter, 
  GainReductionMeter 
} from './AudioMeter';

export type { 
  AudioMeterProps, 
  StereoMeterProps, 
  GainReductionMeterProps 
} from './AudioMeter';

export { 
  TunerDisplay 
} from './TunerDisplay';

export type { 
  TunerDisplayProps,
  TunerData 
} from './TunerDisplay';

export { 
  SpectrumAnalyzer, 
  MiniSpectrum 
} from './SpectrumAnalyzer';

export type { 
  SpectrumAnalyzerProps, 
  MiniSpectrumProps,
  SpectrumData,
  VisualizationMode 
} from './SpectrumAnalyzer';

export { 
  PluginOutputPanel,
  usePluginOutputData 
} from './PluginOutputPanel';

export type { 
  PluginOutputPanelProps,
  PluginOutputData 
} from './PluginOutputPanel';
