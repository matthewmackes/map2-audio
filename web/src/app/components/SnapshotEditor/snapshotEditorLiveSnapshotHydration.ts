import { snapshotDetailToDraftData } from '../../../map2/clients/snapshots'
import type { Chain, ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import { fingerprintSnapshotData } from './snapshotEditorComparison'

export interface SnapshotEditorLiveSnapshotHydration {
  snapshotData: SnapshotDraftData
  chainsResponse: ChainsResponse
  fingerprint: string
}

function pluginIdentityKey(plugin: Pick<Chain['plugins'][number], 'uri' | 'position'>): string {
  return `${plugin.uri}::${plugin.position}`
}

function mergeRuntimeChainWithSynthetic(
  runtimeChain: Chain,
  syntheticChain: Chain | undefined,
): Chain {
  if (!syntheticChain) {
    return runtimeChain
  }

  const syntheticPluginByIdentity = new Map(
    syntheticChain.plugins.map((plugin) => [pluginIdentityKey(plugin), plugin] as const),
  )
  const mergedPlugins = runtimeChain.plugins.map((plugin) => {
    const syntheticPlugin = syntheticPluginByIdentity.get(pluginIdentityKey(plugin))
    const runtimeParameters = plugin.parameters ?? {}
    const hasRuntimeParameters = Object.keys(runtimeParameters).length > 0
    return {
      ...syntheticPlugin,
      ...plugin,
      parameters: hasRuntimeParameters
        ? { ...runtimeParameters }
        : { ...(syntheticPlugin?.parameters ?? {}) },
      loader_state: plugin.loader_state ?? syntheticPlugin?.loader_state,
    }
  })
  const mergedPluginIdentityKeys = new Set(mergedPlugins.map((plugin) => pluginIdentityKey(plugin)))
  const trailingSyntheticPlugins = syntheticChain.plugins.filter((plugin) => !mergedPluginIdentityKeys.has(pluginIdentityKey(plugin)))

  return {
    ...syntheticChain,
    ...runtimeChain,
    plugins: [...mergedPlugins, ...trailingSyntheticPlugins],
    loop_insertions: runtimeChain.loop_insertions?.length
      ? [...runtimeChain.loop_insertions]
      : [...(syntheticChain.loop_insertions ?? [])],
    effects_loops: runtimeChain.effects_loops?.length
      ? [...runtimeChain.effects_loops]
      : [...(syntheticChain.effects_loops ?? [])],
    runtime_sync: runtimeChain.runtime_sync ?? syntheticChain.runtime_sync ?? null,
  }
}

function buildSyntheticRuntimeChains(detail: SnapshotDetail): Chain[] {
  return (detail.paths ?? []).flatMap((path) => {
    const runtimeChainId = path.runtime_chain_id
    if (runtimeChainId === null || runtimeChainId === undefined) {
      return []
    }

    return [{
      id: runtimeChainId,
      name: path.name,
      is_active: detail.live_state?.is_live ?? false,
      created_at: detail.created_at ?? detail.live_state?.activated_at ?? new Date(0).toISOString(),
      updated_at: detail.updated_at ?? detail.live_state?.activated_at ?? new Date(0).toISOString(),
      plugins: [...(path.plugins ?? [])].map((plugin, index) => ({
        snapshot_plugin_id: plugin.id ?? null,
        uri: plugin.uri,
        name: plugin.name,
        plugin_display_type: undefined,
        position: plugin.position ?? index,
        bypassed: plugin.bypass ?? false,
        parameters: { ...plugin.parameters },
        loader_state: plugin.loader_state,
      })),
      loop_insertions: [...(path.loop_insertions ?? [])],
      effects_loops: [...(path.effects_loops ?? [])],
      runtime_sync: null,
    }]
  })
}

function buildSyntheticSnapshotChains(detail: SnapshotDetail): Chain[] {
  return (detail.chains ?? []).flatMap((chain) => {
    if (typeof chain.id !== 'number' || !Number.isFinite(chain.id)) {
      return []
    }

    return [{
      id: chain.id,
      name: chain.name,
      is_active: false,
      created_at: detail.created_at ?? new Date(0).toISOString(),
      updated_at: detail.updated_at ?? new Date(0).toISOString(),
      plugins: [...(chain.plugins ?? [])].map((plugin, pluginIndex) => ({
        snapshot_plugin_id: plugin.id ?? null,
        uri: plugin.uri,
        name: plugin.name ?? plugin.uri,
        plugin_display_type: undefined,
        position: plugin.position ?? pluginIndex,
        bypassed: plugin.bypass ?? false,
        parameters: { ...plugin.parameters },
        loader_state: plugin.loader_state,
      })),
      loop_insertions: [...(chain.loop_insertions ?? [])],
      effects_loops: [...(chain.effects_loops ?? [])],
      runtime_sync: null,
    }]
  })
}

export function upsertRuntimeChains(
  current: ChainsResponse | undefined,
  runtimeChains: Chain[],
): ChainsResponse {
  if (runtimeChains.length === 0) {
    return current ?? { chains: [], count: 0 }
  }

  const chainById = new Map<number, Chain>()
  for (const chain of current?.chains ?? []) {
    chainById.set(chain.id, chain)
  }
  for (const chain of runtimeChains) {
    chainById.set(chain.id, chain)
  }

  const chains = [...chainById.values()]
  return {
    chains,
    count: chains.length,
  }
}

function takeDraftPluginRuntimeMatch(
  remainingPlugins: Chain['plugins'],
  draftPlugin: SnapshotDraftData['chains'][string]['plugins'][number],
): Chain['plugins'][number] | undefined {
  const exactIndex = remainingPlugins.findIndex((plugin) => pluginIdentityKey(plugin) === pluginIdentityKey(draftPlugin))
  if (exactIndex >= 0) {
    return remainingPlugins.splice(exactIndex, 1)[0]
  }

  const uriIndex = remainingPlugins.findIndex((plugin) => plugin.uri === draftPlugin.uri)
  if (uriIndex >= 0) {
    return remainingPlugins.splice(uriIndex, 1)[0]
  }

  return undefined
}

function mergeDraftChainIntoRuntimeChain(
  runtimeChain: Chain | undefined,
  chainId: number,
  draftChain: SnapshotDraftData['chains'][string],
): Chain {
  const remainingPlugins = [...(runtimeChain?.plugins ?? [])]

  return {
    ...(runtimeChain ?? {
      id: chainId,
      name: draftChain.name,
      is_active: false,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
      runtime_sync: null,
    }),
    name: draftChain.name,
    plugins: draftChain.plugins.map((plugin) => {
      const runtimePlugin = takeDraftPluginRuntimeMatch(remainingPlugins, plugin)
      return {
        ...runtimePlugin,
        snapshot_plugin_id: runtimePlugin?.snapshot_plugin_id ?? plugin.snapshot_plugin_id ?? null,
        uri: plugin.uri,
        position: plugin.position,
        bypassed: plugin.bypass,
        parameters: { ...plugin.parameters },
        loader_state: plugin.loader_state,
      }
    }),
  }
}

export function applySnapshotDraftToChainsResponse(
  current: ChainsResponse | undefined,
  draft: SnapshotDraftData | null | undefined,
): ChainsResponse {
  if (!draft) {
    return current ?? { chains: [], count: 0 }
  }

  const chainById = new Map<number, Chain>()
  for (const chain of current?.chains ?? []) {
    chainById.set(chain.id, chain)
  }

  for (const [chainKey, draftChain] of Object.entries(draft.chains ?? {})) {
    const chainId = Number(chainKey)
    if (!Number.isInteger(chainId) || chainId <= 0) {
      continue
    }
    chainById.set(chainId, mergeDraftChainIntoRuntimeChain(chainById.get(chainId), chainId, draftChain))
  }

  const chains = [...chainById.values()]
  return {
    chains,
    count: chains.length,
  }
}

export function buildEffectiveLiveSnapshotChains(
  detail: SnapshotDetail,
  currentChains: ChainsResponse | undefined,
): ChainsResponse {
  const snapshotChains = buildSyntheticSnapshotChains(detail)
  const runtimeChains = detail.live_state?.runtime_chains ?? []
  const syntheticRuntimeChains = buildSyntheticRuntimeChains(detail)
  const syntheticRuntimeChainById = new Map(
    syntheticRuntimeChains.map((chain) => [chain.id, chain] as const),
  )
  const mergedRuntimeChains = runtimeChains.map((chain) => (
    mergeRuntimeChainWithSynthetic(chain, syntheticRuntimeChainById.get(chain.id))
  ))
  return upsertRuntimeChains(
    upsertRuntimeChains(
      upsertRuntimeChains(currentChains, snapshotChains),
      syntheticRuntimeChains,
    ),
    mergedRuntimeChains,
  )
}

export function buildSnapshotEditorLiveSnapshotHydration(
  detail: SnapshotDetail,
  currentChains: ChainsResponse | undefined,
): SnapshotEditorLiveSnapshotHydration {
  const snapshotData = snapshotDetailToDraftData(detail)
  return {
    snapshotData,
    chainsResponse: buildEffectiveLiveSnapshotChains(detail, currentChains),
    fingerprint: fingerprintSnapshotData(snapshotData),
  }
}
