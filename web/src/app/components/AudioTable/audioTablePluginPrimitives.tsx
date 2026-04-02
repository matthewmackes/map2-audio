import type { ChangeEvent, ReactNode } from 'react'

import {
  Checkbox,
  NumberInput as CarbonNumberInput,
  Select,
  SelectItem,
} from '@carbon/react'

import { getDisplayPluginName } from '../../../map2/displayNames'
import type {
  Chain,
  ChainPlugin,
  MIDICurveType,
  MIDIMappingV2,
  Plugin,
  PluginParameter,
} from '../../../map2/types'

export const AUDIO_TABLE_MIDI_CURVE_OPTIONS: Array<{ id: MIDICurveType; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'logarithmic', label: 'Log' },
  { id: 'exponential', label: 'Exp' },
  { id: 's_curve', label: 'S-Curve' },
]

export interface AudioTablePluginSelectionTarget {
  chainId: number
  chainName: string
  flowLabel: string
  flowSlotId: string | null
  pluginUri: string
  pluginName: string
  pluginPosition: number
  instanceId?: number
  rowAnchorId: string | null
  syntheticFlow: boolean
}

export function getAudioTablePluginDisplayName(plugin: ChainPlugin): string {
  return getDisplayPluginName(plugin.name, plugin.uri)
}

export function buildAudioTablePluginTargetKey(
  target: Pick<AudioTablePluginSelectionTarget, 'chainId' | 'pluginUri' | 'pluginPosition' | 'instanceId'>,
): string {
  return [
    target.chainId,
    target.pluginUri,
    target.pluginPosition,
    target.instanceId ?? 'none',
  ].join('::')
}

export function buildAudioTableRowAnchorId(flowSlotId: string, plugin: ChainPlugin): string {
  return [
    flowSlotId,
    plugin.uri,
    plugin.position,
    plugin.instance_id ?? 'none',
  ].join('::')
}

export function buildAudioTableRowAnchorDomId(rowAnchorId: string): string {
  return `audio-table-row-anchor-${rowAnchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function buildAudioTablePluginParameters(
  plugin: ChainPlugin,
  pluginInventoryByUri: Map<string, Plugin>,
): PluginParameter[] {
  const catalogParams = pluginInventoryByUri.get(plugin.uri)?.parameters ?? []
  const valuesBySymbol = plugin.parameters ?? {}
  const params: PluginParameter[] = []
  const seenSymbols = new Set<string>()

  for (const meta of catalogParams) {
    if (!(meta.symbol in valuesBySymbol)) {
      continue
    }

    seenSymbols.add(meta.symbol)
    params.push({
      ...meta,
      value: valuesBySymbol[meta.symbol],
    })
  }

  for (const [symbol, value] of Object.entries(valuesBySymbol)) {
    if (seenSymbols.has(symbol)) {
      continue
    }

    params.push({
      index: params.length,
      name: symbol,
      symbol,
      min: 0,
      max: 1,
      default: value,
      value,
      is_toggled: false,
      is_log: false,
    })
  }

  return params
}

export function resolveAudioTableDefaultMidiTarget(
  plugin: Chain['plugins'][number],
  pluginInventoryByUri: Map<string, Plugin>,
) {
  const parameters = buildAudioTablePluginParameters(plugin, pluginInventoryByUri)
  const preferred = parameters.find((param) => param.symbol in (plugin.parameters ?? {}))
  if (preferred) {
    return { index: preferred.index, symbol: preferred.symbol }
  }

  const firstParameter = parameters[0]
  return firstParameter
    ? { index: firstParameter.index, symbol: firstParameter.symbol }
    : null
}

export function resolveAudioTableMidiMapping(
  chainId: number,
  plugin: Chain['plugins'][number],
  midiMappings: MIDIMappingV2[],
) {
  return [...midiMappings]
    .filter((candidate) => (
      candidate.target_plugin_uri === plugin.uri
      && (candidate.chain_id === chainId || candidate.chain_id === null)
    ))
    .sort((left, right) => {
      const leftScope = left.chain_id === chainId ? 0 : 1
      const rightScope = right.chain_id === chainId ? 0 : 1
      if (leftScope !== rightScope) {
        return leftScope - rightScope
      }
      return (left.target_param_index ?? Number.MAX_SAFE_INTEGER) - (right.target_param_index ?? Number.MAX_SAFE_INTEGER)
    })[0] ?? null
}

export function formatAudioTablePluginPeak(
  peaksMap: Record<string, Record<string, { peak: number; port_symbol?: string }>>,
  plugin: ChainPlugin,
) {
  const pluginPeaks = peaksMap[plugin.uri] ?? peaksMap[`${plugin.uri}::${plugin.position}`]
  let inputDb = '—'
  let outputDb = '—'

  if (pluginPeaks) {
    const ports = Object.values(pluginPeaks)
    const inPort = ports.find((port) => port.port_symbol?.includes('in')) ?? ports[0]
    const outPort = ports.find((port) => port.port_symbol?.includes('out')) ?? ports[ports.length > 1 ? 1 : 0]
    if (inPort) {
      inputDb = (20 * Math.log10(Math.max(inPort.peak, 0.0001))).toFixed(1)
    }
    if (outPort) {
      outputDb = (20 * Math.log10(Math.max(outPort.peak, 0.0001))).toFixed(1)
    }
  }

  return { inputDb, outputDb }
}

interface AudioTableParameterFieldProps {
  chainId: number
  plugin: Chain['plugins'][number]
  parameter: PluginParameter
  controlId: string
  onParameterChange: (
    chainId: number,
    uri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ) => void
  width?: number
}

export function AudioTableParameterField({
  chainId,
  plugin,
  parameter,
  controlId,
  onParameterChange,
  width = 88,
}: AudioTableParameterFieldProps) {
  const paramValue = plugin.parameters?.[parameter.symbol] ?? parameter.default ?? 0

  if (parameter.is_toggled) {
    return (
      <Checkbox
        id={controlId}
        checked={paramValue >= 0.5}
        labelText=""
        hideLabel
        onChange={(_evt: ChangeEvent<HTMLInputElement>, data: { checked: boolean }) => {
          onParameterChange(
            chainId,
            plugin.uri,
            parameter.index,
            data.checked ? 1 : 0,
            plugin.instance_id,
            plugin.position,
          )
        }}
      />
    )
  }

  const isDiscreteIntegerRange = Number.isInteger(parameter.min)
    && Number.isInteger(parameter.max)
    && Number.isInteger(paramValue)
    && (parameter.max ?? 0) - (parameter.min ?? 0) <= 8

  if (isDiscreteIntegerRange) {
    const min = parameter.min ?? 0
    const max = parameter.max ?? min

    return (
      <Select
        id={controlId}
        size="sm"
        hideLabel
        labelText=""
        value={String(Math.round(paramValue))}
        onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
          onParameterChange(
            chainId,
            plugin.uri,
            parameter.index,
            Number(evt.target.value),
            plugin.instance_id,
            plugin.position,
          )
        }}
      >
        {Array.from({ length: max - min + 1 }, (_, offset) => {
          const optionValue = min + offset
          return (
            <SelectItem
              key={optionValue}
              text={String(optionValue)}
              value={String(optionValue)}
            />
          )
        })}
      </Select>
    )
  }

  const min = parameter.min ?? 0
  const max = parameter.max ?? 1
  const span = Math.abs(max - min)
  const step = span > 0 ? Math.max(span / 100, 0.01) : 0.01

  return (
    <CarbonNumberInput
      id={controlId}
      size="sm"
      min={min}
      max={max}
      step={step}
      value={paramValue}
      label=""
      hideLabel
      hideSteppers
      onChange={(_evt: unknown, { value }: { value: string | number }) => {
        onParameterChange(
          chainId,
          plugin.uri,
          parameter.index,
          Number(value),
          plugin.instance_id,
          plugin.position,
        )
      }}
      style={{ width }}
    />
  )
}

interface AudioTableMidiFieldProps {
  field: 'midiCc' | 'midiChannel' | 'midiCurve' | 'midiMin' | 'midiMax'
  chainId: number
  plugin: Chain['plugins'][number]
  midiMappings: MIDIMappingV2[]
  pluginInventoryByUri: Map<string, Plugin>
  controlId: string
  onMidiMappingChange: (
    chainId: number,
    plugin: Chain['plugins'][number],
    updates: Partial<MIDIMappingV2>,
  ) => void
}

export function AudioTableMidiField({
  field,
  chainId,
  plugin,
  midiMappings,
  pluginInventoryByUri,
  controlId,
  onMidiMappingChange,
}: AudioTableMidiFieldProps): ReactNode {
  const mapping = resolveAudioTableMidiMapping(chainId, plugin, midiMappings)
  const parameters = buildAudioTablePluginParameters(plugin, pluginInventoryByUri)
  const targetParam = mapping
    ? parameters.find((param) => param.index === mapping.target_param_index)
    : parameters.find((param) => param.symbol in (plugin.parameters ?? {})) ?? parameters[0] ?? null

  if (!mapping && !targetParam) {
    return '—'
  }

  switch (field) {
    case 'midiCc':
      return (
        <CarbonNumberInput
          id={controlId}
          size="sm"
          min={0}
          max={127}
          step={1}
          value={mapping?.cc ?? 0}
          label=""
          hideLabel
          hideSteppers
          onChange={(_evt: unknown, { value }: { value: string | number }) => {
            onMidiMappingChange(chainId, plugin, {
              cc: Math.max(0, Math.min(127, Math.round(Number(value)))),
            })
          }}
          style={{ width: 76 }}
        />
      )
    case 'midiChannel':
      return (
        <Select
          id={controlId}
          size="sm"
          hideLabel
          labelText=""
          value={String(mapping?.channel ?? 0)}
          onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
            onMidiMappingChange(chainId, plugin, { channel: Number(evt.target.value) })
          }}
        >
          <SelectItem value="0" text="Omni" />
          {Array.from({ length: 16 }, (_, index) => (
            <SelectItem
              key={index + 1}
              value={String(index + 1)}
              text={`Ch ${index + 1}`}
            />
          ))}
        </Select>
      )
    case 'midiCurve':
      return (
        <Select
          id={controlId}
          size="sm"
          hideLabel
          labelText=""
          value={mapping?.curve_type ?? 'linear'}
          onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
            onMidiMappingChange(chainId, plugin, {
              curve_type: evt.target.value as MIDICurveType,
            })
          }}
        >
          {AUDIO_TABLE_MIDI_CURVE_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id} text={option.label} />
          ))}
        </Select>
      )
    case 'midiMin':
      return (
        <CarbonNumberInput
          id={controlId}
          size="sm"
          min={0}
          max={1}
          step={0.01}
          value={mapping?.min_val ?? 0}
          label=""
          hideLabel
          hideSteppers
          onChange={(_evt: unknown, { value }: { value: string | number }) => {
            onMidiMappingChange(chainId, plugin, { min_val: Number(value) })
          }}
          style={{ width: 76 }}
        />
      )
    case 'midiMax':
      return (
        <CarbonNumberInput
          id={controlId}
          size="sm"
          min={0}
          max={1}
          step={0.01}
          value={mapping?.max_val ?? 1}
          label=""
          hideLabel
          hideSteppers
          onChange={(_evt: unknown, { value }: { value: string | number }) => {
            onMidiMappingChange(chainId, plugin, { max_val: Number(value) })
          }}
          style={{ width: 76 }}
        />
      )
    default:
      return ''
  }
}

interface AudioTablePositionFieldProps {
  chainId: number
  plugin: Chain['plugins'][number]
  plugins: Chain['plugins']
  controlId: string
  onPositionChange: (
    chainId: number,
    plugins: Chain['plugins'],
    from: number,
    to: number,
  ) => void
}

export function AudioTablePositionField({
  chainId,
  plugin,
  plugins,
  controlId,
  onPositionChange,
}: AudioTablePositionFieldProps) {
  return (
    <CarbonNumberInput
      id={controlId}
      size="sm"
      min={0}
      max={Math.max(plugins.length - 1, 0)}
      value={plugin.position}
      label=""
      hideLabel
      hideSteppers
      onChange={(_evt: unknown, { value }: { value: string | number }) => {
        onPositionChange(chainId, plugins, plugin.position, Number(value))
      }}
      style={{ width: 56 }}
    />
  )
}

interface AudioTableMidiTargetFieldProps {
  chainId: number
  plugin: Chain['plugins'][number]
  midiMappings: MIDIMappingV2[]
  pluginInventoryByUri: Map<string, Plugin>
  controlId: string
  onMidiMappingChange: (
    chainId: number,
    plugin: Chain['plugins'][number],
    updates: Partial<MIDIMappingV2>,
  ) => void
}

export function AudioTableMidiTargetField({
  chainId,
  plugin,
  midiMappings,
  pluginInventoryByUri,
  controlId,
  onMidiMappingChange,
}: AudioTableMidiTargetFieldProps) {
  const parameters = buildAudioTablePluginParameters(plugin, pluginInventoryByUri)
  if (parameters.length === 0) {
    return '—'
  }

  const mapping = resolveAudioTableMidiMapping(chainId, plugin, midiMappings)
  const selectedIndex = mapping?.target_param_index ?? parameters[0]?.index ?? 0

  return (
    <Select
      id={controlId}
      size="sm"
      hideLabel
      labelText=""
      value={String(selectedIndex)}
      onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
        const nextParameter = parameters.find((parameter) => parameter.index === Number(evt.target.value))
        if (!nextParameter) {
          return
        }

        onMidiMappingChange(chainId, plugin, {
          target_param_index: nextParameter.index,
          target_param_symbol: nextParameter.symbol,
          name: `${getAudioTablePluginDisplayName(plugin)} ${nextParameter.symbol}`,
        })
      }}
    >
      {parameters.map((parameter) => (
        <SelectItem
          key={parameter.index}
          value={String(parameter.index)}
          text={`${parameter.name} (${parameter.symbol})`}
        />
      ))}
    </Select>
  )
}
