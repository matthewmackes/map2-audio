/* SnapshotEditorChainDialogs unit tests (T2473 part 17). */

import React from 'react'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { SnapshotEditorChainDialogs } from './SnapshotEditorChainDialogs'

// Mock the five children so we don't need Carbon Modal portals
// or specific child types resolved.
jest.mock('./SnapshotEditorTabletDeleteConfirm', () => ({
  __esModule: true,
  SnapshotEditorTabletDeleteConfirm: ({ pendingPlugin }: { pendingPlugin: unknown }) =>
    pendingPlugin ? <div data-testid="tablet-delete" /> : null,
}))
jest.mock('./SnapshotEditorSavePresetModal', () => ({
  __esModule: true,
  SnapshotEditorSavePresetModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="save-preset" /> : null,
}))
jest.mock('./SnapshotEditorRenameChainModal', () => ({
  __esModule: true,
  SnapshotEditorRenameChainModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-chain" /> : null,
}))
jest.mock('./SnapshotEditorPresetDeleteConfirm', () => ({
  __esModule: true,
  SnapshotEditorPresetDeleteConfirm: ({ pendingPreset }: { pendingPreset: unknown }) =>
    pendingPreset ? <div data-testid="preset-delete" /> : null,
}))
jest.mock('./SnapshotEditorClearFlowsConfirm', () => ({
  __esModule: true,
  SnapshotEditorClearFlowsConfirm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="clear-flows" /> : null,
}))

const baseProps = (
  overrides: Partial<React.ComponentProps<typeof SnapshotEditorChainDialogs>> = {},
) => ({
  pendingTabletDeletePlugin: null,
  isDeletePending: false,
  onCloseTabletDelete: jest.fn(),
  onConfirmTabletDelete: jest.fn(),
  showSavePresetModal: false,
  saveChainLabel: 'Chain A',
  savePresetName: '',
  saveHasChain: false,
  isSavingPreset: false,
  onCloseSavePreset: jest.fn(),
  onSavePresetNameChange: jest.fn(),
  onSubmitSavePreset: jest.fn(),
  showRenameChainModal: false,
  renameChainLabel: 'Chain A',
  renameChainName: '',
  renameHasChain: false,
  isRenameSaving: false,
  onCloseRenameChain: jest.fn(),
  onRenameChainNameChange: jest.fn(),
  onSubmitRenameChain: jest.fn(),
  presetPendingDelete: null,
  isDeletePresetPending: false,
  onClosePresetDelete: jest.fn(),
  onConfirmDeletePreset: jest.fn(),
  showClearFlowsModal: false,
  onCloseClearFlows: jest.fn(),
  onConfirmClearFlows: jest.fn(),
  ...overrides,
})

describe('SnapshotEditorChainDialogs', () => {
  it('mounts none of the dialogs when all flags are false', () => {
    const { queryByTestId } = render(<SnapshotEditorChainDialogs {...baseProps()} />)
    expect(queryByTestId('tablet-delete')).toBeNull()
    expect(queryByTestId('save-preset')).toBeNull()
    expect(queryByTestId('rename-chain')).toBeNull()
    expect(queryByTestId('preset-delete')).toBeNull()
    expect(queryByTestId('clear-flows')).toBeNull()
  })

  it('mounts only the save-preset modal when showSavePresetModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorChainDialogs {...baseProps({ showSavePresetModal: true })} />,
    )
    expect(queryByTestId('save-preset')).toBeInTheDocument()
    expect(queryByTestId('rename-chain')).toBeNull()
  })

  it('mounts only the rename-chain modal when showRenameChainModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorChainDialogs {...baseProps({ showRenameChainModal: true })} />,
    )
    expect(queryByTestId('rename-chain')).toBeInTheDocument()
    expect(queryByTestId('save-preset')).toBeNull()
  })

  it('mounts only the clear-flows confirm when showClearFlowsModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorChainDialogs {...baseProps({ showClearFlowsModal: true })} />,
    )
    expect(queryByTestId('clear-flows')).toBeInTheDocument()
  })

  it('mounts the tablet-delete confirm when pendingTabletDeletePlugin is set', () => {
    const { queryByTestId } = render(
      <SnapshotEditorChainDialogs
        {...baseProps({ pendingTabletDeletePlugin: { id: 1 } as never })}
      />,
    )
    expect(queryByTestId('tablet-delete')).toBeInTheDocument()
  })

  it('mounts the preset-delete confirm when presetPendingDelete is set', () => {
    const { queryByTestId } = render(
      <SnapshotEditorChainDialogs
        {...baseProps({ presetPendingDelete: { id: 1, name: 'P' } as never })}
      />,
    )
    expect(queryByTestId('preset-delete')).toBeInTheDocument()
  })
})
