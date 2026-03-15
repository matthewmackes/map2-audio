/**
 * PluginOutputPanel - Carbon-aligned visualization surface for plugin outputs.
 *
 * Duplication removed in the Carbon rebuild:
 * - bespoke header chrome -> Layer + Tile + Tag + Button
 * - inline styles for per-port readouts -> tokenized CSS classes
 * - ad hoc capability badges -> Carbon Tags
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Layer, ProgressBar, Tag, Tile } from '@carbon/react'
import { Activity, ChartLine, ChevronDown, ChevronUp, Music } from '@carbon/icons-react'
import { AudioMeter, GainReductionMeter } from './AudioMeter'
import { TunerDisplay, TunerData } from './TunerDisplay'
import { SpectrumAnalyzer, SpectrumData } from './SpectrumAnalyzer'
import { usePluginOutput } from '../hooks/usePluginOutputs'
import type { OutputPort, PeakData, PluginUIInfo } from '../../map2/types'
import { sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import './PluginOutputPanel.css'

export interface PluginOutputData {
  uri: string
  peakData?: Record<string, PeakData>
  outputPortValues?: Record<number, number>
  tunerData?: TunerData
  spectrumData?: SpectrumData
}

export interface PluginOutputPanelProps {
  pluginUri: string
  pluginName?: string
  uiInfo: PluginUIInfo
  data?: PluginOutputData
  expanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  variant?: 'inline' | 'panel' | 'floating'
  style?: React.CSSProperties
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function normalizeValue(value: number, port: OutputPort) {
  const range = port.max_value - port.min_value
  if (!Number.isFinite(range) || range <= 0) {
    return 0
  }
  return clamp((value - port.min_value) / range)
}

function capabilityTags(hasMeters: boolean, hasTuner: boolean, hasSpectrum: boolean) {
  return [
    hasMeters ? { key: 'meters', label: 'Meters', type: 'green' as const } : null,
    hasTuner ? { key: 'tuner', label: 'Tuner', type: 'teal' as const } : null,
    hasSpectrum ? { key: 'spectrum', label: 'Spectrum', type: 'blue' as const } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; type: 'green' | 'teal' | 'blue' }>
}

function formatValue(value: number, port: OutputPort) {
  if (port.designation === 'latency') {
    return `${value.toFixed(0)} smp`
  }

  return value.toFixed(port.is_logarithmic ? 1 : 2)
}

function OutputPortMeter({
  port,
  value,
  variant = 'panel',
}: {
  port: OutputPort
  value: number
  variant?: 'inline' | 'panel'
}) {
  const normalizedValue = normalizeValue(value, port)
  const compact = variant === 'inline'
  const title = sanitizeRestrictedDisplayText(port.name) || `Port ${port.index}`

  if (port.designation === 'meter') {
    return (
      <div className={`plugin-output-panel__meter plugin-output-panel__meter--${variant}`}>
        <AudioMeter
          peak={normalizedValue}
          orientation="vertical"
          size={compact ? 12 : 20}
          length={compact ? 64 : 120}
          showScale={!compact}
          showValue={!compact}
          label={title.substring(0, compact ? 6 : 10)}
          variant={compact ? 'mini' : 'compact'}
        />
      </div>
    )
  }

  if (port.designation === 'gain_reduction') {
    return (
      <div className={`plugin-output-panel__meter plugin-output-panel__meter--${variant}`}>
        <GainReductionMeter
          gainReduction={Math.abs(value)}
          maxReduction={Math.abs(port.min_value)}
          orientation="vertical"
          size={compact ? 12 : 16}
          length={compact ? 64 : 100}
          showValue={!compact}
        />
      </div>
    )
  }

  return (
    <div className={`plugin-output-panel__readout plugin-output-panel__readout--${variant}`}>
      <span className="plugin-output-panel__readout-label">{title}</span>
      {port.designation === 'envelope' ? (
        <ProgressBar
          className="plugin-output-panel__progress"
          label=""
          helperText=""
          hideLabel
          max={100}
          value={Math.round(normalizedValue * 100)}
          status="active"
        />
      ) : null}
      <span className="plugin-output-panel__readout-value">{formatValue(value, port)}</span>
    </div>
  )
}

function EmptyVisualization({ message }: { message: string }) {
  return (
    <div className="plugin-output-panel__empty">
      <Activity size={20} />
      <span>{message}</span>
    </div>
  )
}

function OutputPanelBody({
  data,
  hasSpectrum,
  hasTuner,
  meterPorts,
  grPorts,
  otherPorts,
}: {
  data?: PluginOutputData
  hasSpectrum: boolean
  hasTuner: boolean
  meterPorts: OutputPort[]
  grPorts: OutputPort[]
  otherPorts: OutputPort[]
}) {
  return (
    <div className="plugin-output-panel__body">
      {hasTuner ? (
        <div className="plugin-output-panel__feature">
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
      ) : null}

      {hasSpectrum && data?.spectrumData ? (
        <div className="plugin-output-panel__feature">
          <SpectrumAnalyzer
            data={data.spectrumData}
            width={280}
            height={120}
            mode="bars"
          />
        </div>
      ) : null}

      {meterPorts.length > 0 || grPorts.length > 0 ? (
        <div className="plugin-output-panel__meters">
          {meterPorts.map((port) => (
            <OutputPortMeter
              key={port.index}
              port={port}
              value={data?.outputPortValues?.[port.index] ?? port.min_value}
              variant="panel"
            />
          ))}
          {grPorts.map((port) => (
            <OutputPortMeter
              key={port.index}
              port={port}
              value={data?.outputPortValues?.[port.index] ?? 0}
              variant="panel"
            />
          ))}
        </div>
      ) : null}

      {otherPorts.length > 0 ? (
        <div className="plugin-output-panel__readouts">
          {otherPorts.map((port) => (
            <OutputPortMeter
              key={port.index}
              port={port}
              value={data?.outputPortValues?.[port.index] ?? port.min_value}
              variant="panel"
            />
          ))}
        </div>
      ) : null}

      {!hasTuner && !hasSpectrum && meterPorts.length === 0 && grPorts.length === 0 && otherPorts.length === 0 ? (
        <EmptyVisualization message="No visualizations available" />
      ) : null}
    </div>
  )
}

export const PluginOutputPanel: React.FC<PluginOutputPanelProps> = ({
  pluginName,
  uiInfo,
  data,
  expanded = true,
  onExpandChange,
  variant = 'panel',
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded)
  const displayPluginName = sanitizeRestrictedDisplayText(pluginName) || 'Output'

  useEffect(() => {
    setIsExpanded(expanded)
  }, [expanded])

  const handleToggleExpand = useCallback(() => {
    const nextExpanded = !isExpanded
    setIsExpanded(nextExpanded)
    onExpandChange?.(nextExpanded)
  }, [isExpanded, onExpandChange])

  const { output_ports, has_tuner, has_spectrum, has_meters } = uiInfo
  const hasContent = output_ports.length > 0 || has_tuner || has_spectrum
  const meterPorts = output_ports.filter((port) => port.designation === 'meter')
  const grPorts = output_ports.filter((port) => port.designation === 'gain_reduction')
  const otherPorts = output_ports.filter((port) => !['meter', 'gain_reduction'].includes(port.designation))
  const tags = capabilityTags(has_meters, has_tuner, has_spectrum)

  if (!hasContent) {
    return null
  }

  if (variant === 'inline') {
    return (
      <Layer className="plugin-output-panel__layer plugin-output-panel__layer--inline">
        <Tile className="plugin-output-panel plugin-output-panel--inline">
          <div className="plugin-output-panel__inline-header">
            <span className="plugin-output-panel__title">{displayPluginName}</span>
            <div className="plugin-output-panel__tags">
              {tags.map((tag) => (
                <Tag key={tag.key} type={tag.type}>
                  {tag.label}
                </Tag>
              ))}
            </div>
          </div>
          <div className="plugin-output-panel__inline-body">
            {meterPorts.slice(0, 2).map((port) => (
              <OutputPortMeter
                key={port.index}
                port={port}
                value={data?.outputPortValues?.[port.index] ?? port.min_value}
                variant="inline"
              />
            ))}
            {grPorts.slice(0, 1).map((port) => (
              <OutputPortMeter
                key={port.index}
                port={port}
                value={data?.outputPortValues?.[port.index] ?? 0}
                variant="inline"
              />
            ))}
          </div>
        </Tile>
      </Layer>
    )
  }

  return (
    <Layer className={`plugin-output-panel__layer plugin-output-panel__layer--${variant}`}>
      <Tile
        className={`plugin-output-panel plugin-output-panel--${variant}`}
        role={variant === 'floating' ? 'dialog' : undefined}
        aria-label={displayPluginName}
      >
        <div className="plugin-output-panel__header">
          <div className="plugin-output-panel__header-copy">
            <div className="plugin-output-panel__title-row">
              <span className="plugin-output-panel__title">{displayPluginName}</span>
              <div className="plugin-output-panel__tags">
                {has_meters ? (
                  <Tag type="green" renderIcon={Activity}>
                    Meters
                  </Tag>
                ) : null}
                {has_tuner ? (
                  <Tag type="teal" renderIcon={Music}>
                    Tuner
                  </Tag>
                ) : null}
                {has_spectrum ? (
                  <Tag type="blue" renderIcon={ChartLine}>
                    Spectrum
                  </Tag>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription={isExpanded ? 'Collapse output panel' : 'Expand output panel'}
            renderIcon={isExpanded ? ChevronUp : ChevronDown}
            onClick={handleToggleExpand}
          />
        </div>

        {isExpanded ? (
          <OutputPanelBody
            data={data}
            hasSpectrum={has_spectrum}
            hasTuner={has_tuner}
            meterPorts={meterPorts}
            grPorts={grPorts}
            otherPorts={otherPorts}
          />
        ) : (
          <div className="plugin-output-panel__collapsed">
            <Tag type="cool-gray">Panel collapsed</Tag>
          </div>
        )}
      </Tile>
    </Layer>
  )
}

/**
 * Hook for subscribing to plugin output data via WebSocket
 */
export const usePluginOutputData = (pluginUri: string): PluginOutputData => {
  const { peaks, outputPorts, tuner, spectrum } = usePluginOutput(pluginUri)

  return useMemo(() => {
    const tunerData: TunerData | undefined = tuner ? {
      frequencyHz: tuner.frequency_hz,
      noteName: tuner.note_name,
      octave: tuner.octave,
      centsDeviation: tuner.cents_deviation,
      confidence: tuner.confidence,
    } : undefined

    const spectrumData: SpectrumData | undefined = spectrum ? {
      magnitudes: spectrum.magnitudes,
      frequencies: spectrum.frequencies,
      sampleRate: spectrum.sample_rate,
      binCount: spectrum.bin_count,
    } : undefined

    return {
      uri: pluginUri,
      peakData: peaks,
      outputPortValues: outputPorts,
      tunerData,
      spectrumData,
    }
  }, [pluginUri, peaks, outputPorts, tuner, spectrum])
}

export default PluginOutputPanel
