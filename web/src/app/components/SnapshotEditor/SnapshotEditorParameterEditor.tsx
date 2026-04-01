import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Dropdown, Button, InlineLoading, Tag, Tile } from '@carbon/react'
import { Launch, Renew, SettingsAdjust, WarningAlt } from '@carbon/icons-react'
import { NumberInput } from '../ParameterControl'
import {
  generateParameterGroups,
  type StandardGroup,
} from '../PluginCards/types'
import { irApi } from '../../../map2/clients/assets'
import type { ChainPlugin, IRWaveformPreview, Plugin, PluginParameter } from '../../../map2/types'
import { getPluginAccentConfig } from '../../utils/pluginAccent'

export interface JuceGridParameterEditorProps {
  plugin: ChainPlugin | null
  meta: Plugin | null
  onParameterChange: (symbol: string, value: number) => void
  onParameterChangeEnd?: (symbol: string) => void
  onToggleBypass?: () => void
  useClassicMode?: boolean
  onRefreshPlugins?: () => void
  isRefreshing?: boolean
  touchMode?: boolean
}

const HARDWARE_ACCENT = '#c8a951'
const IR_PREVIEW_SAMPLE_COUNT = 192
const DROPDOWN_HINTS = ['mode', 'type', 'style', 'program', 'pattern', 'variation', 'quality', 'algorithm', 'wave', 'transport']
const GROUP_TITLES: Record<StandardGroup, string> = {
  INPUT: 'Input',
  OUTPUT: 'Output',
  TIMING: 'Timing',
  THRESHOLD: 'Threshold',
  FREQUENCY: 'Frequency',
  MODULATION: 'Modulation',
  SPATIAL: 'Spatial',
  MIX: 'Mix',
  OTHER: 'Other',
}

const SMART_CONTROL_HINTS = [
  'mix',
  'blend',
  'level',
  'gain',
  'drive',
  'amount',
  'depth',
  'rate',
  'time',
  'delay',
  'feedback',
  'tone',
  'color',
  'cutoff',
  'freq',
  'threshold',
  'ratio',
  'attack',
  'release',
]

const IR_PREVIEW_PLUGIN_TYPES: Record<string, 'cabinet' | 'reverb'> = {
  'map2://juce/convolution/cabinet': 'cabinet',
  'urn:map2:ir-cabinet': 'cabinet',
  'map2://juce/convolution/reverb': 'reverb',
  'urn:map2:ir-reverb': 'reverb',
}

interface DropdownOption {
  id: string
  label: string
  value: number
}

function isDiscreteIntegerParameter(parameter: PluginParameter): boolean {
  return Number.isInteger(parameter.min)
    && Number.isInteger(parameter.max)
    && Number.isFinite(parameter.min)
    && Number.isFinite(parameter.max)
}

function shouldUseDropdown(parameter: PluginParameter): boolean {
  if (parameter.is_toggled) {
    return true
  }

  if (!isDiscreteIntegerParameter(parameter)) {
    return false
  }

  const valueCount = Math.abs(parameter.max - parameter.min) + 1
  const token = `${parameter.name} ${parameter.symbol}`.toLowerCase()
  return valueCount <= 12 && DROPDOWN_HINTS.some((hint) => token.includes(hint))
}

function buildDropdownOptions(parameter: PluginParameter): DropdownOption[] {
  if (parameter.is_toggled) {
    return [
      { id: `${parameter.symbol}-off`, label: 'Off', value: 0 },
      { id: `${parameter.symbol}-on`, label: 'On', value: 1 },
    ]
  }

  const options: DropdownOption[] = []
  const start = Math.round(parameter.min)
  const end = Math.round(parameter.max)
  for (let value = start; value <= end; value += 1) {
    options.push({
      id: `${parameter.symbol}-${value}`,
      label: `${value}`,
      value,
    })
  }
  return options
}

function formatParameterReadout(parameter: PluginParameter, value: number): string {
  const token = `${parameter.name} ${parameter.symbol}`.toLowerCase()

  if (parameter.is_toggled) {
    return value > 0.5 ? 'On' : 'Off'
  }
  if (token.includes('db') || token.includes('gain') || token.includes('level') || token.includes('threshold')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  }
  if (token.includes('hz') || token.includes('freq') || token.includes('cutoff')) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value.toFixed(0)} Hz`
  }
  if (token.includes('ms') || token.includes('time') || token.includes('delay') || token.includes('attack') || token.includes('release')) {
    return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
  }
  if ((parameter.max === 1 && parameter.min === 0) || token.includes('mix') || token.includes('blend') || token.includes('wet') || token.includes('dry')) {
    const percent = parameter.max === 1 ? value * 100 : value
    return `${percent.toFixed(0)}%`
  }
  if (Number.isInteger(value)) {
    return `${value}`
  }
  return value.toFixed(2)
}

function getSmartControlScore(parameter: PluginParameter): number {
  const token = `${parameter.name} ${parameter.symbol}`.toLowerCase()
  let score = 0

  SMART_CONTROL_HINTS.forEach((hint, index) => {
    if (token.includes(hint)) {
      score += 24 - index
    }
  })

  if (parameter.is_toggled) {
    score += 10
  }

  if (shouldUseDropdown(parameter)) {
    score += 6
  }

  if (parameter.min === 0 && parameter.max === 1) {
    score += 5
  }

  return score
}

function formatIRPreviewDuration(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)} s`
  }

  return `${durationMs.toFixed(0)} ms`
}

function renderIRWaveformBars(preview: IRWaveformPreview) {
  const viewBoxWidth = 192
  const viewBoxHeight = 72
  const barWidth = viewBoxWidth / Math.max(preview.points.length, 1)

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      className="juce-grid-page__parameter-editor-ir-waveform"
      aria-label={`${preview.fileName} waveform preview`}
      role="img"
    >
      <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} rx="12" className="juce-grid-page__parameter-editor-ir-waveform-surface" />
      <line
        x1="0"
        y1={viewBoxHeight / 2}
        x2={viewBoxWidth}
        y2={viewBoxHeight / 2}
        className="juce-grid-page__parameter-editor-ir-waveform-axis"
      />
      {preview.points.map((point, index) => {
        const normalized = Math.max(0, Math.min(1, point))
        const height = Math.max(1.5, normalized * (viewBoxHeight - 12))
        const x = index * barWidth
        const y = (viewBoxHeight - height) / 2

        return (
          <rect
            key={`${preview.assetPath}-${index}`}
            x={x}
            y={y}
            width={Math.max(1, barWidth - 0.35)}
            height={height}
            rx="0.6"
            className="juce-grid-page__parameter-editor-ir-waveform-bar"
          />
        )
      })}
    </svg>
  )
}

export function JuceGridParameterEditor({
  plugin,
  meta,
  onParameterChange,
  onParameterChangeEnd,
  onToggleBypass,
  onRefreshPlugins,
  isRefreshing = false,
  touchMode = false,
}: JuceGridParameterEditorProps) {
  const [editingParams, setEditingParams] = useState<Set<string>>(new Set())
  const [showAllParameters, setShowAllParameters] = useState(!touchMode)
  const [irPreview, setIrPreview] = useState<IRWaveformPreview | null>(null)
  const [irPreviewLoading, setIrPreviewLoading] = useState(false)
  const [irPreviewError, setIrPreviewError] = useState<string | null>(null)

  const handleParameterChange = useCallback((symbol: string, value: number) => {
    setEditingParams((previous) => new Set(previous).add(symbol))
    onParameterChange(symbol, value)
  }, [onParameterChange])

  const handleParameterChangeEnd = useCallback((symbol: string) => {
    setEditingParams((previous) => {
      if (!previous.has(symbol)) {
        return previous
      }
      const next = new Set(previous)
      next.delete(symbol)
      return next
    })
    onParameterChangeEnd?.(symbol)
  }, [onParameterChangeEnd])

  const handleDropdownChange = useCallback((symbol: string, value: number) => {
    handleParameterChange(symbol, value)
    handleParameterChangeEnd(symbol)
  }, [handleParameterChange, handleParameterChangeEnd])

  useEffect(() => {
    setShowAllParameters(!touchMode)
  }, [plugin?.uri, touchMode])

  const irPreviewType = plugin ? IR_PREVIEW_PLUGIN_TYPES[plugin.uri] ?? null : null
  const selectedIRAssetPath = plugin?.loader_state?.selected_asset_path ?? null

  useEffect(() => {
    if (!irPreviewType || !selectedIRAssetPath) {
      setIrPreview(null)
      setIrPreviewLoading(false)
      setIrPreviewError(null)
      return
    }

    let cancelled = false
    setIrPreviewLoading(true)
    setIrPreviewError(null)

    void irApi.getWaveformPreview(selectedIRAssetPath, IR_PREVIEW_SAMPLE_COUNT)
      .then((preview) => {
        if (cancelled) {
          return
        }
        setIrPreview(preview)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setIrPreview(null)
        setIrPreviewError('Unable to read the selected WAV impulse response.')
      })
      .finally(() => {
        if (!cancelled) {
          setIrPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [irPreviewType, selectedIRAssetPath])

  if (!plugin) {
    return (
      <div className="juce-grid-page__parameter-editor" data-testid="juce-grid-parameter-editor">
        <Tile className="juce-grid-page__parameter-editor-empty">
          <SettingsAdjust size={24} />
          <div className="juce-grid-page__parameter-editor-copy">
            <h2 className="juce-grid-page__parameter-editor-panel-heading">Select a block</h2>
            <p>Choose a processor in the grid to open its parameter editor.</p>
          </div>
        </Tile>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="juce-grid-page__parameter-editor" data-testid="juce-grid-parameter-editor">
        <Tile className="juce-grid-page__parameter-editor-warning">
          <WarningAlt size={24} />
          <div className="juce-grid-page__parameter-editor-copy">
            <h2 className="juce-grid-page__parameter-editor-panel-heading">Plugin metadata not found</h2>
            <p>
              "{plugin.name}" is in the chain but missing from the discovery cache.
            </p>
            <code className="juce-grid-page__parameter-editor-code">{plugin.uri}</code>
            {onRefreshPlugins && (
              <Button size="sm" kind="ghost" renderIcon={Renew} onClick={onRefreshPlugins} disabled={isRefreshing}>
                {isRefreshing ? 'Refreshing…' : 'Refresh plugin list'}
              </Button>
            )}
          </div>
        </Tile>
      </div>
    )
  }

  const isHardware = meta.format === 'Hardware' || meta.is_hardware || plugin.uri.startsWith('hardware://')
  const accentColor = isHardware ? HARDWARE_ACCENT : getPluginAccentConfig(meta.uri, meta.category).color

  if (isHardware) {
    return (
      <div
        className={`juce-grid-page__parameter-editor ${touchMode ? 'is-touch-mode' : ''}`}
        data-testid="juce-grid-parameter-editor"
        style={{ '--juce-grid-parameter-accent': accentColor } as CSSProperties}
      >
        <Tile className="juce-grid-page__parameter-editor-hardware">
          <div className="juce-grid-page__parameter-editor-header">
            <div className="juce-grid-page__parameter-editor-copy">
              <h2 className="juce-grid-page__parameter-editor-panel-heading">{meta.name}</h2>
              <p>Hardware effect routed through the dedicated panel workflow.</p>
            </div>
            <div className="juce-grid-page__parameter-editor-actions">
              <Tag type="warm-gray">Hardware</Tag>
              {onToggleBypass && (
                <Button size="sm" kind={plugin.bypassed ? 'ghost' : 'secondary'} onClick={onToggleBypass}>
                  {plugin.bypassed ? 'Enable' : 'Bypass'}
                </Button>
              )}
            </div>
          </div>
          <div className="juce-grid-page__parameter-editor-hardware-body">
            <img src="/img/fx_lexicon.svg" alt="Lexicon MPX-1" width={56} height={56} />
            <div className="juce-grid-page__parameter-editor-copy">
              <h3 className="juce-grid-page__parameter-editor-subheading">Lexicon MPX-1 Hardware Effect</h3>
              <p>601 parameters are managed through the dedicated MIDI/SysEx hardware panel.</p>
            </div>
            <Button
              size="sm"
              kind="primary"
              renderIcon={Launch}
              onClick={() => { window.location.href = '/mpx1/panel' }}
            >
              Open MPX-1 panel
            </Button>
          </div>
        </Tile>
      </div>
    )
  }

  const parameters = meta.parameters || []
  const smartControlSymbols = new Set(
    [...parameters]
      .sort((a, b) => getSmartControlScore(b) - getSmartControlScore(a) || a.index - b.index)
      .slice(0, Math.min(6, parameters.length))
      .map((parameter) => parameter.symbol),
  )
  const parameterGroups = generateParameterGroups(parameters)
  const groupedParameters = parameterGroups.map((group) => {
    const normalizedTitle = (group.id || '').toUpperCase()
    const title = GROUP_TITLES[normalizedTitle as StandardGroup] ?? group.label
    return {
      ...group,
      title,
      parameters: group.parameters
        .map((index) => parameters.find((parameter) => parameter.index === index))
        .filter((parameter): parameter is PluginParameter => Boolean(parameter)),
    }
  }).map((group) => ({
    ...group,
    parameters: touchMode && !showAllParameters
      ? group.parameters.filter((parameter) => smartControlSymbols.has(parameter.symbol))
      : group.parameters,
  })).filter((group) => group.parameters.length > 0)

  return (
    <div
      className={`juce-grid-page__parameter-editor ${touchMode ? 'is-touch-mode' : ''}`}
      data-testid="juce-grid-parameter-editor"
      style={{ '--juce-grid-parameter-accent': accentColor } as CSSProperties}
    >
      {touchMode && parameters.length > 0 && (
        <div className="juce-grid-page__parameter-editor-header">
          <div className="juce-grid-page__parameter-editor-copy">
            <h2 className="juce-grid-page__parameter-editor-heading">{showAllParameters ? 'All parameters' : 'Smart controls'}</h2>
            <p>
              {showAllParameters
                ? 'Full parameter access for the selected block.'
                : 'A curated touch-first set of the most important controls.'}
            </p>
          </div>
          <div className="juce-grid-page__parameter-editor-toggle-row">
            <Button
              size="sm"
              kind={showAllParameters ? 'ghost' : 'primary'}
              className="juce-grid-page__parameter-editor-toggle"
              onClick={() => setShowAllParameters(false)}
              disabled={!showAllParameters}
            >
              Smart controls
            </Button>
            <Button
              size="sm"
              kind={showAllParameters ? 'primary' : 'ghost'}
              className="juce-grid-page__parameter-editor-toggle"
              onClick={() => setShowAllParameters(true)}
              disabled={showAllParameters}
            >
              All parameters
            </Button>
          </div>
        </div>
      )}

      {irPreviewType && (
        <Tile className="juce-grid-page__parameter-editor-ir-preview">
          <div className="juce-grid-page__parameter-editor-ir-preview-header">
            <div className="juce-grid-page__parameter-editor-copy">
              <h3 className="juce-grid-page__parameter-editor-subheading">
                {irPreviewType === 'cabinet' ? 'Cabinet IR waveform' : 'Reverb IR waveform'}
              </h3>
              <p>
                {selectedIRAssetPath
                  ? 'Loaded impulse response visualized from the selected WAV asset.'
                  : 'Load a WAV impulse response to preview its shape and tail.'}
              </p>
            </div>
            <Tag type={irPreviewType === 'cabinet' ? 'teal' : 'purple'} size="sm">
              {irPreviewType === 'cabinet' ? 'Cabinet IR' : 'Reverb IR'}
            </Tag>
          </div>

          {irPreviewLoading && (
            <InlineLoading status="active" description="Rendering waveform preview" />
          )}

          {!irPreviewLoading && irPreview && (
            <div className="juce-grid-page__parameter-editor-ir-preview-body">
              {renderIRWaveformBars(irPreview)}
              <div className="juce-grid-page__parameter-editor-ir-preview-meta">
                <strong>{irPreview.fileName}</strong>
                <span>{formatIRPreviewDuration(irPreview.durationMs)} • {Math.round(irPreview.sampleRate / 100) / 10} kHz • {irPreview.sampleCount.toLocaleString()} samples</span>
              </div>
            </div>
          )}

          {!irPreviewLoading && !irPreview && (
            <div className="juce-grid-page__parameter-editor-ir-preview-empty">
              <p>{selectedIRAssetPath ? (irPreviewError ?? 'Waveform preview unavailable.') : 'No WAV impulse loaded for this block yet.'}</p>
            </div>
          )}
        </Tile>
      )}

      <div className="juce-grid-page__parameter-editor-groups">
        {groupedParameters.map((group) => (
          <section key={group.id} className="juce-grid-page__parameter-group-card" aria-label={`${group.title} parameters`}>
            <div className="juce-grid-page__parameter-group-header">
              <div>
                <h3 className="juce-grid-page__parameter-group-heading">{group.title}</h3>
                <p>{group.parameters.length} control{group.parameters.length === 1 ? '' : 's'}</p>
              </div>
              <Tag type="cool-gray" size="sm">{group.parameters.length}</Tag>
            </div>

            <div className="juce-grid-page__parameter-group-grid">
              {group.parameters.map((parameter) => {
                const currentValue = plugin.parameters?.[parameter.symbol] ?? parameter.default
                const dropdownItems = shouldUseDropdown(parameter) ? buildDropdownOptions(parameter) : null
                const selectedDropdownItem = dropdownItems?.find((item) => item.value === Math.round(currentValue)) ?? null

                return (
                  <div key={parameter.symbol} className="juce-grid-page__parameter-control">
                    <div className="juce-grid-page__parameter-control-copy">
                      <h4 className="juce-grid-page__parameter-control-heading">{parameter.name}</h4>
                      <span>{formatParameterReadout(parameter, currentValue)}</span>
                    </div>

                    {dropdownItems ? (
                      <Dropdown<DropdownOption>
                        id={`juce-grid-parameter-${parameter.symbol}`}
                        titleText=""
                        label="Select value"
                        items={dropdownItems}
                        selectedItem={selectedDropdownItem}
                        itemToString={(item) => item?.label ?? ''}
                        size="md"
                        onChange={({ selectedItem }) => {
                          if (selectedItem) {
                            handleDropdownChange(parameter.symbol, selectedItem.value)
                          }
                        }}
                      />
                    ) : (
                      <NumberInput
                        label={parameter.name}
                        value={currentValue}
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.is_toggled ? 1 : undefined}
                        defaultValue={parameter.default}
                        pluginId={plugin.uri}
                        paramKey={parameter.symbol || parameter.name}
                        scale={parameter.is_log ? 'log' : undefined}
                        onChange={(value) => handleParameterChange(parameter.symbol, value)}
                        onChangeEnd={() => handleParameterChangeEnd(parameter.symbol)}
                        accentColor={accentColor}
                        showLabel={false}
                        inline
                        fullWidth
                        className="juce-grid-page__parameter-control-input"
                      />
                    )}

                    {editingParams.has(parameter.symbol) && (
                      <InlineLoading
                        status="active"
                        description={`Updating ${parameter.name}`}
                        className="juce-grid-page__parameter-control-loading"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {parameters.length === 0 && (
          <Tile className="juce-grid-page__parameter-editor-empty">
            <div className="juce-grid-page__parameter-editor-copy">
              <h3 className="juce-grid-page__parameter-editor-empty-heading">No adjustable parameters</h3>
              <p>This processor does not currently expose editable controls.</p>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}

export default JuceGridParameterEditor
