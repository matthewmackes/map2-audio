import { Edit, SettingsAdjust } from '@carbon/icons-react'
import { Button, Layer, Tag } from '@carbon/react'
import { useMemo, type KeyboardEvent } from 'react'

import type { AuthoritativeAudioState, SnapshotDetail, SnapshotDraftData, SnapshotRuntimeLiveState } from '../../../map2/types'
import type { SnapshotGoLiveState } from '../../utils/snapshotGoLiveState'

interface FlowSlotRef {
  id: string
  chainId: number | null
  label: string
  color: string
}

interface SnapshotEditorSnapshotStatusPanelProps {
  selectedChainId?: number | null
  onChainSelect?: (chainId: number) => void
  onSelectedChainRemoved?: (chainId: number) => void
  flowSlots?: FlowSlotRef[]
  focusedFlowLabel?: string
  onToggleSelectedChainActive: () => void
  onDuplicateChain: () => void
  onRenameChain: () => void
  pluginMeta?: Record<string, unknown>
  onPluginChipClick?: (chainId: number, pluginUri: string, pluginPosition: number) => void
  liveSnapshot?: SnapshotDetail | null
  editorSnapshotDraft?: SnapshotDraftData | null
  runtimeLiveState?: SnapshotRuntimeLiveState | null
  authoritativeAudioState?: AuthoritativeAudioState | null
  onRenameSnapshot?: () => void
  snapshotNameEditing?: boolean
  snapshotNameDraft?: string
  snapshotNameError?: string | null
  onSnapshotNameDraftChange?: (value: string) => void
  onSubmitSnapshotName?: () => void
  onCancelSnapshotRename?: () => void
  snapshotRenamePending?: boolean
  onSaveDraft?: () => void
  saveDraftPending?: boolean
  saveDraftDisabled?: boolean
  onGoLive?: () => void
  goLiveState?: SnapshotGoLiveState | null
  goLiveActionLabel?: string
  goLiveHelperText?: string | null
  liveReadinessItems?: Array<{
    id: string
    label: string
    status: 'ready' | 'needs_attention' | 'pending_check'
    detail: string
  }>
  liveActivationProgress?: {
    summary: string
    note?: string | null
    steps: Array<{
      id: string
      label: string
      status: 'pending' | 'active' | 'complete' | 'failed'
    }>
  } | null
  goLiveFixActions?: Array<{
    id: string
    label: string
    detail?: string | null
    onSelect: () => void
  }>
  goLiveDiffItems?: string[] | null
  goLiveDiffExpanded?: boolean
  onToggleGoLiveDiff?: () => void
  onDismissGoLiveDiff?: () => void
  onSubmitSnapshotDescription?: (description: string) => void
  snapshotDescriptionPending?: boolean
  onSubmitTempoBpm?: (tempoBpm: number) => void
  tempoPending?: boolean
  abSwitchVisible?: boolean
  abSwitchActiveLabel?: string
  abSwitchNextLabel?: string
  abSwitchDisabled?: boolean
  abSwitchPending?: boolean
  onToggleAbSwitch?: () => void
  monitoringStatusLabel?: string | null
  monitoringStatusWarning?: boolean
  outputLevelWarningMessage?: string | null
  onOpenProgressModal?: () => void
}

interface SnapshotLiveHeadline {
  text: string
  tone: 'current' | 'other' | 'stopped'
  blinking: boolean
}

interface SnapshotChannelActivityBadge {
  label: string
  tooltip: string
  tagType: 'green' | 'warm-gray' | 'cool-gray'
  warning: boolean
}

function resolveLiveHeadline(
  snapshot: SnapshotDetail | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): SnapshotLiveHeadline {
  if (authoritativeAudioState) {
    const authorityIsLive = authoritativeAudioState.engine.display_state === 'live'
      || authoritativeAudioState.engine.display_state === 'live_warning'
    const authoritySnapshotId = authoritativeAudioState.source_snapshot?.snapshot_id ?? null
    if (authorityIsLive && snapshot && authoritySnapshotId === snapshot.id) {
      return {
        text: 'LIVE',
        tone: 'current',
        blinking: true,
      }
    }
    if (authorityIsLive && authoritativeAudioState.source_snapshot?.name) {
      return {
        text: `LIVE: ${authoritativeAudioState.source_snapshot.name}`,
        tone: 'other',
        blinking: true,
      }
    }
  }

  return {
    text: 'Stopped',
    tone: 'stopped',
    blinking: false,
  }
}

function formatAuthorityPathMessage(label: string, status: AuthoritativeAudioState['paths'][number]['status']): string {
  switch (status) {
    case 'pending':
      return `Channel ${label} is waiting for the engine.`
    case 'offline':
      return `Channel ${label} is offline.`
    case 'degraded':
      return `Channel ${label} is degraded.`
    case 'not_loaded':
      return `Channel ${label} is not loaded.`
    default:
      return `Channel ${label} is not loaded.`
  }
}

function friendlyAuthorityMessage(message: string): string {
  return message.replace(/pending apply\./gi, 'is waiting for the engine.')
}

function buildChannelActivityBadge(
  snapshot: SnapshotDetail | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): SnapshotChannelActivityBadge | null {
  if (authoritativeAudioState) {
    const totalCount = authoritativeAudioState.derived.total_channel_count || authoritativeAudioState.paths.length
    if (totalCount <= 0) {
      return null
    }

    const activeCount = authoritativeAudioState.derived.active_channel_count
    const inactiveDescriptions = authoritativeAudioState.derived.inactive_messages.length > 0
      ? authoritativeAudioState.derived.inactive_messages
        .map((message) => friendlyAuthorityMessage(message))
      : authoritativeAudioState.paths
        .filter((path) => path.status !== 'active')
        .map((path) => friendlyAuthorityMessage(path.status_reason?.trim() || formatAuthorityPathMessage(path.label, path.status)))
    return {
      label: `${activeCount} of ${totalCount} channels active`,
      tooltip: inactiveDescriptions.length > 0
        ? inactiveDescriptions.join(' ')
        : `All ${totalCount} channels are active.`,
      tagType: activeCount < totalCount ? 'warm-gray' : 'green',
      warning: activeCount < totalCount,
    }
  }

  if (!snapshot) {
    return null
  }

  const totalCount = snapshot.channels.length > 0 ? snapshot.channels.length : snapshot.paths.length
  if (totalCount <= 0) {
    return null
  }

  return {
    label: `${totalCount} ${totalCount === 1 ? 'channel' : 'channels'} saved`,
    tooltip: `No control-plane snapshot is live. This snapshot defines ${totalCount} saved ${totalCount === 1 ? 'channel' : 'channels'}.`,
    tagType: 'cool-gray',
    warning: false,
  }
}

export function SnapshotEditorSnapshotStatusPanel({
  liveSnapshot = null,
  authoritativeAudioState = null,
  onRenameSnapshot,
  snapshotNameEditing = false,
  snapshotNameDraft,
  snapshotNameError = null,
  onSnapshotNameDraftChange,
  onSubmitSnapshotName,
  onCancelSnapshotRename,
  snapshotRenamePending = false,
  monitoringStatusLabel = null,
  monitoringStatusWarning = false,
  onOpenProgressModal,
}: SnapshotEditorSnapshotStatusPanelProps) {
  const liveHeadline = useMemo(
    () => resolveLiveHeadline(liveSnapshot, authoritativeAudioState),
    [authoritativeAudioState, liveSnapshot],
  )
  const channelActivityBadge = useMemo(
    () => buildChannelActivityBadge(liveSnapshot, authoritativeAudioState),
    [authoritativeAudioState, liveSnapshot],
  )
  const snapshotTitle = liveSnapshot?.name ?? 'No live snapshot'

  const handleSnapshotNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmitSnapshotName?.()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelSnapshotRename?.()
    }
  }

  return (
    <Layer className="juce-grid-page__chain-card juce-grid-page__snapshot-status-card">
      <div className="juce-grid-page__snapshot-status-layout">
        <div className="juce-grid-page__snapshot-status-hero">
          <div className="juce-grid-page__snapshot-status-content-row">
            <div className="juce-grid-page__snapshot-status-live-block">
              <div className="juce-grid-page__snapshot-status-state-row">
                <span
                  className={`juce-grid-page__snapshot-status-state-label is-${liveHeadline.tone} ${liveHeadline.blinking ? 'is-blinking' : ''}`}
                >
                  {liveHeadline.text}
                </span>
              </div>
              <div className="juce-grid-page__snapshot-status-live-row">
                {liveSnapshot && snapshotNameEditing ? (
                  <div className="juce-grid-page__snapshot-status-title-editor-shell">
                    <div className="juce-grid-page__snapshot-status-title-editor">
                      <input
                        type="text"
                        className="juce-grid-page__snapshot-status-title-input"
                        aria-label="Snapshot name"
                        value={snapshotNameDraft ?? ''}
                        onChange={(event) => onSnapshotNameDraftChange?.(event.target.value)}
                        onKeyDown={handleSnapshotNameKeyDown}
                        disabled={snapshotRenamePending}
                        autoFocus
                      />
                      <div className="juce-grid-page__snapshot-status-title-editor-actions">
                        <Button
                          size="sm"
                          kind="primary"
                          onClick={onSubmitSnapshotName}
                          disabled={snapshotRenamePending || !onSubmitSnapshotName || Boolean(snapshotNameError)}
                        >
                          {snapshotRenamePending ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          kind="ghost"
                          onClick={onCancelSnapshotRename}
                          disabled={snapshotRenamePending || !onCancelSnapshotRename}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                    {snapshotNameError ? (
                      <p className="juce-grid-page__snapshot-status-title-error">{snapshotNameError}</p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {liveSnapshot && onOpenProgressModal ? (
                      <Button
                        size="sm"
                        kind="secondary"
                        renderIcon={SettingsAdjust}
                        className="juce-grid-page__snapshot-status-config-button"
                        onClick={onOpenProgressModal}
                        title="Open publish to live workspace"
                      >
                        Publish to live
                      </Button>
                    ) : null}
                    <h2 className="juce-grid-page__snapshot-status-title">
                      {liveSnapshot && onRenameSnapshot ? (
                        <button
                          type="button"
                          className="juce-grid-page__snapshot-status-title-button"
                          onClick={onRenameSnapshot}
                          disabled={snapshotRenamePending}
                          aria-label={`Rename snapshot ${snapshotTitle}`}
                          title="Rename snapshot"
                        >
                          <span className="juce-grid-page__snapshot-status-title-text">{snapshotTitle}</span>
                          <Edit size={20} aria-hidden="true" />
                        </button>
                      ) : snapshotTitle}
                    </h2>
                  </>
                )}
              </div>
              {channelActivityBadge || monitoringStatusLabel ? (
                <div className="juce-grid-page__snapshot-status-pill-row">
                  {channelActivityBadge ? (
                    <button
                      type="button"
                      title={channelActivityBadge.tooltip}
                      aria-label={channelActivityBadge.tooltip}
                      className="juce-grid-page__snapshot-status-channel-badge-wrap juce-grid-page__snapshot-status-channel-badge-button"
                      onClick={onOpenProgressModal}
                    >
                      <Tag
                        type={channelActivityBadge.tagType}
                        className={`juce-grid-page__snapshot-status-channel-badge ${channelActivityBadge.warning ? 'is-warning' : channelActivityBadge.tagType === 'green' ? 'is-healthy' : 'is-saved'}`}
                      >
                        {channelActivityBadge.label}
                      </Tag>
                    </button>
                  ) : null}
                  {monitoringStatusLabel ? (
                    <Tag
                      type={monitoringStatusWarning ? 'warm-gray' : 'cool-gray'}
                      className={`juce-grid-page__snapshot-status-monitoring-badge ${monitoringStatusWarning ? 'is-warning' : ''}`}
                    >
                      {monitoringStatusLabel}
                    </Tag>
                  ) : null}
                </div>
              ) : null}
              {!liveSnapshot ? (
                <p className="juce-grid-page__snapshot-status-empty-copy">
                  Recall or create a snapshot to populate live snapshot status here.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Layer>
  )
}

export default SnapshotEditorSnapshotStatusPanel
