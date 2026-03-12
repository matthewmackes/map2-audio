import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { HoToneJoGGPage } from './HoToneJoGGPage'

const mockSetActiveNode = jest.fn()
const mockUseCluster = jest.fn()
const mockUseDeviceLocation = jest.fn()
const mockAudioInterfaceControl = jest.fn(({ nodeId }: { nodeId?: string | null }) => (
  <div data-testid="audio-interface-control">{nodeId ?? 'local'}</div>
))

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useDeviceLocation', () => ({
  useDeviceLocation: (...args: unknown[]) => mockUseDeviceLocation(...args),
}))

jest.mock('../components/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  ),
}))

jest.mock('../../map2/components/AudioInterfaceControl', () => ({
  AudioInterfaceControl: (props: { nodeId?: string | null }) => mockAudioInterfaceControl(props),
}))

describe('HoToneJoGGPage', () => {
  beforeEach(() => {
    mockSetActiveNode.mockReset()
    mockAudioInterfaceControl.mockClear()
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack' },
        { nodeId: 'node-b', hostname: 'rack-b' },
      ],
      setActiveNode: mockSetActiveNode,
    })
  })

  it('shows a switch prompt when the hardware is on another node', () => {
    mockUseDeviceLocation.mockReturnValue({
      location: { nodeId: 'node-b', hostname: 'rack-b' },
      isLoading: false,
    })

    render(<HoToneJoGGPage />)

    expect(screen.getByText('HoTone JoGG is connected to rack-b. Select that node to manage the interface directly.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to rack-b' }))
    expect(mockSetActiveNode).toHaveBeenCalledWith('node-b')
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })

  it('renders the interface control with a remote node id when already viewing the owning node', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack' },
        { nodeId: 'node-b', hostname: 'rack-b' },
      ],
      setActiveNode: mockSetActiveNode,
    })
    mockUseDeviceLocation.mockReturnValue({
      location: { nodeId: 'node-b', hostname: 'rack-b' },
      isLoading: false,
    })

    render(<HoToneJoGGPage />)

    expect(screen.getByText('USB Audio Interface Configuration & Monitoring · Viewing rack-b')).toBeTruthy()
    expect(screen.getByTestId('audio-interface-control').textContent).toBe('node-b')
    expect(mockAudioInterfaceControl.mock.calls[0]?.[0]).toEqual({ nodeId: 'node-b' })
  })

  it('shows a cluster-wide warning when the interface is not detected anywhere', () => {
    mockUseDeviceLocation.mockReturnValue({
      location: null,
      isLoading: false,
    })

    render(<HoToneJoGGPage />)

    expect(screen.getByText('No HoTone JoGG interface is currently detected on any cluster node.')).toBeTruthy()
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })
})
