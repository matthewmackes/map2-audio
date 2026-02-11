/**
 * PluginOutputPanel - Smart Visualization Panel for Plugin Outputs
 *
 * Automatically detects and renders appropriate visualizations based on:
 * - Output control ports (meters, gain reduction, envelope)
 * - Tuner data (for analyser plugins)
 * - Spectrum data (for FFT plugins)
 * - Peak meter data (for audio ports)
 *
 * Supports multiple plugin formats (VST3, AU, LV2, LADSPA) through
 * unified output port protocols:
 * - floatProtocol for control ports
 * - peakProtocol for audio levels
 * - atomTransfer for structured data
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AudioMeter, GainReductionMeter } from './AudioMeter';
import { TunerDisplay, TunerData } from './TunerDisplay';
import { SpectrumAnalyzer, SpectrumData } from './SpectrumAnalyzer';
import { usePluginOutput } from '../hooks/usePluginOutputs';
import type {
  OutputPort,
  PluginUIInfo,
  PeakData
} from '../../map2/types';

// Icons
import { 
  Activity, 
  Radio, 
  ChartBar, 
  Eye,
  EyeSlash
} from '@phosphor-icons/react';

export interface PluginOutputData {
  uri: string;
  peakData?: Record<string, PeakData>;
  outputPortValues?: Record<number, number>;
  tunerData?: TunerData;
  spectrumData?: SpectrumData;
}

export interface PluginOutputPanelProps {
  /** Plugin URI */
  pluginUri: string;
  /** Plugin name for display */
  pluginName?: string;
  /** UI info with output ports and capabilities */
  uiInfo: PluginUIInfo;
  /** Real-time output data */
  data?: PluginOutputData;
  /** Whether the panel is expanded */
  expanded?: boolean;
  /** Callback when expand state changes */
  onExpandChange?: (expanded: boolean) => void;
  /** Display variant */
  variant?: 'inline' | 'panel' | 'floating';
  /** Custom styles */
  style?: React.CSSProperties;
}

// Component for rendering a single output port meter
const OutputPortMeter: React.FC<{
  port: OutputPort;
  value: number;
  variant?: 'inline' | 'panel';
}> = ({ port, value, variant = 'panel' }) => {
  const { name, min_value, max_value, designation, is_logarithmic } = port;
  
  // Normalize value to 0-1 range
  const normalizedValue = (value - min_value) / (max_value - min_value);
  
  // Determine visualization based on designation
  switch (designation) {
    case 'meter':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <AudioMeter
            peak={normalizedValue}
            orientation="vertical"
            size={variant === 'inline' ? 12 : 20}
            length={variant === 'inline' ? 60 : 120}
            showScale={variant === 'panel'}
            showValue={variant === 'panel'}
            label={name.substring(0, 8)}
            variant={variant === 'inline' ? 'mini' : 'compact'}
          />
        </div>
      );
      
    case 'gain_reduction':
      return (
        <GainReductionMeter
          gainReduction={Math.abs(value)}
          maxReduction={Math.abs(min_value)}
          orientation="vertical"
          size={variant === 'inline' ? 12 : 16}
          length={variant === 'inline' ? 60 : 100}
          showValue={variant === 'panel'}
        />
      );
      
    case 'envelope':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            {name.substring(0, 6)}
          </span>
          <div
            style={{
              width: variant === 'inline' ? 30 : 50,
              height: variant === 'inline' ? 30 : 50,
              borderRadius: '50%',
              background: `conic-gradient(
                #22c55e ${normalizedValue * 360}deg,
                rgba(255,255,255,0.1) ${normalizedValue * 360}deg
              )`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: variant === 'inline' ? 8 : 10,
                fontFamily: 'monospace',
                color: '#f3f4f6',
              }}
            >
              {(normalizedValue * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      );
      
    case 'latency':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Latency
          </span>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#3b82f6' }}>
            {value.toFixed(0)} smp
          </span>
        </div>
      );
      
    default:
      // Generic numeric display
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            {name.substring(0, 8)}
          </span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
            {value.toFixed(is_logarithmic ? 1 : 2)}
          </span>
        </div>
      );
  }
};

// Empty state component
const EmptyVisualization: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      color: 'rgba(255, 255, 255, 0.3)',
      gap: 8,
    }}
  >
    <Activity size={24} weight="duotone" />
    <span style={{ fontSize: 11 }}>{message}</span>
  </div>
);

export const PluginOutputPanel: React.FC<PluginOutputPanelProps> = ({
  pluginUri,
  pluginName,
  uiInfo,
  data,
  expanded = true,
  onExpandChange,
  variant = 'panel',
  style,
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  
  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded]);
  
  const handleToggleExpand = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandChange?.(newState);
  }, [isExpanded, onExpandChange]);
  
  const { output_ports, has_tuner, has_spectrum, has_meters } = uiInfo;
  
  // Determine what to show
  const hasContent = output_ports.length > 0 || has_tuner || has_spectrum;
  
  // Group output ports by designation
  const meterPorts = output_ports.filter(p => p.designation === 'meter');
  const grPorts = output_ports.filter(p => p.designation === 'gain_reduction');
  const otherPorts = output_ports.filter(p => 
    !['meter', 'gain_reduction'].includes(p.designation)
  );
  
  if (!hasContent) {
    return null;
  }
  
  // Inline variant - minimal display
  if (variant === 'inline') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 6,
          ...style,
        }}
      >
        {/* Show first meter port */}
        {meterPorts.slice(0, 2).map(port => (
          <OutputPortMeter
            key={port.index}
            port={port}
            value={data?.outputPortValues?.[port.index] ?? port.min_value}
            variant="inline"
          />
        ))}
        
        {/* Show GR meter if present */}
        {grPorts.slice(0, 1).map(port => (
          <OutputPortMeter
            key={port.index}
            port={port}
            value={data?.outputPortValues?.[port.index] ?? 0}
            variant="inline"
          />
        ))}
        
        {/* Indicator icons for available visualizations */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          {has_tuner && <Radio size={12} weight="duotone" style={{ color: '#22c55e' }} />}
          {has_spectrum && <ChartBar size={12} weight="duotone" style={{ color: '#3b82f6' }} />}
        </div>
      </div>
    );
  }
  
  // Panel and floating variants
  return (
    <div
      style={{
        background: variant === 'floating' 
          ? 'rgba(15, 15, 20, 0.98)' 
          : 'rgba(20, 20, 25, 0.9)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        boxShadow: variant === 'floating' 
          ? '0 8px 32px rgba(0, 0, 0, 0.5)' 
          : 'none',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(0, 0, 0, 0.2)',
          cursor: 'pointer',
        }}
        onClick={handleToggleExpand}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} weight="duotone" style={{ color: '#22c55e' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
            {pluginName || 'Output'}
          </span>
          
          {/* Capability badges */}
          <div style={{ display: 'flex', gap: 4 }}>
            {has_meters && (
              <span 
                style={{ 
                  fontSize: 8, 
                  padding: '2px 6px', 
                  background: 'rgba(34, 197, 94, 0.2)', 
                  color: '#22c55e',
                  borderRadius: 4,
                }}
              >
                METERS
              </span>
            )}
            {has_tuner && (
              <span 
                style={{ 
                  fontSize: 8, 
                  padding: '2px 6px', 
                  background: 'rgba(59, 130, 246, 0.2)', 
                  color: '#3b82f6',
                  borderRadius: 4,
                }}
              >
                TUNER
              </span>
            )}
            {has_spectrum && (
              <span 
                style={{ 
                  fontSize: 8, 
                  padding: '2px 6px', 
                  background: 'rgba(37, 99, 235, 0.2)', 
                  color: '#60a5fa',
                  borderRadius: 4,
                }}
              >
                SPECTRUM
              </span>
            )}
          </div>
        </div>
        
        <button
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          {isExpanded ? <EyeSlash size={14} weight="duotone" /> : <Eye size={14} weight="duotone" />}
        </button>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div style={{ padding: 12 }}>
          {/* Tuner display */}
          {has_tuner && (
            <div style={{ marginBottom: 12 }}>
              <TunerDisplay
                data={data?.tunerData ?? {
                  frequencyHz: 0,
                  noteName: 'A',
                  octave: 4,
                  centsDeviation: 0,
                  confidence: 0,
                }}
                variant="default"
              />
            </div>
          )}
          
          {/* Spectrum display */}
          {has_spectrum && data?.spectrumData && (
            <div style={{ marginBottom: 12 }}>
              <SpectrumAnalyzer
                data={data.spectrumData}
                width={280}
                height={120}
                mode="bars"
              />
            </div>
          )}
          
          {/* Meters row */}
          {(meterPorts.length > 0 || grPorts.length > 0) && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: otherPorts.length > 0 ? 12 : 0,
              }}
            >
              {/* Level meters */}
              {meterPorts.map(port => (
                <OutputPortMeter
                  key={port.index}
                  port={port}
                  value={data?.outputPortValues?.[port.index] ?? port.min_value}
                  variant="panel"
                />
              ))}
              
              {/* Gain reduction meters */}
              {grPorts.map(port => (
                <OutputPortMeter
                  key={port.index}
                  port={port}
                  value={data?.outputPortValues?.[port.index] ?? 0}
                  variant="panel"
                />
              ))}
            </div>
          )}
          
          {/* Other output ports */}
          {otherPorts.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap',
                padding: '8px 0',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {otherPorts.map(port => (
                <OutputPortMeter
                  key={port.index}
                  port={port}
                  value={data?.outputPortValues?.[port.index] ?? port.min_value}
                  variant="panel"
                />
              ))}
            </div>
          )}
          
          {/* Empty state */}
          {!has_tuner && !has_spectrum && output_ports.length === 0 && (
            <EmptyVisualization message="No visualizations available" />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Hook for subscribing to plugin output data via WebSocket
 */
export const usePluginOutputData = (pluginUri: string): PluginOutputData => {
  const { peaks, outputPorts, tuner, spectrum } = usePluginOutput(pluginUri);

  return useMemo(() => {
    // Convert snake_case tuner data to camelCase for TunerDisplay component
    const tunerData: TunerData | undefined = tuner ? {
      frequencyHz: tuner.frequency_hz,
      noteName: tuner.note_name,
      octave: tuner.octave,
      centsDeviation: tuner.cents_deviation,
      confidence: tuner.confidence,
    } : undefined;

    // Convert snake_case spectrum data to camelCase for SpectrumAnalyzer component
    const spectrumData: SpectrumData | undefined = spectrum ? {
      magnitudes: spectrum.magnitudes,
      frequencies: spectrum.frequencies,
      sampleRate: spectrum.sample_rate,
      binCount: spectrum.bin_count,
    } : undefined;

    return {
      uri: pluginUri,
      peakData: peaks,
      outputPortValues: outputPorts,
      tunerData,
      spectrumData,
    };
  }, [pluginUri, peaks, outputPorts, tuner, spectrum]);
};

export default PluginOutputPanel;
