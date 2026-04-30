/* SnapshotEditorRoutingModals unit tests (T2473 part 19). */

import React from 'react'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { SnapshotEditorRoutingModals } from './SnapshotEditorRoutingModals'

jest.mock('./SnapshotEditorLanePicker', () => ({
  __esModule: true,
  SnapshotEditorLanePicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="lane-picker" /> : null,
}))
jest.mock('../../components/modals/JuceGridAudioPortModal', () => ({
  __esModule: true,
  JuceGridAudioPortModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="port-modal" /> : null,
}))

const baseProps = (
  overrides: Partial<React.ComponentProps<typeof SnapshotEditorRoutingModals>> = {},
) => ({
  lanePickerOpen: false,
  lanePickerChain: null,
  lanePickerExistingLaneCount: 0,
  onCloseLanePicker: jest.fn(),
  onAddLane: jest.fn(),
  portSelectorOpen: false,
  portSelectorChainId: null,
  portSelectorFlowLabel: undefined,
  portSelectorFlowColor: undefined,
  portSelectorReadOnly: false,
  onClosePortSelector: jest.fn(),
  onPortsChange: jest.fn(),
  ...overrides,
})

describe('SnapshotEditorRoutingModals', () => {
  it('mounts neither modal when both flags are false', () => {
    const { queryByTestId } = render(<SnapshotEditorRoutingModals {...baseProps()} />)
    expect(queryByTestId('lane-picker')).toBeNull()
    expect(queryByTestId('port-modal')).toBeNull()
  })

  it('mounts only the lane picker when lanePickerOpen is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorRoutingModals {...baseProps({ lanePickerOpen: true })} />,
    )
    expect(queryByTestId('lane-picker')).toBeInTheDocument()
    expect(queryByTestId('port-modal')).toBeNull()
  })

  it('mounts only the port selector when portSelectorOpen is true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorRoutingModals {...baseProps({ portSelectorOpen: true })} />,
    )
    expect(queryByTestId('port-modal')).toBeInTheDocument()
    expect(queryByTestId('lane-picker')).toBeNull()
  })

  it('mounts both concurrently when both flags are true', () => {
    const { queryByTestId } = render(
      <SnapshotEditorRoutingModals
        {...baseProps({ lanePickerOpen: true, portSelectorOpen: true })}
      />,
    )
    expect(queryByTestId('lane-picker')).toBeInTheDocument()
    expect(queryByTestId('port-modal')).toBeInTheDocument()
  })
})
