import type { Chain, SnapshotDetail } from '../../../map2/types'

function findSnapshotPath(detail: SnapshotDetail, chainId: number) {
  return detail.paths.find((path) => path.runtime_chain_id === chainId || path.snapshot_chain_id === chainId)
}

export function resolveSnapshotChainId(detail: SnapshotDetail | null | undefined, chainId: number): number | null {
  if (!detail) {
    return null
  }

  if (detail.chains.some((chain) => chain.id === chainId)) {
    return chainId
  }

  const path = findSnapshotPath(detail, chainId)
  if (typeof path?.snapshot_chain_id === 'number' && Number.isFinite(path.snapshot_chain_id)) {
    return path.snapshot_chain_id
  }

  return null
}

export function resolveSnapshotPluginIdentity(params: {
  detail: SnapshotDetail | null | undefined
  effectiveChain: Chain | undefined
  chainId: number
  pluginUri: string
  pluginPosition?: number
}): { snapshotChainId: number; snapshotPluginId: number } | null {
  const { detail, effectiveChain, chainId, pluginUri, pluginPosition } = params
  const effectivePlugin = effectiveChain?.plugins.find((candidate) => (
    candidate.uri === pluginUri
    && (typeof pluginPosition !== 'number' || candidate.position === pluginPosition)
  ))

  const snapshotChainId = resolveSnapshotChainId(detail, chainId)
  if (snapshotChainId == null) {
    return null
  }

  if (
    typeof effectivePlugin?.snapshot_plugin_id === 'number'
    && Number.isFinite(effectivePlugin.snapshot_plugin_id)
  ) {
    return {
      snapshotChainId,
      snapshotPluginId: effectivePlugin.snapshot_plugin_id,
    }
  }

  const snapshotChain = detail?.chains.find((chain) => chain.id === snapshotChainId)
  const snapshotPlugin = snapshotChain?.plugins.find((candidate) => (
    candidate.uri === pluginUri
    && (typeof pluginPosition !== 'number' || candidate.position === pluginPosition)
  )) ?? snapshotChain?.plugins.find((candidate) => candidate.uri === pluginUri)

  if (typeof snapshotPlugin?.id === 'number' && Number.isFinite(snapshotPlugin.id)) {
    return {
      snapshotChainId,
      snapshotPluginId: snapshotPlugin.id,
    }
  }

  const snapshotPath = findSnapshotPath(detail, chainId)
  const pathPlugin = snapshotPath?.plugins.find((candidate) => (
    candidate.uri === pluginUri
    && (typeof pluginPosition !== 'number' || candidate.position === pluginPosition)
  )) ?? snapshotPath?.plugins.find((candidate) => candidate.uri === pluginUri)

  if (typeof pathPlugin?.id === 'number' && Number.isFinite(pathPlugin.id)) {
    return {
      snapshotChainId,
      snapshotPluginId: pathPlugin.id,
    }
  }

  return null
}
