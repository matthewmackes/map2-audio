/* SnapshotEditorWorkspaceModals unit tests (T2473 part 15).
   Confirms each modal mounts only when its `show*` flag is true,
   and that close handlers are wired through. */

import React from 'react'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { SnapshotEditorWorkspaceModals } from './SnapshotEditorWorkspaceModals'

// Mock the three children so we don't need a TanStack QueryClient.
jest.mock('../../components/modals/AudioNodesModal', () => ({
  __esModule: true,
  AudioNodesModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="audio-nodes-modal" /> : null,
}))
jest.mock('../../components/modals/LiveRuntimePathsModal', () => ({
  __esModule: true,
  LiveRuntimePathsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="live-runtime-modal" /> : null,
}))
jest.mock('./SnapshotEditorPerformOverlay', () => ({
  __esModule: true,
  SnapshotEditorPerformOverlay: ({ open }: { open: boolean }) =>
    open ? <div data-testid="perform-overlay" /> : null,
}))

const baseProps = (
  overrides: Partial<React.ComponentProps<typeof SnapshotEditorWorkspaceModals>> = {},
) => ({
  showPerformModal: false,
  onClosePerformWorkspace: jest.fn(),
  showAudioNodesModal: false,
  onCloseAudioRoutingWorkspace: jest.fn(),
  showLiveRuntimeModal: false,
  onCloseLiveRuntimeWorkspace: jest.fn(),
  liveChainProjection: [],
  showLiveChainSummaryOnly: false,
  liveChainMismatch: false,
  liveChainProjectionOverflow: false,
  onUpdateLiveChains: jest.fn(),
  onRevertEditorToLive: jest.fn(),
  updateAuthorityLivePending: false,
  onKillLiveChain: jest.fn(),
  ...overrides,
})

describe('SnapshotEditorWorkspaceModals', () => {
  it('mounts none of the modals when all flags are false', () => {
    const { container } = render(<SnapshotEditorWorkspaceModals {...baseProps()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mounts only the perform overlay when showPerformModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorWorkspaceModals {...baseProps({ showPerformModal: true })} />,
    )
    expect(queryByTestId('perform-overlay')).toBeInTheDocument()
    expect(queryByTestId('audio-nodes-modal')).toBeNull()
    expect(queryByTestId('live-runtime-modal')).toBeNull()
  })

  it('mounts only the audio nodes modal when showAudioNodesModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorWorkspaceModals {...baseProps({ showAudioNodesModal: true })} />,
    )
    expect(queryByTestId('audio-nodes-modal')).toBeInTheDocument()
    expect(queryByTestId('perform-overlay')).toBeNull()
    expect(queryByTestId('live-runtime-modal')).toBeNull()
  })

  it('mounts only the live runtime modal when showLiveRuntimeModal is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorWorkspaceModals {...baseProps({ showLiveRuntimeModal: true })} />,
    )
    expect(queryByTestId('live-runtime-modal')).toBeInTheDocument()
    expect(queryByTestId('audio-nodes-modal')).toBeNull()
    expect(queryByTestId('perform-overlay')).toBeNull()
  })

  it('mounts all three concurrently when every flag is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorWorkspaceModals
        {...baseProps({
          showPerformModal: true,
          showAudioNodesModal: true,
          showLiveRuntimeModal: true,
        })}
      />,
    )
    expect(queryByTestId('perform-overlay')).toBeInTheDocument()
    expect(queryByTestId('audio-nodes-modal')).toBeInTheDocument()
    expect(queryByTestId('live-runtime-modal')).toBeInTheDocument()
  })
})
