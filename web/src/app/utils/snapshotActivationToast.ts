import { ApiError } from '../../map2/http'
import type { Chain, SnapshotChain, SnapshotDetail, SnapshotLivePathState, SnapshotPath } from '../../map2/types'
import type { NotificationOptions } from '../components/Toasts'
import { withNodeQuery } from './clusterTransport'

export const SNAPSHOT_ACTIVATION_TOAST_DURATION_MS = 3000

interface ExtractSnapshotActivationFailureReasonOptions {
  separator?: string
}

export interface SnapshotActivationFailureIssue {
  code?: string | null
  category?: string | null
  message: string
  autoRepair: boolean
  assetType?: string | null
  deviceRole?: string | null
}

export interface SnapshotActivationRepairAction {
  action: string
  message: string
  assetType?: string | null
  requestedDevice?: string | null
  deviceRole?: string | null
  pluginName?: string | null
}

export interface SnapshotActivationFailureDetail {
  message: string
  phase: string | null
  blocking: boolean
  failures: string[]
  issues: SnapshotActivationFailureIssue[]
  repairActions: SnapshotActivationRepairAction[]
}

type SnapshotActivationToastSource = Pick<
  SnapshotDetail,
  'id' | 'name' | 'channel_count' | 'channels' | 'chains' | 'paths' | 'live_state'
>

export interface SnapshotStageToastDescriptor {
  title: string
  message: string
  options: NotificationOptions
}

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

function readApiErrorDetail(error: ApiError): unknown {
  return typeof error.body === 'object' && error.body !== null && 'detail' in error.body
    ? (error.body as { detail?: unknown }).detail
    : undefined
}

function normalizeFailureText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function extractSnapshotActivationFailureDetail(error: unknown): SnapshotActivationFailureDetail | null {
  if (!(error instanceof ApiError)) {
    return null
  }

  const detail = readApiErrorDetail(error)
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    return null
  }

  const payload = detail as Record<string, unknown>
  const failures = Array.isArray(payload.failures)
    ? payload.failures
      .map((entry) => normalizeFailureText(entry))
      .filter((entry): entry is string => entry !== null)
    : []
  const issues = Array.isArray(payload.issues)
    ? payload.issues
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        code: normalizeFailureText(entry.code),
        category: normalizeFailureText(entry.category),
        message: normalizeFailureText(entry.message) ?? 'Live check failed.',
        autoRepair: Boolean(entry.auto_repair),
        assetType: normalizeFailureText(entry.asset_type),
        deviceRole: normalizeFailureText(entry.device_role),
      }))
    : []
  const repairActions = Array.isArray(payload.repair_actions)
    ? payload.repair_actions
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        action: normalizeFailureText(entry.action) ?? 'review_issue',
        message: normalizeFailureText(entry.message) ?? 'Review the live check issue.',
        assetType: normalizeFailureText(entry.asset_type),
        requestedDevice: normalizeFailureText(entry.requested_device),
        deviceRole: normalizeFailureText(entry.device_role),
        pluginName: normalizeFailureText(entry.plugin_name),
      }))
    : []
  const message = normalizeFailureText(payload.message)
    ?? failures[0]
    ?? issues[0]?.message

  if (!message) {
    return null
  }

  return {
    message,
    phase: normalizeFailureText(payload.phase),
    blocking: Boolean(payload.blocking),
    failures,
    issues,
    repairActions,
  }
}

export function extractSnapshotActivationFailureReason(
  error: unknown,
  options: ExtractSnapshotActivationFailureReasonOptions = {},
): string | null {
  const separator = options.separator ?? ' '

  if (error instanceof ApiError) {
    const detail = readApiErrorDetail(error)
    const structuredDetail = extractSnapshotActivationFailureDetail(error)
    if (structuredDetail) {
      return structuredDetail.failures.length > 0
        ? structuredDetail.failures.join(separator)
        : structuredDetail.message
    }

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

export function buildSnapshotActivationStageToast(
  snapshot: SnapshotActivationToastSource,
  options?: { programNumber?: number | null },
): SnapshotStageToastDescriptor {
  const activeChannels = countActiveSnapshotChannels(snapshot)
  const activeBlocks = countActiveSnapshotBlocks(snapshot)
  const programSuffix = typeof options?.programNumber === 'number' ? ` · PC ${options.programNumber}` : ''
  const liveLabel = snapshot.live_state?.display_label?.trim() || 'Live'
  const nodeId = snapshot.live_state?.node_id ?? null

  return {
    title: 'Live snapshot',
    message: `${snapshot.name} is ${liveLabel.toLowerCase()} on ${formatCountLabel(activeChannels, 'channel')} with ${formatCountLabel(activeBlocks, 'block')}${programSuffix}`,
    options: {
      id: `snapshot-live:${snapshot.id}`,
      persistent: true,
      title: snapshot.name,
      stage: {
        kind: 'live_snapshot',
        severity: snapshot.live_state?.is_warning ? 'warning' : 'success',
        resource: {
          kind: 'snapshot',
          id: String(snapshot.id),
        },
        compactLabel: snapshot.name,
        sourceLabel: nodeId ?? '',
        route: withNodeQuery('/snapshot-editor', nodeId),
        routeLabel: `Open ${snapshot.name} in Snapshot Editor`,
        liveSnapshotPinned: true,
        replaceLiveBanner: false,
        sticky: true,
        suppressTransient: true,
        meta: [
          liveLabel,
          formatCountLabel(activeChannels, 'channel'),
          formatCountLabel(activeBlocks, 'block'),
        ],
      },
    },
  }
}

export function buildSnapshotActivationFailureStageToast(
  snapshotName: string,
  error: unknown,
  options?: { snapshotId?: number | null; nodeId?: string | null },
): SnapshotStageToastDescriptor {
  const failureDetail = extractSnapshotActivationFailureDetail(error)
  const failureMessage = extractSnapshotActivationFailureReason(error, { separator: ' • ' }) ?? 'Activation failed.'

  return {
    title: 'Snapshot activation failed',
    message: `${snapshotName}: ${failureMessage}`,
    options: {
      id: `snapshot-activation-failed:${options?.snapshotId ?? snapshotName}`,
      title: snapshotName,
      durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
      stage: {
        kind: 'warning_alert',
        severity: 'warning',
        resource: {
          kind: 'snapshot',
          id: String(options?.snapshotId ?? snapshotName),
        },
        compactLabel: snapshotName,
        sourceLabel: options?.nodeId ?? '',
        route: options?.nodeId != null ? withNodeQuery('/snapshot-editor', options.nodeId) : '/snapshot-editor',
        routeLabel: `Open ${snapshotName} in Snapshot Editor`,
        replaceLiveBanner: true,
        suppressTransient: true,
        meta: [
          failureDetail?.phase ? `Phase: ${failureDetail.phase}` : '',
          failureDetail?.blocking ? 'Blocking' : '',
        ].filter(Boolean),
      },
    },
  }
}

export function buildSnapshotWorkflowStageToast(params: {
  workflowId: string
  snapshotId?: number | null
  snapshotName: string
  title: string
  message: string
  severity?: 'info' | 'success' | 'warning' | 'critical'
  nodeId?: string | null
  durationMs?: number
  persistent?: boolean
  replaceLiveBanner?: boolean
  compactLabel?: string
}): SnapshotStageToastDescriptor {
  const severity = params.severity ?? 'success'

  return {
    title: params.title,
    message: params.message,
    options: {
      id: `${params.workflowId}:${params.snapshotId ?? params.snapshotName}`,
      persistent: params.persistent,
      durationMs: params.durationMs,
      title: params.snapshotName,
      stage: {
        kind: severity === 'warning' || severity === 'critical' ? 'warning_alert' : 'workflow',
        severity,
        resource: {
          kind: 'snapshot',
          id: String(params.snapshotId ?? params.snapshotName),
        },
        compactLabel: params.compactLabel ?? params.snapshotName,
        sourceLabel: params.nodeId ?? '',
        route: params.nodeId != null ? withNodeQuery('/snapshot-editor', params.nodeId) : '/snapshot-editor',
        routeLabel: `Open ${params.snapshotName} in Snapshot Editor`,
        replaceLiveBanner: params.replaceLiveBanner ?? true,
        sticky: Boolean(params.persistent),
        suppressTransient: true,
        meta: [params.title],
      },
    },
  }
}
