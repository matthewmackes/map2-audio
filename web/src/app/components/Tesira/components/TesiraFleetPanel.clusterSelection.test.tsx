import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraFleetPanel } from './TesiraFleetPanel'

const mockNavigate = jest.fn()
const mockSelectDevice = jest.fn()
const mockSetActiveNode = jest.fn()
const mockUseTesiraDevices = jest.fn()
const mockUseTesiraContext = jest.fn()
const mockUseCluster = jest.fn()

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevices: () => mockUseTesiraDevices(),
}))

jest.mock('../context/TesiraContext', () => ({
  useTesiraContext: () => mockUseTesiraContext(),
}))

jest.mock('../../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('./TesiraDeviceCard', () => ({
  TesiraDeviceCard: ({
    device,
    selected,
    onSelect,
  }: {
    device: { device_id: string; name: string }
    selected: boolean
    onSelect: () => void
  }) => (
    <button type="button" data-testid={`tesira-device-${device.device_id}`} data-selected={selected} onClick={onSelect}>
      {device.name}
    </button>
  ),
}))

jest.mock('./ManualAddDialog', () => ({
  ManualAddDialog: () => null,
}))

describe('TesiraFleetPanel cluster node selection', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSelectDevice.mockReset()
    mockSetActiveNode.mockReset()
    mockUseTesiraDevices.mockReturnValue({
      data: [
        {
          device_id: 'tesira-1',
          name: 'Ballroom DSP',
          source_node_id: 'node-b',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    mockUseTesiraContext.mockReturnValue({
      selectedDeviceId: null,
      selectDevice: mockSelectDevice,
    })
    mockUseCluster.mockReturnValue({
      localNodeId: 'node-local',
      setActiveNode: mockSetActiveNode,
    })
  })

  it('switches cluster context to the owning node before navigating to a remote Tesira device', () => {
    render(<TesiraFleetPanel />)

    fireEvent.click(screen.getByTestId('tesira-device-tesira-1'))

    expect(mockSetActiveNode).toHaveBeenCalledWith('node-b')
    expect(mockSelectDevice).toHaveBeenCalledWith('tesira-1')
    expect(mockNavigate).toHaveBeenCalledWith('/tesira/tesira-1/dashboard')
  })

  it('clears the active node when the selected Tesira device is on the local node', () => {
    mockUseTesiraDevices.mockReturnValue({
      data: [
        {
          device_id: 'tesira-local',
          name: 'Local DSP',
          source_node_id: 'node-local',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })

    render(<TesiraFleetPanel />)

    fireEvent.click(screen.getByTestId('tesira-device-tesira-local'))

    expect(mockSetActiveNode).toHaveBeenCalledWith(null)
    expect(mockSelectDevice).toHaveBeenCalledWith('tesira-local')
    expect(mockNavigate).toHaveBeenCalledWith('/tesira/tesira-local/dashboard')
  })
})
