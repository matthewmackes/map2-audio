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
      is_active: detail.is_active,
      created_at: detail.created_at ?? detail.live_state?.activated_at ?? new Date(0).toISOString(),
      updated_at: detail.updated_at ?? detail.live_state?.activated_at ?? new Date(0).toISOString(),
      plugins: [...(path.plugins ?? [])].map((plugin, index) => ({
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

export function buildEffectiveLiveSnapshotChains(
  detail: SnapshotDetail,
  currentChains: ChainsResponse | undefined,
): ChainsResponse {
  const runtimeChains = detail.live_state?.runtime_chains ?? []
  const syntheticRuntimeChains = buildSyntheticRuntimeChains(detail)
  const syntheticRuntimeChainById = new Map(
    syntheticRuntimeChains.map((chain) => [chain.id, chain] as const),
  )
  const mergedRuntimeChains = runtimeChains.map((chain) => (
    mergeRuntimeChainWithSynthetic(chain, syntheticRuntimeChainById.get(chain.id))
  ))
  return upsertRuntimeChains(
    upsertRuntimeChains(currentChains, syntheticRuntimeChains),
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
