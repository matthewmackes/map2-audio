import React from 'react'
import { render, screen } from '@testing-library/react'

import { HoToneJoGGPage } from './HoToneJoGGPage'

const mockUseCluster = jest.fn()
const mockUseDeviceNodeContext = jest.fn()
const mockAudioInterfaceControl = jest.fn(({ nodeId }: { nodeId?: string | null }) => (
  <div data-testid="audio-interface-control">{nodeId ?? 'local'}</div>
))

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useDeviceNodeContext', () => ({
  useDeviceNodeContext: (...args: unknown[]) => mockUseDeviceNodeContext(...args),
}))

jest.mock('../components/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  ),
}))

jest.mock('../components/DeviceContext', () => ({
  DeviceContextBanner: ({ deviceName }: { deviceName: string }) => (
    <div data-testid="device-context-banner">{deviceName} context banner</div>
  ),
}))

jest.mock('../../map2/components/AudioInterfaceControl', () => ({
  AudioInterfaceControl: (props: { nodeId?: string | null }) => mockAudioInterfaceControl(props),
}))

describe('HoToneJoGGPage', () => {
  beforeEach(() => {
    mockAudioInterfaceControl.mockClear()
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack' },
        { nodeId: 'node-b', hostname: 'rack-b' },
      ],
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'needs_switch',
    })
  })

  it('shows a switch prompt when the hardware is on another node', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'needs_switch' })

    render(<HoToneJoGGPage />)

    expect(screen.getByTestId('device-context-banner').textContent).toContain('HoTone JoGG context banner')
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
    })
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'ready' })

    render(<HoToneJoGGPage />)

    expect(screen.getByText('USB Audio Interface Configuration & Monitoring · Viewing rack-b')).toBeTruthy()
    expect(screen.getByTestId('audio-interface-control').textContent).toBe('node-b')
    expect(mockAudioInterfaceControl.mock.calls[0]?.[0]).toEqual({ nodeId: 'node-b' })
  })

  it('shows a cluster-wide warning when the interface is not detected anywhere', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'not_found' })

    render(<HoToneJoGGPage />)

    expect(screen.getByText('No HoTone JoGG interface is currently detected on any cluster node')).toBeTruthy()
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })
})
