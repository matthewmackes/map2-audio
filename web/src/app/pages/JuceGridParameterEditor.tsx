import { Suspense, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { Launch, Renew, SettingsAdjust, WarningAlt } from '@carbon/icons-react'
import { Button, InlineLoading, Tag, Tile } from '@carbon/react'
import { ParameterKnob } from '../components/Controls/ParameterKnob'
import { getPluginCardComponent } from '../components/PluginCards'
import type { PluginCardProps } from '../components/PluginCards/types'
import { getCategoryConfig } from '../components/PluginCards/types'
import type { ChainPlugin, Plugin } from '../../map2/types'
import { getDisplayPluginName } from '../../map2/displayNames'

export interface JuceGridParameterEditorProps {
  plugin: ChainPlugin | null
  meta: Plugin | null
  onParameterChange: (symbol: string, value: number) => void
  onParameterChangeEnd?: (symbol: string) => void
  onToggleBypass?: () => void
  useClassicMode?: boolean
  onRefreshPlugins?: () => void
  isRefreshing?: boolean
}

const HARDWARE_ACCENT = '#c8a951'

export function JuceGridParameterEditor({
  plugin,
  meta,
  onParameterChange,
  onParameterChangeEnd,
  onToggleBypass,
  useClassicMode = false,
  onRefreshPlugins,
  isRefreshing = false,
}: JuceGridParameterEditorProps) {
  const [editingParams, setEditingParams] = useState<Set<string>>(new Set())

  const handleParameterChange = useCallback((symbol: string, value: number) => {
    setEditingParams((previous) => new Set(previous).add(symbol))
    onParameterChange(symbol, value)
  }, [onParameterChange])

  const handleParameterChangeEnd = useCallback((symbol: string) => {
    setEditingParams((previous) => {
      const next = new Set(previous)
      next.delete(symbol)
      return next
    })
    onParameterChangeEnd?.(symbol)
  }, [onParameterChangeEnd])

  const parameterMap = useMemo(() => {
    const indexToSymbol: Record<number, string> = {}
    meta?.parameters?.forEach((parameter) => {
      indexToSymbol[parameter.index] = parameter.symbol
    })
    return indexToSymbol
  }, [meta?.parameters])

  const handleIndexParameterChange = useCallback((paramIndex: number, value: number) => {
    const symbol = parameterMap[paramIndex]
    if (symbol) {
      handleParameterChange(symbol, value)
    }
  }, [handleParameterChange, parameterMap])

  const handleIndexParameterChangeEnd = useCallback(() => {
    editingParams.forEach((symbol) => {
      onParameterChangeEnd?.(symbol)
    })
  }, [editingParams, onParameterChangeEnd])

  const handleCardBypassToggle = useCallback((_bypassed: boolean) => {
    onToggleBypass?.()
  }, [onToggleBypass])

  const cardComponent = useMemo(() => {
    if (useClassicMode || !meta || !plugin) return null

    const category = meta.category || 'Instrument'
    const candidates = [plugin.uri, meta.uri].filter((value): value is string => Boolean(value))

    for (const candidateUri of candidates) {
      const component = getPluginCardComponent(candidateUri, category)
      if (component) {
        return component
      }
    }

    const synthforgeHint = `${plugin.uri} ${meta.uri} ${plugin.name || ''} ${meta.name || ''}`.toLowerCase()
    if (synthforgeHint.includes('synthforge')) {
      return getPluginCardComponent('map2://juce/synthforge', category)
    }

    return null
  }, [meta, plugin, useClassicMode])

  const parameterValues = useMemo(() => {
    const values: Record<number, number> = {}
    if (meta?.parameters && plugin?.parameters) {
      meta.parameters.forEach((parameter) => {
        values[parameter.index] = plugin.parameters?.[parameter.symbol] ?? parameter.default
      })
    }
    return values
  }, [meta?.parameters, plugin?.parameters])

  if (!plugin) {
    return (
      <div className="juce-grid-page__parameter-editor">
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
      <div className="juce-grid-page__parameter-editor">
        <Tile className="juce-grid-page__parameter-editor-warning">
          <WarningAlt size={24} />
          <div className="juce-grid-page__parameter-editor-copy">
            <strong>Plugin metadata not found</strong>
            <p>
              "{getDisplayPluginName(plugin.name, plugin.uri)}" is in the chain but missing from the discovery cache.
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
      <div className="juce-grid-page__parameter-editor">
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

  if (cardComponent) {
    const pluginWithValues: Plugin = {
      ...meta,
      parameters: meta.parameters?.map((parameter) => ({
        ...parameter,
        value: plugin.parameters?.[parameter.symbol] ?? parameter.default,
      })),
      bypassed: plugin.bypassed,
    }

    const cardProps: PluginCardProps = {
      plugin: pluginWithValues,
      parameterValues,
      onParameterChange: handleIndexParameterChange,
      onParameterChangeEnd: handleIndexParameterChangeEnd,
      onBypassToggle: handleCardBypassToggle,
      accentColor,
      disabled: false,
      compact: false,
    }

    const CardComponent = cardComponent

    return (
      <div className="juce-grid-page__parameter-editor juce-grid-page__parameter-editor--card">
        <Suspense fallback={<InlineLoading description="Loading plugin editor" />}>
          <CardComponent {...cardProps} />
        </Suspense>
      </div>
    )
  }

  const parameters = meta.parameters || []
  const toggleParams = parameters.filter((parameter) => parameter.is_toggled)
  const continuousParams = parameters.filter((parameter) => !parameter.is_toggled)

  return (
    <div className="juce-grid-page__parameter-editor" style={{ '--juce-grid-parameter-accent': accentColor } as CSSProperties}>
      <div className="juce-grid-page__parameter-editor-header">
        <div className="juce-grid-page__parameter-editor-copy">
          <div className="juce-grid-page__parameter-editor-meta">
            <Tag type="cool-gray">{meta.category}</Tag>
            {meta.format && <Tag type="blue">{meta.format}</Tag>}
          </div>
          <strong>{meta.name}</strong>
          <p>{parameters.length > 0 ? `${parameters.length} available parameters` : 'This block has no editable parameters.'}</p>
        </div>
        {onToggleBypass && (
          <Button size="sm" kind={plugin.bypassed ? 'ghost' : 'secondary'} onClick={onToggleBypass}>
            {plugin.bypassed ? 'Enable' : 'Bypass'}
          </Button>
        )}
      </div>

      <div className="juce-grid-page__parameter-editor-body">
        {toggleParams.length > 0 && (
          <div className="juce-grid-page__parameter-editor-toggle-row">
            {toggleParams.map((parameter) => {
              const currentValue = plugin.parameters?.[parameter.symbol] ?? parameter.default
              const isOn = currentValue > 0.5

              return (
                <Button
                  key={parameter.symbol}
                  size="sm"
                  kind={isOn ? 'secondary' : 'ghost'}
                  className="juce-grid-page__parameter-editor-toggle"
                  onClick={() => handleParameterChange(parameter.symbol, isOn ? 0 : 1)}
                >
                  {parameter.name}: {isOn ? 'On' : 'Off'}
                </Button>
              )
            })}
          </div>
        )}

        {continuousParams.length > 0 && (
          <div className="juce-grid-page__parameter-editor-knob-grid">
            {continuousParams.map((parameter) => {
              const currentValue = plugin.parameters?.[parameter.symbol] ?? parameter.default

              return (
                <ParameterKnob
                  key={parameter.symbol}
                  label={parameter.name}
                  value={currentValue}
                  min={parameter.min}
                  max={parameter.max}
                  defaultValue={parameter.default}
                  onChange={(value) => handleParameterChange(parameter.symbol, value)}
                  onChangeEnd={() => handleParameterChangeEnd(parameter.symbol)}
                  accentColor={accentColor}
                  isLogarithmic={parameter.is_log}
                  size="responsive"
                />
              )
            })}
          </div>
        )}

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
