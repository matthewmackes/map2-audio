import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Dropdown, Button, InlineLoading, Tag, Tile } from '@carbon/react'
import { Launch, Renew, SettingsAdjust, WarningAlt } from '@carbon/icons-react'
import { NumberInput } from '../components/Controls/NumberInput'
import {
  generateParameterGroups,
  getCategoryConfig,
  type StandardGroup,
} from '../components/PluginCards/types'
import type { ChainPlugin, Plugin, PluginParameter } from '../../map2/types'

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

  if (!plugin) {
    return (
      <div className="juce-grid-page__parameter-editor" data-testid="juce-grid-parameter-editor">
        <Tile className="juce-grid-page__parameter-editor-empty">
          <SettingsAdjust size={24} />
          <div className="juce-grid-page__parameter-editor-copy">
            <strong>Select a block</strong>
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
            <strong>Plugin metadata not found</strong>
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
  const accentColor = isHardware ? HARDWARE_ACCENT : getCategoryConfig(meta.category).color

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
              <strong>{meta.name}</strong>
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
              <strong>Lexicon MPX-1 Hardware Effect</strong>
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
            <strong>{showAllParameters ? 'All parameters' : 'Smart controls'}</strong>
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

      <div className="juce-grid-page__parameter-editor-groups">
        {groupedParameters.map((group) => (
          <section key={group.id} className="juce-grid-page__parameter-group-card" aria-label={`${group.title} parameters`}>
            <div className="juce-grid-page__parameter-group-header">
              <div>
                <strong>{group.title}</strong>
                <p>{group.parameters.length} control{group.parameters.length === 1 ? '' : 's'}</p>
              </div>
              <Tag type="cool-gray">{group.parameters.length}</Tag>
            </div>

            <div className="juce-grid-page__parameter-group-grid">
              {group.parameters.map((parameter) => {
                const currentValue = plugin.parameters?.[parameter.symbol] ?? parameter.default
                const dropdownItems = shouldUseDropdown(parameter) ? buildDropdownOptions(parameter) : null
                const selectedDropdownItem = dropdownItems?.find((item) => item.value === Math.round(currentValue)) ?? null

                return (
                  <div key={parameter.symbol} className="juce-grid-page__parameter-control">
                    <div className="juce-grid-page__parameter-control-copy">
                      <strong>{parameter.name}</strong>
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
              <strong>No adjustable parameters</strong>
              <p>This processor does not currently expose editable controls.</p>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}

export default JuceGridParameterEditor
