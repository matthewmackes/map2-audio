import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import type {
  AudioStatePathStatus,
  AuthoritativeAudioState,
  Chain,
  ChainPlugin,
  ChainsResponse,
  ChainRuntimeSyncStatus,
  EffectsLoop,
  LoopInsertion,
  SnapshotPath,
  SnapshotPlugin,
} from '../../../map2/types'
import {
  createDefaultJuceGridFlowSlots,
  normalizeJuceGridActiveFlowIndex,
  normalizeJuceGridRouting,
  type JuceGridFlowSlotState,
  type JuceGridRoutingState,
  type JuceGridSlotPaletteEntry,
} from './snapshotEditorFlowState'

const LIVE_RUNTIME_STATUSES = new Set<ChainRuntimeSyncStatus>(['active', 'partial'])

export type JuceGridLiveChainStatus = 'live' | 'degraded'

export interface JuceGridLiveChainRepresentativeItem {
  id: string
  kind: 'plugin' | 'loop'
  label: string
  iconHint: string
  dimmed: boolean
  caption?: string
}

export interface JuceGridLiveChainProjection {
  chainId: number
  runtimeChainId?: number | null
  snapshotChainId?: number | null
  chainName: string
  status: JuceGridLiveChainStatus
  runtimeStatus: ChainRuntimeSyncStatus | 'inactive' | 'missing'
  flowLabels: string[]
  primaryFlowLabel: string
  syntheticFlow: boolean
  warningText: string | null
  representativeItems: JuceGridLiveChainRepresentativeItem[]
}

type RepresentativePluginLike = Pick<ChainPlugin, 'uri' | 'position'> & {
  name?: string | null
  bypassed?: boolean
  bypass?: boolean
  sidechain_source?: string | null
  sidechain_bus?: number | null
  plugin_display_type?: string | null
}

interface RepresentativeItemSource {
  plugins: RepresentativePluginLike[]
  loop_insertions?: LoopInsertion[]
  effects_loops?: EffectsLoop[]
}

export interface JuceGridRevertedState {
  flowSlots: JuceGridFlowSlotState[]
  routing: JuceGridRoutingState
  activeFlowIndex: number
  truncated: boolean
}

function getRuntimeStatus(chain: Chain): ChainRuntimeSyncStatus | 'inactive' | 'missing' {
  const runtimeStatus = chain.runtime_sync?.status
  if (typeof runtimeStatus === 'string' && runtimeStatus.trim().length > 0) {
    return runtimeStatus
  }
  return chain.is_active ? 'missing' : 'inactive'
}

function getProjectionStatus(chain: Chain): JuceGridLiveChainStatus | null {
  const runtimeStatus = getRuntimeStatus(chain)
  if (LIVE_RUNTIME_STATUSES.has(runtimeStatus)) {
    return 'live'
  }
  if (chain.is_active || runtimeStatus === 'capability_gap' || runtimeStatus === 'missing') {
    return 'degraded'
  }
  return null
}

function sortFlowSlotsByLabel(flowSlots: JuceGridFlowSlotState[]): JuceGridFlowSlotState[] {
  return [...flowSlots].sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    if (labelCompare !== 0) {
      return labelCompare
    }
    return left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
  })
}

function nextAvailableFlowLabel(usedLabels: Set<string>, labelIndex: number): string {
  let index = labelIndex
  while (true) {
    const candidate = index < 26
      ? String.fromCharCode(65 + index)
      : `Live ${index - 25}`
    index += 1
    if (usedLabels.has(candidate)) {
      continue
    }
    usedLabels.add(candidate)
    return candidate
  }
}

const HUMANIZED_ACRONYMS = new Map([
  ['fx', 'FX'],
  ['ir', 'IR'],
  ['avb', 'AVB'],
  ['midi', 'MIDI'],
  ['sc', 'SC'],
])

function humanizeDisplayLabel(value: string | null | undefined, fallback: string): string {
  const displaySource = typeof value === 'string' && value.trim().length > 0 ? value : fallback
  const normalizedSource = displaySource
    .split('/')
    .pop()
    ?.replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? fallback

  const sanitized = sanitizeRestrictedDisplayText(normalizedSource)
  if (!sanitized) {
    return fallback
  }

  return sanitized
    .split(' ')
    .map((word) => {
      const lowered = word.toLowerCase()
      const acronym = HUMANIZED_ACRONYMS.get(lowered)
      if (acronym) {
        return acronym
      }
      return lowered.charAt(0).toUpperCase() + lowered.slice(1)
    })
    .join(' ')
}

function getLoopIconHint(topologyOrMode: string | undefined): string {
  switch (topologyOrMode?.toLowerCase().trim()) {
    case 'serial_insert':
    case 'insert':
      return 'rack'
    case 'parallel_send_return':
      return 'splitter'
    case 'dual_parallel':
      return 'stereo'
    case 'multiband_split':
      return 'multiband'
    case 'send_only':
      return 'terminal'
    case 'return_only':
      return 'utility'
    default:
      return 'rack'
  }
}

function getPluginIconHint(plugin: RepresentativePluginLike): string {
  return [
    plugin.plugin_display_type,
    plugin.name,
    plugin.uri,
  ].find((value): value is string => Boolean(value && value.trim())) ?? 'plugin'
}

function getRepresentativePluginBypassState(plugin: RepresentativePluginLike): boolean {
  if (typeof plugin.bypassed === 'boolean') {
    return plugin.bypassed
  }
  return Boolean(plugin.bypass)
}

function buildLoopItem(
  insertion: LoopInsertion,
  effectsLoopById: Map<string, EffectsLoop>,
): JuceGridLiveChainRepresentativeItem {
  const effectsLoop = effectsLoopById.get(insertion.loop_id)
  const topologyOrMode = effectsLoop?.topology || insertion.mode
  const captionParts: string[] = ['Loop']
  if (effectsLoop?.topology) {
    captionParts.push(effectsLoop.topology)
  } else if (insertion.mode) {
    captionParts.push(insertion.mode)
  }
  return {
    id: insertion.insertion_id,
    kind: 'loop',
    label: humanizeDisplayLabel(effectsLoop?.name, insertion.loop_id),
    iconHint: getLoopIconHint(topologyOrMode),
    dimmed: insertion.enabled === false,
    caption: captionParts.join(' · '),
  }
}

function buildPluginItem(plugin: RepresentativePluginLike): JuceGridLiveChainRepresentativeItem {
  const captionParts: string[] = []
  if (typeof plugin.sidechain_source === 'string' && plugin.sidechain_source.trim().length > 0) {
    captionParts.push(`Key ${plugin.sidechain_source}`)
  } else if (typeof plugin.sidechain_bus === 'number' && Number.isFinite(plugin.sidechain_bus)) {
    captionParts.push(`SC bus ${plugin.sidechain_bus}`)
  }
  return {
    id: `${plugin.uri}-${plugin.position}`,
    kind: 'plugin',
    label: getDisplayPluginName(plugin.name ?? undefined, plugin.uri),
    iconHint: getPluginIconHint(plugin),
    dimmed: getRepresentativePluginBypassState(plugin),
    caption: captionParts.length > 0 ? captionParts.join(' · ') : undefined,
  }
}

function buildRepresentativeItemsFromSource(source: RepresentativeItemSource): JuceGridLiveChainRepresentativeItem[] {
  const effectsLoopById = new Map((source.effects_loops ?? []).map((effectsLoop) => [effectsLoop.loop_id, effectsLoop]))
  const loopInsertions = [...(source.loop_insertions ?? [])].sort((left, right) => (
    left.slot_index - right.slot_index || left.insertion_id.localeCompare(right.insertion_id)
  ))
  const plugins = [...source.plugins].sort((left, right) => left.position - right.position)
  const items: JuceGridLiveChainRepresentativeItem[] = []
  let loopIndex = 0

  for (const plugin of plugins) {
    while (loopIndex < loopInsertions.length && loopInsertions[loopIndex].slot_index < plugin.position) {
      items.push(buildLoopItem(loopInsertions[loopIndex], effectsLoopById))
      loopIndex += 1
    }

    items.push(buildPluginItem(plugin))

    while (loopIndex < loopInsertions.length && loopInsertions[loopIndex].slot_index === plugin.position) {
      items.push(buildLoopItem(loopInsertions[loopIndex], effectsLoopById))
      loopIndex += 1
    }
  }

  while (loopIndex < loopInsertions.length) {
    items.push(buildLoopItem(loopInsertions[loopIndex], effectsLoopById))
    loopIndex += 1
  }

  return items
}

function buildRepresentativeItems(chain: Chain): JuceGridLiveChainRepresentativeItem[] {
  return buildRepresentativeItemsFromSource(chain)
}

function buildRepresentativeItemsFromSnapshotPath(path: SnapshotPath): JuceGridLiveChainRepresentativeItem[] {
  const plugins: RepresentativePluginLike[] = (path.plugins ?? []).map((plugin: SnapshotPlugin) => ({
    uri: plugin.uri,
    name: plugin.name,
    position: plugin.position,
    bypass: plugin.bypass,
  }))

  return buildRepresentativeItemsFromSource({
    plugins,
    loop_insertions: path.loop_insertions,
    effects_loops: path.effects_loops,
  })
}

function mapAuthorityPathStatusToRuntimeStatus(
  status: AudioStatePathStatus,
): ChainRuntimeSyncStatus | 'inactive' | 'missing' {
  switch (status) {
    case 'active':
      return 'active'
    case 'pending':
      return 'partial'
    case 'degraded':
      return 'capability_gap'
    case 'not_loaded':
    case 'offline':
      return 'missing'
    default:
      return 'inactive'
  }
}

function buildAuthorityPathWarningText(
  status: AudioStatePathStatus,
  statusReason: string | null | undefined,
  label: string,
): string | null {
  if (typeof statusReason === 'string' && statusReason.trim().length > 0) {
    return statusReason
  }

  switch (status) {
    case 'pending':
      return `Channel ${label} pending apply.`
    case 'not_loaded':
      return `Channel ${label} is not loaded.`
    case 'offline':
      return `Channel ${label} is offline.`
    case 'degraded':
      return `Channel ${label} is degraded.`
    default:
      return null
  }
}

function getProjectionMatchChainIds(projection: JuceGridLiveChainProjection): number[] {
  return [
    projection.chainId,
    projection.runtimeChainId ?? undefined,
    projection.snapshotChainId ?? undefined,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

export function hasCommittedAuthorityLivePaths(
  authoritativeAudioState: AuthoritativeAudioState | null | undefined,
): boolean {
  return Boolean(authoritativeAudioState?.source_snapshot)
    || (authoritativeAudioState?.paths.length ?? 0) > 0
}

export function getJuceGridDesiredLiveChainIds(flowSlots: JuceGridFlowSlotState[]): number[] {
  const orderedFlowSlots = sortFlowSlotsByLabel(flowSlots).filter((flowSlot) => flowSlot.chainId !== null)
  const seenChainIds = new Set<number>()
  const desiredChainIds: number[] = []

  for (const flowSlot of orderedFlowSlots) {
    const chainId = flowSlot.chainId
    if (chainId === null || seenChainIds.has(chainId)) {
      continue
    }
    seenChainIds.add(chainId)
    desiredChainIds.push(chainId)
  }

  return desiredChainIds
}

export function buildJuceGridLiveChainProjection(
  chains: Chain[],
  flowSlots: JuceGridFlowSlotState[],
): JuceGridLiveChainProjection[] {
  const flowSlotsByChainId = new Map<number, JuceGridFlowSlotState[]>()
  for (const flowSlot of flowSlots) {
    if (flowSlot.chainId === null) {
      continue
    }
    const flowSlotsForChain = flowSlotsByChainId.get(flowSlot.chainId) ?? []
    flowSlotsForChain.push(flowSlot)
    flowSlotsByChainId.set(flowSlot.chainId, flowSlotsForChain)
  }

  for (const [chainId, flowSlotsForChain] of flowSlotsByChainId) {
    flowSlotsByChainId.set(chainId, sortFlowSlotsByLabel(flowSlotsForChain))
  }

  const usedLabels = new Set(flowSlots.map((flowSlot) => flowSlot.label))
  let syntheticLabelIndex = 0
  const projections: JuceGridLiveChainProjection[] = []

  for (const chain of chains) {
    const status = getProjectionStatus(chain)
    if (!status) {
      continue
    }

    const matchingFlowSlots = flowSlotsByChainId.get(chain.id) ?? []
    const flowLabels = matchingFlowSlots.length > 0
      ? matchingFlowSlots.map((flowSlot) => flowSlot.label)
      : [nextAvailableFlowLabel(usedLabels, syntheticLabelIndex++)]
    const warningText = chain.runtime_sync?.warnings?.[0]
      ?? chain.runtime_sync?.reason
      ?? (status === 'degraded' && !chain.runtime_sync ? 'Live runtime truth is unavailable.' : null)

    projections.push({
      chainId: chain.id,
      runtimeChainId: chain.id,
      snapshotChainId: null,
      chainName: chain.name,
      status,
      runtimeStatus: getRuntimeStatus(chain),
      flowLabels,
      primaryFlowLabel: flowLabels[0],
      syntheticFlow: matchingFlowSlots.length === 0,
      warningText,
      representativeItems: buildRepresentativeItems(chain),
    })
  }

  return projections.sort((left, right) => {
    const labelCompare = left.primaryFlowLabel.localeCompare(right.primaryFlowLabel, undefined, { sensitivity: 'base' })
    if (labelCompare !== 0) {
      return labelCompare
    }
    const chainCompare = left.chainName.localeCompare(right.chainName, undefined, { sensitivity: 'base' })
    if (chainCompare !== 0) {
      return chainCompare
    }
    return left.chainId - right.chainId
  })
}

export function buildAuthoritativeJuceGridLiveChainProjection(params: {
  chains: Chain[]
  flowSlots: JuceGridFlowSlotState[]
  authoritativeAudioState: AuthoritativeAudioState | null | undefined
  authoritySnapshotPaths?: SnapshotPath[] | null | undefined
}): JuceGridLiveChainProjection[] {
  const {
    chains,
    flowSlots,
    authoritativeAudioState,
    authoritySnapshotPaths,
  } = params

  if (!hasCommittedAuthorityLivePaths(authoritativeAudioState)) {
    return []
  }

  const chainsById = new Map(chains.map((chain) => [chain.id, chain] as const))
  const snapshotPaths = authoritySnapshotPaths ?? []
  const snapshotPathById = new Map(snapshotPaths.map((path) => [path.id, path] as const))
  const snapshotPathBySnapshotChainId = new Map(
    snapshotPaths
      .filter((path) => typeof path.snapshot_chain_id === 'number' && Number.isFinite(path.snapshot_chain_id))
      .map((path) => [path.snapshot_chain_id as number, path] as const),
  )
  const flowSlotsByChainId = new Map<number, JuceGridFlowSlotState[]>()
  for (const flowSlot of flowSlots) {
    if (flowSlot.chainId === null) {
      continue
    }
    const flowSlotsForChain = flowSlotsByChainId.get(flowSlot.chainId) ?? []
    flowSlotsForChain.push(flowSlot)
    flowSlotsByChainId.set(flowSlot.chainId, flowSlotsForChain)
  }

  const sortIndexByPathId = new Map(
    (authoritativeAudioState?.desired.routing.path_order ?? []).map((pathId, index) => [pathId, index] as const),
  )

  const projectionEntries: Array<{ sortIndex: number; projection: JuceGridLiveChainProjection } | null> = [...(authoritativeAudioState?.paths ?? [])]
    .map((path) => {
      const runtimeChainId = typeof path.runtime_chain_id === 'number' ? path.runtime_chain_id : null
      const snapshotChainId = typeof path.snapshot_chain_id === 'number' ? path.snapshot_chain_id : null
      const chainId = runtimeChainId ?? snapshotChainId

      if (chainId === null) {
        return null
      }

      const matchingFlowSlots = sortFlowSlotsByLabel([
        ...(runtimeChainId != null ? (flowSlotsByChainId.get(runtimeChainId) ?? []) : []),
        ...(snapshotChainId != null && snapshotChainId !== runtimeChainId ? (flowSlotsByChainId.get(snapshotChainId) ?? []) : []),
      ].filter((flowSlot, index, collection) => (
        collection.findIndex((candidate) => candidate.id === flowSlot.id) === index
      )))

      const snapshotPath = snapshotPathById.get(path.path_id)
        ?? (snapshotChainId != null ? snapshotPathBySnapshotChainId.get(snapshotChainId) : undefined)
      const chain = (runtimeChainId != null ? chainsById.get(runtimeChainId) : undefined)
        ?? (snapshotChainId != null ? chainsById.get(snapshotChainId) : undefined)
      const fallbackFlowLabel = path.label
        || snapshotPath?.label
        || `Path ${path.path_id}`
      const flowLabels = matchingFlowSlots.length > 0
        ? matchingFlowSlots.map((flowSlot) => flowSlot.label)
        : [fallbackFlowLabel]

      return {
        sortIndex: sortIndexByPathId.get(path.path_id) ?? Number.MAX_SAFE_INTEGER,
        projection: {
          chainId,
          runtimeChainId,
          snapshotChainId,
          chainName: chain?.name ?? snapshotPath?.name ?? fallbackFlowLabel,
          status: path.status === 'active' ? 'live' : 'degraded',
          runtimeStatus: mapAuthorityPathStatusToRuntimeStatus(path.status),
          flowLabels,
          primaryFlowLabel: flowLabels[0],
          syntheticFlow: matchingFlowSlots.length === 0,
          warningText: buildAuthorityPathWarningText(path.status, path.status_reason, fallbackFlowLabel),
          representativeItems: chain
            ? buildRepresentativeItems(chain)
            : snapshotPath
              ? buildRepresentativeItemsFromSnapshotPath(snapshotPath)
              : [],
        } satisfies JuceGridLiveChainProjection,
      }
    })
  return projectionEntries
    .filter((entry): entry is { sortIndex: number; projection: JuceGridLiveChainProjection } => entry !== null)
    .sort((left, right) => {
      if (left.sortIndex !== right.sortIndex) {
        return left.sortIndex - right.sortIndex
      }

      const labelCompare = left.projection.primaryFlowLabel.localeCompare(right.projection.primaryFlowLabel, undefined, { sensitivity: 'base' })
      if (labelCompare !== 0) {
        return labelCompare
      }
      return left.projection.chainId - right.projection.chainId
    })
    .map((entry) => entry.projection)
}

export function hasJuceGridLiveChainMismatch(
  projections: JuceGridLiveChainProjection[],
  flowSlots: JuceGridFlowSlotState[],
): boolean {
  const desiredChainIds = getJuceGridDesiredLiveChainIds(flowSlots)
  if (desiredChainIds.length !== projections.length) {
    return true
  }

  return desiredChainIds.some((chainId, index) => {
    const projection = projections[index]
    if (!projection) {
      return true
    }
    return !getProjectionMatchChainIds(projection).includes(chainId)
  })
}

export function applyOptimisticJuceGridLiveChainSet(
  response: ChainsResponse | undefined,
  activeChainIds: Iterable<number>,
): ChainsResponse | undefined {
  if (!response) {
    return response
  }

  const activeChainIdSet = new Set(activeChainIds)
  return {
    ...response,
    chains: response.chains.map((chain) => {
      const shouldBeActive = activeChainIdSet.has(chain.id)
      if (shouldBeActive) {
        return {
          ...chain,
          is_active: true,
          runtime_sync: chain.runtime_sync
            ? {
                ...chain.runtime_sync,
                status: LIVE_RUNTIME_STATUSES.has(chain.runtime_sync.status)
                  ? chain.runtime_sync.status
                  : 'partial',
              }
            : {
                enabled: true,
                status: 'partial',
                warnings: [],
                runtime_items: chain.plugins.length,
                restored_positions: [],
                missing_positions: [],
              },
        }
      }

      return {
        ...chain,
        is_active: false,
        runtime_sync: chain.runtime_sync
          ? {
              ...chain.runtime_sync,
              status: 'inactive',
            }
          : undefined,
      }
    }),
  }
}

export function buildJuceGridRevertedStateFromLiveProjection(
  projections: JuceGridLiveChainProjection[],
  currentFlowSlots: JuceGridFlowSlotState[],
  currentRouting: JuceGridRoutingState,
  currentActiveFlowIndex: number,
  palette: JuceGridSlotPaletteEntry[],
  maxFlows: number,
): JuceGridRevertedState {
  const previousActiveChainId = currentFlowSlots[currentActiveFlowIndex]?.chainId ?? null
  const limitedProjections = projections.slice(0, maxFlows)

  if (limitedProjections.length === 0) {
    const fallbackFlowSlots = createDefaultJuceGridFlowSlots(palette, 1)
    return {
      flowSlots: fallbackFlowSlots,
      routing: normalizeJuceGridRouting(currentRouting, fallbackFlowSlots),
      activeFlowIndex: 0,
      truncated: false,
    }
  }

  const fallbackFlowSlots = createDefaultJuceGridFlowSlots(palette, limitedProjections.length)
  const nextFlowSlots = limitedProjections.map((projection, index) => {
    const projectionChainIds = new Set(getProjectionMatchChainIds(projection))
    const matchingFlowSlots = sortFlowSlotsByLabel(
      currentFlowSlots.filter((flowSlot) => flowSlot.chainId !== null && projectionChainIds.has(flowSlot.chainId)),
    )
    const sourceFlowSlot = matchingFlowSlots[0]
    const fallbackFlowSlot = fallbackFlowSlots[index]

    return {
      ...fallbackFlowSlot,
      id: sourceFlowSlot?.id ?? fallbackFlowSlot.id,
      chainId: projection.chainId,
      label: sourceFlowSlot?.label ?? projection.primaryFlowLabel,
      color: sourceFlowSlot?.color ?? fallbackFlowSlot.color,
      muted: sourceFlowSlot?.muted ?? false,
      solo: sourceFlowSlot?.solo ?? false,
      dryWetMix: sourceFlowSlot?.dryWetMix ?? fallbackFlowSlot.dryWetMix,
    }
  })

  const nextActiveFlowIndex = limitedProjections.findIndex((projection) => (
    previousActiveChainId !== null && getProjectionMatchChainIds(projection).includes(previousActiveChainId)
  ))
  return {
    flowSlots: nextFlowSlots,
    routing: normalizeJuceGridRouting(currentRouting, nextFlowSlots),
    activeFlowIndex: normalizeJuceGridActiveFlowIndex(
      nextActiveFlowIndex >= 0 ? nextActiveFlowIndex : 0,
      nextFlowSlots,
    ),
    truncated: projections.length > maxFlows,
  }
}

export {
  applyOptimisticJuceGridLiveChainSet as applyOptimisticSnapshotEditorLiveChainSet,
  buildAuthoritativeJuceGridLiveChainProjection as buildAuthoritativeSnapshotEditorLiveChainProjection,
  buildJuceGridLiveChainProjection as buildSnapshotEditorLiveChainProjection,
  buildJuceGridRevertedStateFromLiveProjection as buildSnapshotEditorRevertedStateFromLiveProjection,
  hasCommittedAuthorityLivePaths as hasCommittedSnapshotEditorAuthorityLivePaths,
  getJuceGridDesiredLiveChainIds as getSnapshotEditorDesiredLiveChainIds,
  hasJuceGridLiveChainMismatch as hasSnapshotEditorLiveChainMismatch,
}

export type SnapshotEditorLiveChainProjection = JuceGridLiveChainProjection
export type SnapshotEditorLiveChainRepresentativeItem = JuceGridLiveChainRepresentativeItem
export type SnapshotEditorLiveChainStatus = JuceGridLiveChainStatus
export type SnapshotEditorRevertedState = JuceGridRevertedState
