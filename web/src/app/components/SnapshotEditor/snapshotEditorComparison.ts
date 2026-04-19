import type {
  ChainSnapshot,
  Plugin,
  SnapshotChannel,
  SnapshotDetail,
  SnapshotDraftData,
  SnapshotPath,
  SnapshotPlugin,
} from '../../../map2/types'
import { getDisplayPluginName } from '../../../map2/displayNames'

export interface SnapshotComparisonSummary {
  pathChanges: number
  chainChanges: number
  paramChanges: number
  routingChanged: boolean
  activePathChanged: boolean
}

export interface SnapshotGoLiveDiff {
  count: number
  items: string[]
}

interface NormalizedSnapshotPath {
  id: string
  name: string
  label: string
  orderIndex: number
  plugins: SnapshotPlugin[]
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function getChainSnapshotForChainId(snapshotData: SnapshotDraftData, chainId: number | null): ChainSnapshot | null {
  if (chainId === null) {
    return null
  }
  return snapshotData.chains[String(chainId)] ?? null
}

function formatRoutingMode(mode: SnapshotDetail['routing']['mode'] | SnapshotDraftData['routing']['mode']): string {
  switch (mode) {
    case 'parallel_blend':
      return 'Parallel Blend'
    case 'ab_switch':
      return 'A/B'
    case 'series':
      return 'Series'
    case 'morph':
    case 'parameter_morph':
      return 'Morph'
    case 'sidechain':
      return 'Sidechain'
    default:
      return String(mode ?? 'Unknown')
  }
}

function formatDiffValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Math.abs(value) >= 100) {
      return value.toFixed(0)
    }
    return value.toFixed(2).replace(/\.?0+$/, '')
  }

  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off'
  }

  if (value == null || value === '') {
    return 'Unset'
  }

  return String(value)
}

function getSnapshotPaths(detail: SnapshotDetail): NormalizedSnapshotPath[] {
  const detailPaths = Array.isArray(detail.paths) ? detail.paths : []
  if (detailPaths.length > 0) {
    return [...detailPaths]
      .sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0))
      .map((path) => ({
        id: path.id,
        name: path.name,
        label: path.label,
        orderIndex: path.order_index ?? 0,
        plugins: path.plugins ?? [],
      }))
  }

  return detail.channels
    .map((channel, index) => normalizeChannelPath(channel, detail, index))
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

function normalizeChannelPath(channel: SnapshotChannel, detail: SnapshotDetail, index: number): NormalizedSnapshotPath {
  const chain = detail.chains.find((candidate) => candidate.id === channel.chain_id)
  return {
    id: channel.channel_key,
    name: chain?.name ?? `Path ${index + 1}`,
    label: channel.label,
    orderIndex: channel.order_index ?? index,
    plugins: chain?.plugins ?? [],
  }
}

function formatChannelLabel(path: NormalizedSnapshotPath): string {
  const preferredName = path.name?.trim() || path.label?.trim() || path.id
  return `Channel ${preferredName}`
}

function resolvePluginDisplayName(
  plugin: SnapshotPlugin,
  pluginMeta?: Record<string, Plugin>,
): string {
  const metadata = pluginMeta?.[plugin.uri]
  const fallbackName = plugin.name?.trim() || metadata?.name || plugin.uri.split('/').pop() || 'Processor'
  return getDisplayPluginName(fallbackName, plugin.uri)
}

function resolveParameterLabel(
  plugin: SnapshotPlugin,
  key: string,
  pluginMeta?: Record<string, Plugin>,
): string {
  const metadata = pluginMeta?.[plugin.uri]
  const parameter = metadata?.parameters.find((entry) => entry.symbol === key || entry.name === key)
  return parameter?.name?.trim() || key
}

function buildLoaderStateDiffItems(
  sourcePlugin: SnapshotPlugin,
  targetPlugin: SnapshotPlugin,
  channelLabel: string,
): string[] {
  const sourceLoaderState = sourcePlugin.loader_state ?? {}
  const targetLoaderState = targetPlugin.loader_state ?? {}
  const nextItems: string[] = []
  const pluginName = getDisplayPluginName(
    targetPlugin.name?.trim() || sourcePlugin.name?.trim() || targetPlugin.uri.split('/').pop() || 'Processor',
    targetPlugin.uri,
  )
  const comparableFields = [
    ['selected_model', 'model'],
    ['selected_asset_name', 'asset'],
    ['selected_ir', 'IR'],
  ] as const

  comparableFields.forEach(([field, label]) => {
    const sourceValue = sourceLoaderState[field]
    const targetValue = targetLoaderState[field]
    if (sourceValue !== targetValue) {
      nextItems.push(`${pluginName} ${label}: ${formatDiffValue(sourceValue)} -> ${formatDiffValue(targetValue)} on ${channelLabel}`)
    }
  })

  return nextItems
}

function comparePluginsForPath(
  sourcePath: NormalizedSnapshotPath | null,
  targetPath: NormalizedSnapshotPath | null,
  pluginMeta?: Record<string, Plugin>,
): string[] {
  const channelLabel = formatChannelLabel(targetPath ?? sourcePath ?? {
    id: 'unknown',
    name: 'Unknown',
    label: 'Unknown',
    orderIndex: 0,
    plugins: [],
  })
  const sourcePlugins = sourcePath?.plugins ?? []
  const targetPlugins = targetPath?.plugins ?? []
  const pluginCount = Math.max(sourcePlugins.length, targetPlugins.length)
  const items: string[] = []

  for (let index = 0; index < pluginCount; index += 1) {
    const sourcePlugin = sourcePlugins[index]
    const targetPlugin = targetPlugins[index]

    if (!sourcePlugin && targetPlugin) {
      items.push(`+ ${resolvePluginDisplayName(targetPlugin, pluginMeta)} added to ${channelLabel}`)
      continue
    }

    if (sourcePlugin && !targetPlugin) {
      items.push(`- ${resolvePluginDisplayName(sourcePlugin, pluginMeta)} removed from ${channelLabel}`)
      continue
    }

    if (!sourcePlugin || !targetPlugin) {
      continue
    }

    if (sourcePlugin.uri !== targetPlugin.uri) {
      items.push(`- ${resolvePluginDisplayName(sourcePlugin, pluginMeta)} removed from ${channelLabel}`)
      items.push(`+ ${resolvePluginDisplayName(targetPlugin, pluginMeta)} added to ${channelLabel}`)
      continue
    }

    const pluginName = resolvePluginDisplayName(targetPlugin, pluginMeta)
    if (sourcePlugin.bypass !== targetPlugin.bypass) {
      items.push(`${pluginName}: ${sourcePlugin.bypass ? 'bypassed' : 'active'} -> ${targetPlugin.bypass ? 'bypassed' : 'active'} on ${channelLabel}`)
    }

    items.push(...buildLoaderStateDiffItems(sourcePlugin, targetPlugin, channelLabel))

    const parameterKeys = new Set([
      ...Object.keys(sourcePlugin.parameters ?? {}),
      ...Object.keys(targetPlugin.parameters ?? {}),
    ])
    Array.from(parameterKeys)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        const sourceValue = sourcePlugin.parameters?.[key]
        const targetValue = targetPlugin.parameters?.[key]
        if (sourceValue !== targetValue) {
          items.push(
            `${pluginName} ${resolveParameterLabel(targetPlugin, key, pluginMeta)}: ${formatDiffValue(sourceValue)} -> ${formatDiffValue(targetValue)} on ${channelLabel}`,
          )
        }
      })
  }

  return items
}

export function buildSnapshotGoLiveDiff(
  source: SnapshotDetail,
  target: SnapshotDetail,
  pluginMeta?: Record<string, Plugin>,
): SnapshotGoLiveDiff {
  const items: string[] = []

  if (source.routing.mode !== target.routing.mode) {
    items.push(`Routing mode: ${formatRoutingMode(source.routing.mode)} -> ${formatRoutingMode(target.routing.mode)}`)
  }

  if (source.routing.active_channel_key !== target.routing.active_channel_key) {
    items.push(`Active channel: ${formatDiffValue(source.routing.active_channel_key)} -> ${formatDiffValue(target.routing.active_channel_key)}`)
  }

  const sourcePaths = getSnapshotPaths(source)
  const targetPaths = getSnapshotPaths(target)
  const orderedPathIds = Array.from(
    new Set([
      ...targetPaths.map((path) => path.id),
      ...sourcePaths.map((path) => path.id),
    ]),
  )
  const sourcePathById = new Map(sourcePaths.map((path) => [path.id, path] as const))
  const targetPathById = new Map(targetPaths.map((path) => [path.id, path] as const))

  orderedPathIds.forEach((pathId) => {
    items.push(...comparePluginsForPath(
      sourcePathById.get(pathId) ?? null,
      targetPathById.get(pathId) ?? null,
      pluginMeta,
    ))
  })

  return {
    count: items.length,
    items,
  }
}

export function fingerprintSnapshotData(snapshotData: SnapshotDraftData): string {
  return stableSerialize(snapshotData)
}

export function buildSnapshotComparisonSummary(
  source: SnapshotDraftData,
  target: SnapshotDraftData,
): SnapshotComparisonSummary {
  let pathChanges = 0
  let chainChanges = 0
  let paramChanges = 0

  const pathCount = Math.max(source.flowSlots.length, target.flowSlots.length)
  for (let index = 0; index < pathCount; index += 1) {
    const sourceSlot = source.flowSlots[index]
    const targetSlot = target.flowSlots[index]
    if (!sourceSlot || !targetSlot) {
      pathChanges += 1
      continue
    }

    const sourceSlotFingerprint = stableSerialize({
      id: sourceSlot.id,
      label: sourceSlot.label,
      color: sourceSlot.color,
      muted: sourceSlot.muted,
      solo: sourceSlot.solo,
      dryWetMix: sourceSlot.dryWetMix,
      hasChain: sourceSlot.chainId !== null,
    })
    const targetSlotFingerprint = stableSerialize({
      id: targetSlot.id,
      label: targetSlot.label,
      color: targetSlot.color,
      muted: targetSlot.muted,
      solo: targetSlot.solo,
      dryWetMix: targetSlot.dryWetMix,
      hasChain: targetSlot.chainId !== null,
    })
    if (sourceSlotFingerprint !== targetSlotFingerprint) {
      pathChanges += 1
    }

    const sourceChain = getChainSnapshotForChainId(source, sourceSlot.chainId)
    const targetChain = getChainSnapshotForChainId(target, targetSlot.chainId)
    if (stableSerialize(sourceChain) !== stableSerialize(targetChain)) {
      chainChanges += 1
    }

    const sourcePlugins = sourceChain?.plugins ?? []
    const targetPlugins = targetChain?.plugins ?? []
    const pluginCount = Math.max(sourcePlugins.length, targetPlugins.length)
    for (let pluginIndex = 0; pluginIndex < pluginCount; pluginIndex += 1) {
      const sourcePlugin = sourcePlugins[pluginIndex]
      const targetPlugin = targetPlugins[pluginIndex]
      if (!sourcePlugin || !targetPlugin) {
        paramChanges += 1
        continue
      }
      if (sourcePlugin.uri !== targetPlugin.uri || sourcePlugin.bypass !== targetPlugin.bypass) {
        paramChanges += 1
      }

      const parameterKeys = new Set([
        ...Object.keys(sourcePlugin.parameters ?? {}),
        ...Object.keys(targetPlugin.parameters ?? {}),
      ])
      for (const key of parameterKeys) {
        if ((sourcePlugin.parameters ?? {})[key] !== (targetPlugin.parameters ?? {})[key]) {
          paramChanges += 1
        }
      }
    }
  }

  return {
    pathChanges,
    chainChanges,
    paramChanges,
    routingChanged: stableSerialize(source.routing) !== stableSerialize(target.routing),
    activePathChanged: source.activeFlowIndex !== target.activeFlowIndex,
  }
}

export function checkSnapshotMorphCompatibility(
  source: SnapshotDraftData,
  target: SnapshotDraftData,
): { ok: boolean; reason: string | null } {
  if (source.flowSlots.length !== target.flowSlots.length) {
    return { ok: false, reason: 'Morph requires the same number of paths in both snapshots.' }
  }
  if (source.routing.mode !== target.routing.mode) {
    return { ok: false, reason: 'Morph requires both snapshots to use the same routing mode.' }
  }

  for (let index = 0; index < source.flowSlots.length; index += 1) {
    const sourceSlot = source.flowSlots[index]
    const targetSlot = target.flowSlots[index]
    if (!targetSlot || sourceSlot.id !== targetSlot.id) {
      return { ok: false, reason: 'Morph requires matching path identities.' }
    }

    const sourceChain = getChainSnapshotForChainId(source, sourceSlot.chainId)
    const targetChain = getChainSnapshotForChainId(target, targetSlot.chainId)
    if (!sourceChain && !targetChain) {
      continue
    }
    if (!sourceChain || !targetChain) {
      return { ok: false, reason: 'Morph requires chain assignments on the same paths in both snapshots.' }
    }
    if (sourceChain.plugins.length !== targetChain.plugins.length) {
      return { ok: false, reason: 'Morph requires matching plugin counts for each path.' }
    }
    for (let pluginIndex = 0; pluginIndex < sourceChain.plugins.length; pluginIndex += 1) {
      if (sourceChain.plugins[pluginIndex]?.uri !== targetChain.plugins[pluginIndex]?.uri) {
        return { ok: false, reason: 'Morph requires matching plugin order for each compared path.' }
      }
    }
  }

  return { ok: true, reason: null }
}

export function interpolateSnapshotData(
  source: SnapshotDraftData,
  target: SnapshotDraftData,
  progress: number,
): SnapshotDraftData {
  const clamped = Math.max(0, Math.min(1, progress))

  const flowSlots = source.flowSlots.map((sourceSlot, index) => {
    const targetSlot = target.flowSlots[index] ?? sourceSlot
    return {
      ...sourceSlot,
      dryWetMix: sourceSlot.dryWetMix + ((targetSlot.dryWetMix ?? sourceSlot.dryWetMix) - sourceSlot.dryWetMix) * clamped,
      muted: clamped >= 1 ? targetSlot.muted : sourceSlot.muted,
      solo: clamped >= 1 ? targetSlot.solo : sourceSlot.solo,
      chainId: sourceSlot.chainId,
      label: clamped >= 1 ? targetSlot.label : sourceSlot.label,
      color: clamped >= 1 ? targetSlot.color : sourceSlot.color,
    }
  })

  const blendKeys = new Set([
    ...Object.keys(source.routing.blendPositions ?? {}),
    ...Object.keys(target.routing.blendPositions ?? {}),
  ])
  const blendPositions: Record<string, number> = {}
  for (const key of blendKeys) {
    const start = source.routing.blendPositions[key] ?? target.routing.blendPositions[key] ?? 0
    const end = target.routing.blendPositions[key] ?? start
    blendPositions[key] = start + (end - start) * clamped
  }

  const chains: Record<string, ChainSnapshot> = {}
  for (let index = 0; index < source.flowSlots.length; index += 1) {
    const sourceSlot = source.flowSlots[index]
    const targetSlot = target.flowSlots[index] ?? sourceSlot
    const sourceChain = getChainSnapshotForChainId(source, sourceSlot.chainId)
    const targetChain = getChainSnapshotForChainId(target, targetSlot.chainId)
    if (!sourceSlot.chainId || !sourceChain) {
      continue
    }
    if (!targetChain) {
      chains[String(sourceSlot.chainId)] = sourceChain
      continue
    }

    chains[String(sourceSlot.chainId)] = {
      name: clamped >= 1 ? targetChain.name : sourceChain.name,
      plugins: sourceChain.plugins.map((sourcePlugin, pluginIndex) => {
        const targetPlugin = targetChain.plugins[pluginIndex] ?? sourcePlugin
        const parameterKeys = new Set([
          ...Object.keys(sourcePlugin.parameters ?? {}),
          ...Object.keys(targetPlugin.parameters ?? {}),
        ])
        const parameters: Record<string, number> = {}
        for (const key of parameterKeys) {
          const start = sourcePlugin.parameters?.[key] ?? targetPlugin.parameters?.[key] ?? 0
          const end = targetPlugin.parameters?.[key] ?? start
          parameters[key] = start + (end - start) * clamped
        }
        return {
          uri: sourcePlugin.uri,
          position: sourcePlugin.position,
          bypass: clamped >= 1 ? targetPlugin.bypass : sourcePlugin.bypass,
          parameters,
        }
      }),
    }
  }

  return {
    flowSlots,
    routing: {
      mode: source.routing.mode,
      activeSlotId: clamped >= 1 ? target.routing.activeSlotId : source.routing.activeSlotId,
      blendPositions,
      morphProgress: source.routing.morphProgress + (target.routing.morphProgress - source.routing.morphProgress) * clamped,
      morphSourceSlotId: clamped >= 1 ? target.routing.morphSourceSlotId : source.routing.morphSourceSlotId,
      morphTargetSlotId: clamped >= 1 ? target.routing.morphTargetSlotId : source.routing.morphTargetSlotId,
      seriesOrder: clamped >= 1 ? target.routing.seriesOrder : source.routing.seriesOrder,
    },
    activeFlowIndex: clamped >= 1 ? target.activeFlowIndex : source.activeFlowIndex,
    chains,
  }
}
