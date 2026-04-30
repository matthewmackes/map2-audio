// SnapshotEditor workspace-level modals (T2473 part 15).
// Aggregates three declarative modal mounts that were inline in
// the page monolith: the perform full-screen overlay, the audio
// nodes modal, and the live-runtime-paths modal. All state +
// callbacks remain parent-owned; the aggregate just bundles the
// declarative wiring so the monolith's render returns less JSX.

import { AudioNodesModal } from '../../components/modals/AudioNodesModal'
import { LiveRuntimePathsModal } from '../../components/modals/LiveRuntimePathsModal'
import { SnapshotEditorPerformOverlay } from './SnapshotEditorPerformOverlay'
import type { JuceGridLiveChainProjection } from '../../components/SnapshotEditor/snapshotEditorLiveChains'

export interface SnapshotEditorWorkspaceModalsProps {
  // Perform Full-Screen Modal
  showPerformModal: boolean
  onClosePerformWorkspace: () => void

  // Audio Nodes Modal
  showAudioNodesModal: boolean
  onCloseAudioRoutingWorkspace: () => void

  // Live Runtime Paths Modal
  showLiveRuntimeModal: boolean
  onCloseLiveRuntimeWorkspace: () => void
  liveChainProjection: JuceGridLiveChainProjection[]
  showLiveChainSummaryOnly: boolean
  liveChainMismatch: boolean
  liveChainProjectionOverflow: boolean
  onUpdateLiveChains: () => void
  onRevertEditorToLive: () => void
  updateAuthorityLivePending: boolean
  onKillLiveChain: (chainId: number) => void
}

export function SnapshotEditorWorkspaceModals({
  showPerformModal,
  onClosePerformWorkspace,
  showAudioNodesModal,
  onCloseAudioRoutingWorkspace,
  showLiveRuntimeModal,
  onCloseLiveRuntimeWorkspace,
  liveChainProjection,
  showLiveChainSummaryOnly,
  liveChainMismatch,
  liveChainProjectionOverflow,
  onUpdateLiveChains,
  onRevertEditorToLive,
  updateAuthorityLivePending,
  onKillLiveChain,
}: SnapshotEditorWorkspaceModalsProps) {
  return (
    <>
      <SnapshotEditorPerformOverlay
        open={showPerformModal}
        onExit={onClosePerformWorkspace}
      />
      {showAudioNodesModal && (
        <AudioNodesModal
          open={showAudioNodesModal}
          onClose={onCloseAudioRoutingWorkspace}
        />
      )}
      {showLiveRuntimeModal ? (
        <LiveRuntimePathsModal
          open={showLiveRuntimeModal}
          onClose={onCloseLiveRuntimeWorkspace}
          projections={liveChainProjection}
          summaryOnly={showLiveChainSummaryOnly}
          mismatch={liveChainMismatch}
          overflow={liveChainProjectionOverflow}
          onUpdateLive={onUpdateLiveChains}
          onRevertToLive={onRevertEditorToLive}
          updatePending={updateAuthorityLivePending}
          onKillLivePath={onKillLiveChain}
          killPending={updateAuthorityLivePending}
        />
      ) : null}
    </>
  )
}
