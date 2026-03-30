import { snapshotDetailToDraftData } from '../../../map2/clients/snapshots'
import type { Chain, ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import { fingerprintSnapshotData } from './snapshotEditorComparison'

export interface SnapshotEditorLiveSnapshotHydration {
  snapshotData: SnapshotDraftData
  chainsResponse: ChainsResponse
  fingerprint: string
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
  return upsertRuntimeChains(
    upsertRuntimeChains(currentChains, syntheticRuntimeChains),
    runtimeChains,
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
