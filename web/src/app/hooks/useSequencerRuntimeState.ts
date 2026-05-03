import type { QueryClient } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'

import { useWebSocketTopic } from '@/map2/hooks/useWebSocket'
import type { SequencerRuntimeUpdate, SequencerState, PluginRuntimeScopeOptions } from '@/map2/api'

function normalizeInstanceId(value: number | string | null | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

function normalizePluginPosition(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

export function matchesBrainRuntimeScope(
  update: SequencerRuntimeUpdate,
  scope?: Pick<PluginRuntimeScopeOptions, 'instanceId' | 'pluginPosition'>,
): boolean {
  const scopedInstanceId = normalizeInstanceId(scope?.instanceId)
  const scopedPluginPosition = normalizePluginPosition(scope?.pluginPosition)
  const updateInstanceId = normalizeInstanceId(update.scope.instance_id)
  const updatePluginPosition = normalizePluginPosition(update.scope.plugin_position)

  if (scopedInstanceId !== undefined) {
    if (updateInstanceId !== scopedInstanceId) {
      return false
    }
  } else if (updateInstanceId !== undefined) {
    return false
  }

  if (scopedPluginPosition !== undefined) {
    return updatePluginPosition === scopedPluginPosition
  }

  return updatePluginPosition === undefined
}

export function syncBrainStateToQueryCache(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  scopeKey: string,
  state: SequencerState,
) {
  queryClient.setQueryData(['sequencer', 'state', scopeKey], state)
  queryClient.setQueryData(['sequencer', 'transport', scopeKey], state.transport)
  queryClient.setQueryData(['sequencer', 'slots', scopeKey], state.slots)
  queryClient.setQueryData(['sequencer', 'layers', scopeKey], {
    active_layer_id: state.active_layer_id,
    layers: state.layers,
  })
  queryClient.setQueryData(['sequencer', 'sequence', scopeKey], state.sequence)
  queryClient.setQueryData(['sequencer', 'song', scopeKey], state.song)
  queryClient.setQueryData(['sequencer', 'mixer', scopeKey], state.mixer)
  queryClient.setQueryData(['sequencer', 'inputs', scopeKey], state.inputs)
  queryClient.setQueryData(['sequencer', 'library', scopeKey], state.library)
  queryClient.setQueryData(['sequencer', 'sample-editor', scopeKey], state.sample_editor)
  queryClient.setQueryData(['sequencer', 'diagnostics', scopeKey], state.diagnostics)
}

export function invalidateBrainAuthorityQueryCaches(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
) {
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'committed'] })
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'desired'] })
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'observed'] })
}

export function applyBrainRuntimeUpdate(
  queryClient: Pick<QueryClient, 'setQueryData' | 'invalidateQueries'>,
  update: SequencerRuntimeUpdate,
  scope: Pick<PluginRuntimeScopeOptions, 'instanceId' | 'pluginPosition'>,
  scopeKey: string,
  options: { enabled?: boolean } = {},
): boolean {
  const { enabled = true } = options
  if (!enabled) {
    return false
  }
  if (!matchesBrainRuntimeScope(update, scope)) {
    return false
  }
  syncBrainStateToQueryCache(queryClient, scopeKey, update.state)
  invalidateBrainAuthorityQueryCaches(queryClient)
  return true
}

export function useSequencerRuntimeStateSync(
  scope: Pick<PluginRuntimeScopeOptions, 'instanceId' | 'pluginPosition'>,
  scopeKey: string,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient()
  const { enabled = true } = options

  useWebSocketTopic<SequencerRuntimeUpdate>('sequencer:runtime', (data, message) => {
    if (!enabled || message.type !== 'brain_runtime_update' || !data) {
      return
    }
    applyBrainRuntimeUpdate(queryClient, data, scope, scopeKey, { enabled })
  })
}
