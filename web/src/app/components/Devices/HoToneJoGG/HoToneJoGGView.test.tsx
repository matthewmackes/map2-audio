import React from 'react'
import { render, screen } from '@testing-library/react'

import { HoToneJoGGView } from './HoToneJoGGView'

const mockUseCluster = jest.fn()
const mockUseDeviceNodeContext = jest.fn()
const mockAudioInterfaceControl = jest.fn(({ nodeId }: { nodeId?: string | null }) => (
  <div data-testid="audio-interface-control">{nodeId ?? 'local'}</div>
))

jest.mock('../../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../../../hooks/useDeviceNodeContext', () => ({
  useDeviceNodeContext: (...args: unknown[]) => mockUseDeviceNodeContext(...args),
}))

const shellWindowPatches: unknown[] = []
jest.mock('../../../layout/useSetShellWindow', () => ({
  useSetShellWindow: (patch: unknown) => {
    shellWindowPatches.push(patch)
  },
}))

jest.mock('../../DeviceContext', () => ({
  DeviceContextBanner: ({ deviceName }: { deviceName: string }) => (
    <div data-testid="device-context-banner">{deviceName} context banner</div>
  ),
}))

jest.mock('../../../../map2/components/AudioInterfaceControl', () => ({
  AudioInterfaceControl: (props: { nodeId?: string | null }) => mockAudioInterfaceControl(props),
}))

describe('HoToneJoGGView', () => {
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

    render(<HoToneJoGGView />)

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

    shellWindowPatches.length = 0
    render(<HoToneJoGGView />)

    expect((shellWindowPatches[shellWindowPatches.length - 1] as { subtitle?: string })?.subtitle).toBe(
      'USB Audio Interface Configuration & Monitoring · Viewing rack-b',
    )
    expect(screen.getByTestId('audio-interface-control').textContent).toBe('node-b')
    expect(mockAudioInterfaceControl.mock.calls[0]?.[0]).toEqual({ nodeId: 'node-b' })
  })

  it('shows a cluster-wide warning when the interface is not detected anywhere', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'not_found' })

    render(<HoToneJoGGView />)

    expect(screen.getByText('No HoTone JoGG interface is currently detected on any cluster node')).toBeTruthy()
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })
})
