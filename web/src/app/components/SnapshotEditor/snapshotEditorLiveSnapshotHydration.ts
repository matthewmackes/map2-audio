import { snapshotDetailToDraftData } from '../../../map2/clients/snapshots'
import type { Chain, ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import { fingerprintSnapshotData } from './snapshotEditorComparison'

export interface SnapshotEditorLiveSnapshotHydration {
  snapshotData: SnapshotDraftData
  chainsResponse: ChainsResponse
  fingerprint: string
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

export function buildSnapshotEditorLiveSnapshotHydration(
  detail: SnapshotDetail,
  currentChains: ChainsResponse | undefined,
): SnapshotEditorLiveSnapshotHydration {
  const snapshotData = snapshotDetailToDraftData(detail)
  return {
    snapshotData,
    chainsResponse: upsertRuntimeChains(currentChains, detail.live_state?.runtime_chains ?? []),
    fingerprint: fingerprintSnapshotData(snapshotData),
  }
}
