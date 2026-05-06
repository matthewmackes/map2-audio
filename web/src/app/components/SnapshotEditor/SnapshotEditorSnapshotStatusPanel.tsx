import { Add, Edit, Folder, Launch, Time } from '@carbon/icons-react'
import { Button, Layer, NumberInput, Tag } from '@carbon/react'
import { useMemo, type KeyboardEvent } from 'react'

import type { AuthoritativeAudioState, SnapshotDetail, SnapshotDraftData, SnapshotPublishReadiness, SnapshotRuntimeLiveState } from '../../../map2/types'
import type { SnapshotGoLiveState } from '../../utils/snapshotGoLiveState'
import type { SnapshotLiveBadgeState } from '../../hooks/useSnapshotReconciliation'
import {
  buildHeroMetadataRows,
  SnapshotHeroLockButton,
  SnapshotHeroMetadataCluster,
  SnapshotHeroStateRow,
} from './SnapshotHeroEnhancements'

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
  // T2450: engine-confirmed LIVE indicator derived from
  // /api/runtime/reconciliation. When undefined, the panel falls back to
  // the authority-only behaviour (backwards compatible).
  liveBadgeState?: SnapshotLiveBadgeState
  onRetryPublish?: () => void
  onRenameSnapshot?: () => void
  snapshotNameEditing?: boolean
  snapshotNameDraft?: string
  snapshotNameError?: string | null
  onSnapshotNameDraftChange?: (value: string) => void
  onSubmitSnapshotName?: () => void
  onCancelSnapshotRename?: () => void
  snapshotRenamePending?: boolean
  snapshotProgramValue?: string
  onSnapshotProgramValueChange?: (value: string) => void
  onSaveSnapshotProgram?: () => void
  snapshotProgramPending?: boolean
  snapshotProgramDisabled?: boolean
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
  onOpenSnapshots?: () => void
  onCreateSnapshot?: () => void
  createSnapshotPending?: boolean
  onOpenVersionHistory?: () => void
  versionHistoryDisabled?: boolean
  // Workflow summary chips (replace the retired PedalboardBuildWizard hero).
  activeChannelCount?: number | null
  totalChannelCount?: number | null
  // When true, the snapshot has unpublished edits — drives the blink on the
  // Publish (Save) Snapshot button.
  snapshotsDirty?: boolean
  // Iter 1+: hero enhancements — metadata cluster, lock toggle, state row.
  publishReadiness?: SnapshotPublishReadiness | null
  isSnapshotLocked?: boolean
  onToggleSnapshotLock?: () => void
  toggleSnapshotLockPending?: boolean
  onCopyHeroMetadataValue?: (value: string) => void
  onConfirmPublish?: () => void
  onRejectPublish?: () => void
  onReconcilePublish?: () => void
  onOverwriteLive?: () => void
  onViewPublishErrors?: () => void
  publishActionPending?: boolean
}

interface SnapshotLiveHeadline {
  // T2450: tone widened to include 'publishing' and 'desync' so the panel
  // reflects engine-confirmed state rather than backend-recorded only.
  text: string
  tone: 'current' | 'other' | 'stopped' | 'publishing' | 'desync'
  blinking: boolean
}

export type SnapshotEditorWorkspaceActionId =
  | 'signal-grid'
  | 'directory'
  | 'parameters'
  | 'automation'
  | 'version-history'
  | 'help'

function resolveLiveHeadline(
  snapshot: SnapshotDetail | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
  liveBadgeState?: SnapshotLiveBadgeState,
): SnapshotLiveHeadline {
  // T2450: when a reconciliation-derived badge state is provided, it gates
  // the visible LIVE indicator. The authority check is still required to
  // identify *which* snapshot is live.
  const authorityIsLive = !!authoritativeAudioState && (
    authoritativeAudioState.engine.display_state === 'live'
    || authoritativeAudioState.engine.display_state === 'live_warning'
  )
  const authoritySnapshotId = authoritativeAudioState?.source_snapshot?.snapshot_id ?? null
  const isCurrentSnapshot = !!snapshot && authoritySnapshotId === snapshot.id

  if (liveBadgeState) {
    if (liveBadgeState === 'publishing') {
      return { text: 'Publishing…', tone: 'publishing', blinking: false }
    }
    if (liveBadgeState === 'engine_desync') {
      return { text: 'Engine desync', tone: 'desync', blinking: true }
    }
    if (liveBadgeState === 'live_confirmed' && authorityIsLive && isCurrentSnapshot) {
      return { text: 'LIVE', tone: 'current', blinking: true }
    }
    if (liveBadgeState === 'live_confirmed' && authorityIsLive && authoritativeAudioState?.source_snapshot?.name) {
      return {
        text: `LIVE: ${authoritativeAudioState.source_snapshot.name}`,
        tone: 'other',
        blinking: true,
      }
    }
    // live_confirmed but authority disagrees, or idle → fall through to stopped.
  }

  if (authorityIsLive && isCurrentSnapshot) {
    return { text: 'LIVE', tone: 'current', blinking: true }
  }
  if (authorityIsLive && authoritativeAudioState?.source_snapshot?.name) {
    return {
      text: `LIVE: ${authoritativeAudioState.source_snapshot.name}`,
      tone: 'other',
      blinking: true,
    }
  }
  return { text: 'Stopped', tone: 'stopped', blinking: false }
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
  snapshotProgramValue = '',
  onSnapshotProgramValueChange,
  onSaveSnapshotProgram,
  snapshotProgramPending = false,
  snapshotProgramDisabled = false,
  monitoringStatusLabel = null,
  monitoringStatusWarning = false,
  liveBadgeState,
  publishReadiness = null,
  isSnapshotLocked = false,
  onToggleSnapshotLock,
  toggleSnapshotLockPending = false,
  onCopyHeroMetadataValue,
  onConfirmPublish,
  onRejectPublish,
  onReconcilePublish,
  onOverwriteLive,
  onViewPublishErrors,
  publishActionPending = false,
  onOpenProgressModal,
  onOpenSnapshots,
  onCreateSnapshot,
  createSnapshotPending = false,
  onOpenVersionHistory,
  versionHistoryDisabled = false,
  activeChannelCount = null,
  totalChannelCount = null,
  snapshotsDirty = false,
}: SnapshotEditorSnapshotStatusPanelProps) {
  const liveHeadline = useMemo(
    () => resolveLiveHeadline(liveSnapshot, authoritativeAudioState, liveBadgeState),
    [authoritativeAudioState, liveSnapshot, liveBadgeState],
  )
  const snapshotTitle = liveSnapshot?.name ?? 'No live snapshot'
  const snapshotProgramControlDisabled = snapshotProgramPending || snapshotProgramDisabled || !liveSnapshot || isSnapshotLocked
  const heroMetadataRows = useMemo(
    () => buildHeroMetadataRows(liveSnapshot, publishReadiness),
    [liveSnapshot, publishReadiness],
  )
  const publishStatus = publishReadiness?.status ?? null

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

  const channelsLabel = (() => {
    if (typeof activeChannelCount === 'number' && typeof totalChannelCount === 'number') {
      return `${activeChannelCount} of ${totalChannelCount} channels active`
    }
    if (typeof totalChannelCount === 'number') {
      return `${totalChannelCount} channels`
    }
    return null
  })()

  const hasGroupActions = Boolean(onOpenSnapshots || onCreateSnapshot)
  const hasSnapshotActions = Boolean(onOpenVersionHistory || onOpenProgressModal)
  const showActionFooter = hasGroupActions || hasSnapshotActions

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
                    <h2 className="juce-grid-page__snapshot-status-title">
                      {liveSnapshot && onRenameSnapshot ? (
                        <button
                          type="button"
                          className={`juce-grid-page__snapshot-status-title-button${isSnapshotLocked ? ' is-locked' : ''}`}
                          onClick={onRenameSnapshot}
                          disabled={snapshotRenamePending || isSnapshotLocked}
                          aria-label={`Rename snapshot ${snapshotTitle}`}
                          title={isSnapshotLocked ? 'Snapshot is locked — unlock to rename' : 'Rename snapshot'}
                        >
                          <span className="juce-grid-page__snapshot-status-title-text">{snapshotTitle}</span>
                          <Edit size={20} aria-hidden="true" />
                        </button>
                      ) : snapshotTitle}
                    </h2>
                  </>
                )}
              </div>
              {monitoringStatusLabel || channelsLabel ? (
                <div className="juce-grid-page__snapshot-status-pill-row">
                  {channelsLabel ? (
                    <Tag
                      type="green"
                      className="juce-grid-page__snapshot-status-channels-badge"
                    >
                      {channelsLabel}
                    </Tag>
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
            {liveSnapshot && heroMetadataRows.length > 0 ? (
              <SnapshotHeroMetadataCluster rows={heroMetadataRows} onCopyValue={onCopyHeroMetadataValue} />
            ) : null}
            <div className="juce-grid-page__snapshot-status-program" role="form" aria-label="Snapshot MIDI program">
              {liveSnapshot && onToggleSnapshotLock ? (
                <SnapshotHeroLockButton
                  isLocked={isSnapshotLocked}
                  onToggle={onToggleSnapshotLock}
                  pending={toggleSnapshotLockPending}
                />
              ) : null}
              <NumberInput
                id="snapshot-editor-midi-program"
                label="MIDI program"
                min={0}
                max={127}
                step={1}
                value={snapshotProgramValue}
                onChange={(_event, { value }) => onSnapshotProgramValueChange?.(String(value))}
                disabled={snapshotProgramControlDisabled}
              />
              <Button
                size="sm"
                kind="secondary"
                renderIcon={Launch}
                onClick={onSaveSnapshotProgram}
                disabled={!onSaveSnapshotProgram || snapshotProgramControlDisabled}
              >
                {snapshotProgramPending ? 'Saving…' : 'Save MIDI PC'}
              </Button>
            </div>
          </div>
          {liveSnapshot && publishStatus ? (
            <SnapshotHeroStateRow
              status={publishStatus}
              readiness={publishReadiness}
              snapshot={liveSnapshot}
              isLocked={isSnapshotLocked}
              onConfirm={onConfirmPublish}
              onReject={onRejectPublish}
              onReconcile={onReconcilePublish}
              onOverwriteLive={onOverwriteLive}
              onViewErrors={onViewPublishErrors}
              busy={publishActionPending}
            />
          ) : null}
          {showActionFooter ? (
            <div className="juce-grid-page__snapshot-status-actions" role="toolbar" aria-label="Snapshot actions">
              <div className="juce-grid-page__snapshot-status-actions-snapshot">
                {onOpenVersionHistory ? (
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={Time}
                    onClick={onOpenVersionHistory}
                    disabled={versionHistoryDisabled}
                  >
                    History
                  </Button>
                ) : null}
                {onOpenProgressModal ? (
                  <Button
                    size="sm"
                    kind="primary"
                    renderIcon={Launch}
                    onClick={onOpenProgressModal}
                    className={`juce-grid-page__snapshot-status-publish-btn${snapshotsDirty ? ' is-dirty-blinking' : ''}`}
                  >
                    Publish (Save) Snapshot
                  </Button>
                ) : null}
              </div>
              <div className="juce-grid-page__snapshot-status-actions-group">
                {onOpenSnapshots ? (
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={Folder}
                    onClick={onOpenSnapshots}
                  >
                    Open snapshots
                  </Button>
                ) : null}
                {onCreateSnapshot ? (
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Add}
                    onClick={onCreateSnapshot}
                    disabled={createSnapshotPending}
                    className="juce-grid-page__snapshot-status-new-snapshot-btn"
                  >
                    {createSnapshotPending ? 'Creating…' : 'New snapshot'}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Layer>
  )
}


export default SnapshotEditorSnapshotStatusPanel
