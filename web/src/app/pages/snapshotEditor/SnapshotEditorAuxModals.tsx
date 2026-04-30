// SnapshotEditor auxiliary modals (T2473 part 16).
// Aggregates five back-to-back declarative modal mounts that
// were inline in the page monolith: import dialog, assignment
// dialog, plugin details, keyboard shortcuts, and version
// history. All state + callbacks remain parent-owned.

import type { Plugin, SnapshotRevisionSummary } from '../../../map2/types'

import { PluginDetailsModal } from '../../components/PluginDetailsModal'
import { SnapshotImportDialog } from '../../components/snapshots/SnapshotImportDialog'
import { SnapshotVersionHistoryModal } from '../../components/SnapshotEditor/SnapshotVersionHistoryModal'
import { SnapshotEditorKeyboardShortcuts } from './SnapshotEditorKeyboardShortcuts'
import {
  SnapshotEditorAssignmentDialog,
  type AssignmentDialogAnalysis,
  type AssignmentDialogNode,
} from './SnapshotEditorAssignmentDialog'
import type { FlowSlot } from './snapshotEditorPageTypes'

export interface SnapshotEditorAuxModalsProps {
  // Snapshot Import Dialog
  showImportDialog: boolean
  onCloseImportDialog: () => void
  onImportSuccess: (presetId: number, name: string) => void

  // Assignment Dialog
  assignmentDialogOpen: boolean
  selectedFlowForAssignment: FlowSlot | null
  assignmentSelectedNodeId: string | null
  assignmentRedundancyEnabled: boolean
  isAssigningFlow: boolean
  assignmentAnalysisLoading: boolean
  assignmentNodes: AssignmentDialogNode[]
  recommendedAssignmentNodes: AssignmentDialogNode[]
  assignmentAnalysis: AssignmentDialogAnalysis | undefined
  isSuitableAssignmentNode: (node: AssignmentDialogNode) => boolean
  onCloseAssignmentDialog: () => void
  onSubmitAssignment: () => void
  onAssignmentSelectNode: (nodeId: string) => void
  onAssignmentRedundancyChange: (enabled: boolean) => void

  // Plugin Details Modal
  detailsPlugin: Plugin | null
  onCloseDetails: () => void

  // Keyboard Shortcuts Modal
  showKeyboardHelp: boolean
  onCloseKeyboardHelp: () => void
  onOpenDocs: () => void

  // Version History Modal
  showVersionHistoryModal: boolean
  versionHistorySnapshotName?: string | null
  versionHistoryRevisions: SnapshotRevisionSummary[]
  versionHistoryLoading: boolean
  versionHistoryErrorMessage: string | null
  versionHistoryRestoringRevisionNumber: number | null
  onCloseVersionHistory: () => void
  onRestoreRevision: (revision: SnapshotRevisionSummary) => void
}

export function SnapshotEditorAuxModals({
  showImportDialog,
  onCloseImportDialog,
  onImportSuccess,
  assignmentDialogOpen,
  selectedFlowForAssignment,
  assignmentSelectedNodeId,
  assignmentRedundancyEnabled,
  isAssigningFlow,
  assignmentAnalysisLoading,
  assignmentNodes,
  recommendedAssignmentNodes,
  assignmentAnalysis,
  isSuitableAssignmentNode,
  onCloseAssignmentDialog,
  onSubmitAssignment,
  onAssignmentSelectNode,
  onAssignmentRedundancyChange,
  detailsPlugin,
  onCloseDetails,
  showKeyboardHelp,
  onCloseKeyboardHelp,
  onOpenDocs,
  showVersionHistoryModal,
  versionHistorySnapshotName,
  versionHistoryRevisions,
  versionHistoryLoading,
  versionHistoryErrorMessage,
  versionHistoryRestoringRevisionNumber,
  onCloseVersionHistory,
  onRestoreRevision,
}: SnapshotEditorAuxModalsProps) {
  return (
    <>
      <SnapshotImportDialog
        isOpen={showImportDialog}
        onClose={onCloseImportDialog}
        onImportSuccess={onImportSuccess}
      />
      <SnapshotEditorAssignmentDialog
        open={assignmentDialogOpen}
        selectedFlow={selectedFlowForAssignment}
        selectedNodeId={assignmentSelectedNodeId}
        redundancyEnabled={assignmentRedundancyEnabled}
        isAssigning={isAssigningFlow}
        isAnalysisLoading={assignmentAnalysisLoading}
        assignmentNodes={assignmentNodes}
        recommendedNodes={recommendedAssignmentNodes}
        analysis={assignmentAnalysis}
        isSuitableNode={isSuitableAssignmentNode}
        onClose={onCloseAssignmentDialog}
        onSubmit={onSubmitAssignment}
        onSelectNode={onAssignmentSelectNode}
        onRedundancyChange={onAssignmentRedundancyChange}
      />
      {detailsPlugin && (
        <PluginDetailsModal
          plugin={detailsPlugin}
          open={!!detailsPlugin}
          onClose={onCloseDetails}
        />
      )}
      <SnapshotEditorKeyboardShortcuts
        open={showKeyboardHelp}
        onClose={onCloseKeyboardHelp}
        onOpenDocs={onOpenDocs}
      />
      <SnapshotVersionHistoryModal
        open={showVersionHistoryModal}
        snapshotName={versionHistorySnapshotName}
        revisions={versionHistoryRevisions}
        loading={versionHistoryLoading}
        errorMessage={versionHistoryErrorMessage}
        restoringRevisionNumber={versionHistoryRestoringRevisionNumber}
        onClose={onCloseVersionHistory}
        onRestore={onRestoreRevision}
      />
    </>
  )
}
