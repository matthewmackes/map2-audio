import type { ChainSnapshot, SnapshotDraftData } from '../../../map2/types'

export interface SnapshotComparisonSummary {
  pathChanges: number
  chainChanges: number
  paramChanges: number
  routingChanged: boolean
  activePathChanged: boolean
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
