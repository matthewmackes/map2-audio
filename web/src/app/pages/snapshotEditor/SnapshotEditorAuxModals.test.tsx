/* SnapshotEditorAuxModals unit tests (T2473 part 16). */

import React from 'react'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { SnapshotEditorAuxModals } from './SnapshotEditorAuxModals'

// Mock the five children so we don't need TanStack QueryClient
// or Carbon Modal portal infrastructure.
jest.mock('../../components/PluginDetailsModal', () => ({
  __esModule: true,
  PluginDetailsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="plugin-details-modal" /> : null,
}))
jest.mock('../../components/snapshots/SnapshotImportDialog', () => ({
  __esModule: true,
  SnapshotImportDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="snapshot-import-dialog" /> : null,
}))
jest.mock('../../components/SnapshotEditor/SnapshotVersionHistoryModal', () => ({
  __esModule: true,
  SnapshotVersionHistoryModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="version-history-modal" /> : null,
}))
jest.mock('./SnapshotEditorKeyboardShortcuts', () => ({
  __esModule: true,
  SnapshotEditorKeyboardShortcuts: ({ open }: { open: boolean }) =>
    open ? <div data-testid="keyboard-shortcuts-modal" /> : null,
}))
jest.mock('./SnapshotEditorAssignmentDialog', () => ({
  __esModule: true,
  SnapshotEditorAssignmentDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="assignment-dialog" /> : null,
}))

const baseProps = (
  overrides: Partial<React.ComponentProps<typeof SnapshotEditorAuxModals>> = {},
) => ({
  showImportDialog: false,
  onCloseImportDialog: jest.fn(),
  onImportSuccess: jest.fn(),
  assignmentDialogOpen: false,
  selectedFlowForAssignment: null,
  assignmentSelectedNodeId: null,
  assignmentRedundancyEnabled: false,
  isAssigningFlow: false,
  assignmentAnalysisLoading: false,
  assignmentNodes: [],
  recommendedAssignmentNodes: [],
  assignmentAnalysis: undefined,
  isSuitableAssignmentNode: () => true,
  onCloseAssignmentDialog: jest.fn(),
  onSubmitAssignment: jest.fn(),
  onAssignmentSelectNode: jest.fn(),
  onAssignmentRedundancyChange: jest.fn(),
  detailsPlugin: null,
  onCloseDetails: jest.fn(),
  showKeyboardHelp: false,
  onCloseKeyboardHelp: jest.fn(),
  onOpenDocs: jest.fn(),
  showVersionHistoryModal: false,
  versionHistoryRevisions: [],
  versionHistoryLoading: false,
  versionHistoryErrorMessage: null,
  versionHistoryRestoringRevisionNumber: null,
  onCloseVersionHistory: jest.fn(),
  onRestoreRevision: jest.fn(),
  ...overrides,
})

describe('SnapshotEditorAuxModals', () => {
  it('mounts none of the modals when all flags are false', () => {
    const { queryByTestId } = render(<SnapshotEditorAuxModals {...baseProps()} />)
    expect(queryByTestId('snapshot-import-dialog')).toBeNull()
    expect(queryByTestId('assignment-dialog')).toBeNull()
    expect(queryByTestId('plugin-details-modal')).toBeNull()
    expect(queryByTestId('keyboard-shortcuts-modal')).toBeNull()
    expect(queryByTestId('version-history-modal')).toBeNull()
  })

  it('mounts only the import dialog when showImportDialog is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorAuxModals {...baseProps({ showImportDialog: true })} />,
    )
    expect(queryByTestId('snapshot-import-dialog')).toBeInTheDocument()
    expect(queryByTestId('assignment-dialog')).toBeNull()
    expect(queryByTestId('plugin-details-modal')).toBeNull()
  })

  it('mounts only the plugin details modal when detailsPlugin is set', () => {
    const { queryByTestId } = render(
      <SnapshotEditorAuxModals
        {...baseProps({ detailsPlugin: { uri: 'lv2:test', name: 'Test' } as never })}
      />,
    )
    expect(queryByTestId('plugin-details-modal')).toBeInTheDocument()
    expect(queryByTestId('snapshot-import-dialog')).toBeNull()
  })

  it('mounts only the keyboard shortcuts modal when showKeyboardHelp is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorAuxModals {...baseProps({ showKeyboardHelp: true })} />,
    )
    expect(queryByTestId('keyboard-shortcuts-modal')).toBeInTheDocument()
  })

  it('mounts only the version history modal when showVersionHistoryModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorAuxModals {...baseProps({ showVersionHistoryModal: true })} />,
    )
    expect(queryByTestId('version-history-modal')).toBeInTheDocument()
  })

  it('mounts all five concurrently when every flag is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorAuxModals
        {...baseProps({
          showImportDialog: true,
          assignmentDialogOpen: true,
          detailsPlugin: { uri: 'lv2:test', name: 'Test' } as never,
          showKeyboardHelp: true,
          showVersionHistoryModal: true,
        })}
      />,
    )
    expect(queryByTestId('snapshot-import-dialog')).toBeInTheDocument()
    expect(queryByTestId('assignment-dialog')).toBeInTheDocument()
    expect(queryByTestId('plugin-details-modal')).toBeInTheDocument()
    expect(queryByTestId('keyboard-shortcuts-modal')).toBeInTheDocument()
    expect(queryByTestId('version-history-modal')).toBeInTheDocument()
  })
})
