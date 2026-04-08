import { ApiError } from '../../map2/http'
import type { Chain, SnapshotChain, SnapshotDetail, SnapshotLivePathState, SnapshotPath } from '../../map2/types'

export const SNAPSHOT_ACTIVATION_TOAST_DURATION_MS = 3000

interface ExtractSnapshotActivationFailureReasonOptions {
  separator?: string
}

type SnapshotActivationToastSource = Pick<
  SnapshotDetail,
  'name' | 'channel_count' | 'channels' | 'chains' | 'paths' | 'live_state'
>

type PluginLike = {
  bypass?: boolean
  bypassed?: boolean
}
type ChainLike = Pick<SnapshotChain, 'id' | 'plugins'> | Pick<Chain, 'id' | 'plugins'>
type PathLike = Pick<SnapshotPath, 'snapshot_chain_id' | 'plugins'>

function formatCountLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function normalizeActivationStatus(value?: string | null): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '_')
    : ''
}

function isInactiveStatus(status: string): boolean {
  if (!status) {
    return false
  }

  return (
    status.includes('inactive')
    || status.includes('offline')
    || status.includes('not_loaded')
    || status.includes('not-loaded')
    || status.includes('failed')
    || status.includes('missing')
    || status.includes('stopped')
    || status.includes('error')
  )
}

function isActiveLivePath(path: SnapshotLivePathState): boolean {
  const normalizedStatus = normalizeActivationStatus(path.activation_status)
  if (isInactiveStatus(normalizedStatus)) {
    return false
  }

  return typeof path.runtime_chain_id === 'number' || typeof path.snapshot_chain_id === 'number'
}

function getActiveLivePaths(snapshot: SnapshotActivationToastSource): SnapshotLivePathState[] {
  const livePaths = snapshot.live_state?.paths ?? []
  return livePaths.filter(isActiveLivePath)
}

function countNonBypassedPlugins(plugins: PluginLike[] | undefined): number {
  if (!Array.isArray(plugins)) {
    return 0
  }

  return plugins.filter((plugin) => !(plugin.bypassed ?? plugin.bypass ?? false)).length
}

function countPluginsInChains(chains: ChainLike[]): number {
  return chains.reduce((total, chain) => total + countNonBypassedPlugins(chain.plugins), 0)
}

function countPluginsInPaths(paths: PathLike[]): number {
  return paths.reduce((total, path) => total + countNonBypassedPlugins(path.plugins), 0)
}

export function extractSnapshotActivationFailureReason(
  error: unknown,
  options: ExtractSnapshotActivationFailureReasonOptions = {},
): string | null {
  const separator = options.separator ?? ' '

  if (error instanceof ApiError) {
    const detail =
      typeof error.body === 'object' && error.body !== null && 'detail' in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined

    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail.trim()
    }

    if (Array.isArray(detail)) {
      const joined = detail
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry.trim()
          }
          if (typeof entry === 'object' && entry !== null && 'msg' in entry && typeof entry.msg === 'string') {
            return entry.msg.trim()
          }
          return ''
        })
        .filter((entry) => entry.length > 0)
        .join(separator)
      if (joined.length > 0) {
        return joined
      }
    }

    if (typeof error.body === 'string' && error.body.trim().length > 0) {
      return error.body.trim()
    }

    if (error.statusText.trim().length > 0) {
      return error.statusText.trim()
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  return null
}

export function countActiveSnapshotChannels(snapshot: SnapshotActivationToastSource): number {
  const livePaths = snapshot.live_state?.paths ?? []
  const activeLivePaths = getActiveLivePaths(snapshot)
  if (livePaths.length > 0) {
    return activeLivePaths.length
  }

  if (snapshot.channels.length > 0) {
    return snapshot.channels.length
  }

  return Number.isFinite(snapshot.channel_count) ? snapshot.channel_count : 0
}

export function countActiveSnapshotBlocks(snapshot: SnapshotActivationToastSource): number {
  const livePaths = snapshot.live_state?.paths ?? []
  const activeLivePaths = getActiveLivePaths(snapshot)
  if (livePaths.length > 0 && activeLivePaths.length === 0) {
    return 0
  }

  const activeRuntimeChainIds = new Set<number>()
  const activeSnapshotChainIds = new Set<number>()

  for (const path of activeLivePaths) {
    if (typeof path.runtime_chain_id === 'number') {
      activeRuntimeChainIds.add(path.runtime_chain_id)
    }
    if (typeof path.snapshot_chain_id === 'number') {
      activeSnapshotChainIds.add(path.snapshot_chain_id)
    }
  }

  const runtimeChains = snapshot.live_state?.runtime_chains ?? []
  const runtimeChainBlockCount = runtimeChains.length > 0
    ? countPluginsInChains(
      activeRuntimeChainIds.size > 0
        ? runtimeChains.filter((chain) => activeRuntimeChainIds.has(chain.id))
        : livePaths.length === 0
          ? runtimeChains
          : [],
    )
    : 0

  const snapshotChains = snapshot.chains ?? []
  const snapshotChainFallbackIds = new Set<number>(
    activeLivePaths
      .filter((path) => (path.runtime_chain_id === null || path.runtime_chain_id === undefined) && typeof path.snapshot_chain_id === 'number')
      .map((path) => path.snapshot_chain_id as number),
  )

  const snapshotChainBlockCount = snapshotChains.length > 0
    ? countPluginsInChains(
      runtimeChains.length === 0
        ? (
          activeSnapshotChainIds.size > 0
            ? snapshotChains.filter((chain) => typeof chain.id === 'number' && activeSnapshotChainIds.has(chain.id))
            : snapshotChains
        )
        : snapshotChains.filter((chain) => typeof chain.id === 'number' && snapshotChainFallbackIds.has(chain.id)),
    )
    : 0

  if (runtimeChainBlockCount > 0 || snapshotChainBlockCount > 0) {
    return runtimeChainBlockCount + snapshotChainBlockCount
  }

  if (snapshot.paths.length > 0) {
    const activePaths = activeLivePaths.length > 0
      ? snapshot.paths.filter((path) => activeSnapshotChainIds.has(path.snapshot_chain_id))
      : snapshot.paths
    return countPluginsInPaths(activePaths)
  }

  return 0
}

export function buildSnapshotActivationToastMessage(
  snapshot: SnapshotActivationToastSource,
  options?: { programNumber?: number | null },
): string {
  const activeChannels = countActiveSnapshotChannels(snapshot)
  const activeBlocks = countActiveSnapshotBlocks(snapshot)
  const programSuffix = typeof options?.programNumber === 'number'
    ? ` (PC ${options.programNumber})`
    : ''

  return `Live: ${snapshot.name} - ${formatCountLabel(activeChannels, 'channel')}, ${formatCountLabel(activeBlocks, 'block')}${programSuffix}`
}

export function buildSnapshotActivationFailureToastMessage(snapshotName: string, error: unknown): string {
  const reason = extractSnapshotActivationFailureReason(error, { separator: ' • ' }) ?? 'Activation failed.'
  return `Failed: ${snapshotName} - ${reason}`
}
