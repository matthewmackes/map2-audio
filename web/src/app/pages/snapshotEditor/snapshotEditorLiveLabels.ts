// SnapshotEditorPageContent live-path / routing label helpers
// extracted from the page monolith (T2470). Pure functions with no
// React or hook dependencies; consumed by the routing inspector,
// the live-path render, and the per-flow channel chain naming
// flow.

import type {
  AudioAvbEndpoint,
  AudioPort,
  AudioRoutingSelectionBinding,
} from '../../../map2/api'
import type { Chain, Plugin } from '../../../map2/types'
import type { JuceGridRoutingState } from '../../components/SnapshotEditor/snapshotEditorFlowState'
import { getEffectIcon } from '../../components/icons/effectIcons'
import type {
  LivePathArrowTone,
  LivePathGroupKind,
  RoutingMode,
} from './snapshotEditorPageTypes'

export function formatInspectorList(values: string[]): string {
  if (values.length === 0) {
    return 'None'
  }
  return values.join(', ')
}

export function formatMidiMappingValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export function parseMidiMappingValue(rawValue: string, fallback: number): number {
  const parsed = Number.parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function fallbackPluginLabel(pluginUri: string | null): string {
  if (!pluginUri) {
    return 'Processor'
  }

  const tail = pluginUri.split('/').pop()
  return tail ? tail.replace(/[-_]+/g, ' ') : pluginUri
}

export function getSelectedPluginHeroIcon(
  meta: Plugin | null,
  plugin: Chain['plugins'][number] | null,
) {
  const iconHints = [
    meta?.name,
    meta?.category,
    meta?.class_label,
    plugin?.plugin_display_type,
    plugin?.name,
    plugin?.uri,
  ].filter((value): value is string => Boolean(value && value.trim()))

  for (const hint of iconHints) {
    const icon = getEffectIcon(hint)
    if (icon) {
      return icon
    }
  }

  return getEffectIcon('plugin')
}

export function getAudioRouteLabels(
  selectedPorts: number[] | undefined,
  ports: AudioPort[] | undefined,
  selectedAvbEndpoints: string[] | undefined,
  avbEndpoints: AudioAvbEndpoint[] | undefined,
): string[] {
  const portLabels = (selectedPorts ?? []).map((portIndex) => {
    const match = ports?.find((port) => port.index === portIndex)
    return match ? match.name : `Port ${portIndex + 1}`
  })

  const avbLabels = (selectedAvbEndpoints ?? []).map((endpointId) => {
    const match = avbEndpoints?.find((endpoint) => endpoint.endpoint_id === endpointId)
    if (match?.device_name) {
      return match.device_name
    }
    return endpointId
  })

  return [...portLabels, ...avbLabels]
}

export function countAudioBindingChannels(
  bindings: AudioRoutingSelectionBinding[] | undefined,
  fallbackPortCount: number,
  fallbackAvbCount: number,
) {
  if (!bindings || bindings.length === 0) {
    return fallbackPortCount + fallbackAvbCount
  }

  return bindings.reduce((sum, binding) => (
    sum + (binding.selection_type === 'local_port' ? 1 : Math.max(1, binding.channels || 1))
  ), 0)
}

export function getLivePathArrowTone(
  flowState: { activeAudio?: boolean; dimmed?: boolean; sidechainKey?: boolean } | undefined,
): LivePathArrowTone {
  if (flowState?.sidechainKey) {
    return 'sidechain'
  }
  if (flowState?.activeAudio) {
    return 'active'
  }
  return 'dim'
}

export function getLivePathStateLabel(
  flowState: { activeAudio?: boolean; dimmed?: boolean; sidechainKey?: boolean } | undefined,
): string | null {
  if (flowState?.sidechainKey) {
    return 'Key'
  }
  if (flowState?.activeAudio) {
    return 'Live'
  }
  if (flowState?.dimmed) {
    return 'Dim'
  }
  return null
}

export function getLivePathBranchLabel(
  routingMode: RoutingMode,
  groupKind: LivePathGroupKind,
  flowState: { annotation?: string } | undefined,
): string | null {
  if (!flowState?.annotation) {
    return null
  }

  if (routingMode === 'series' && (groupKind === 'series' || groupKind === 'inactive')) {
    return null
  }

  return flowState.annotation
}

export function sanitizeTraceableNamePart(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalized = (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w -]/g, '')

  return normalized.length > 0 ? normalized : fallback
}

export function formatCompactTimestamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

export function buildTraceableChannelChainName(
  snapshotName: string | null,
  channelLabel: string,
): string {
  const baseName = sanitizeTraceableNamePart(snapshotName, 'Snapshot Editor')
  const normalizedChannelLabel = sanitizeTraceableNamePart(channelLabel, 'A')
  return `${baseName} - ${formatCompactTimestamp()} - Channel ${normalizedChannelLabel}`
}

export function getRoutingFocusFlowSummary(
  routingMode: JuceGridRoutingState['mode'],
  flowIndex: number,
  flowId: string,
  activeFlowId: string | null,
  secondaryFlowId: string | null,
  blendPercent: number,
): string {
  switch (routingMode) {
    case 'parallel_blend':
      return `${Math.round(blendPercent)}% blend`
    case 'ab_switch':
      return flowId === activeFlowId ? 'Primary branch' : 'Standby branch'
    case 'parameter_morph':
      if (flowId === activeFlowId) return 'Morph focus'
      if (flowId === secondaryFlowId) return 'Morph target'
      return 'Morph context'
    case 'sidechain':
      return flowIndex === 0 ? 'Main audio' : 'Sidechain key'
    case 'series':
    default:
      return flowIndex === 0 ? 'Input stage' : 'Serial stage'
  }
}
