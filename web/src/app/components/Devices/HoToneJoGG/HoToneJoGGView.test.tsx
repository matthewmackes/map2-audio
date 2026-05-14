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

const mockUseDeviceMeterSource = jest.fn(() => ({
  source: undefined,
  payload: undefined,
  isError: false,
  isLoading: false,
}))

jest.mock('../../../hooks/useDeviceMeterSource', () => ({
  useDeviceMeterSource: (...args: unknown[]) => mockUseDeviceMeterSource(...(args as [])),
}))

// Run-13i cycle 1 — the JoGG banner switched to streaming via the
// useStreamMeter prop. Mock the WS hook with the same fake so
// existing assertions don't have to care which hook drives the
// banner.
jest.mock('../../../hooks/useDeviceMeterSourceStream', () => ({
  useDeviceMeterSourceStream: (...args: unknown[]) =>
    mockUseDeviceMeterSource(...(args as [])),
}))

describe('HoToneJoGGView', () => {
  beforeEach(() => {
    mockAudioInterfaceControl.mockClear()
    mockUseDeviceMeterSource.mockClear()
    shellWindowPatches.length = 0
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', isOnline: true },
        { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
      ],
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'needs_switch',
      deviceLocation: { nodeId: 'node-b', hostname: 'rack-b' },
      targetNode: { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
    })
  })

  it('renders controls against the reporting node when the hardware is on another node', () => {
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'needs_switch',
      deviceLocation: { nodeId: 'node-b', hostname: 'rack-b' },
      targetNode: { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
    })

    render(<HoToneJoGGView />)

    expect(screen.getByTestId('device-context-banner').textContent).toContain('HoTone JoGG context banner')
    expect(screen.getByTestId('audio-interface-control').textContent).toBe('node-b')
    expect(mockAudioInterfaceControl.mock.calls[0]?.[0]).toEqual({ nodeId: 'node-b' })
    expect((shellWindowPatches[shellWindowPatches.length - 1] as { subtitle?: string })?.subtitle).toBe(
      'USB Audio Interface Configuration & Monitoring · Viewing rack-b',
    )
  })

  it('renders the interface control with a remote node id when already viewing the owning node', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', isOnline: true },
        { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
      ],
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'ready',
      deviceLocation: { nodeId: 'node-b', hostname: 'rack-b' },
      targetNode: { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
    })

    render(<HoToneJoGGView />)

    expect((shellWindowPatches[shellWindowPatches.length - 1] as { subtitle?: string })?.subtitle).toBe(
      'USB Audio Interface Configuration & Monitoring · Viewing rack-b',
    )
    expect(screen.getByTestId('audio-interface-control').textContent).toBe('node-b')
    expect(mockAudioInterfaceControl.mock.calls[0]?.[0]).toEqual({ nodeId: 'node-b' })
  })

  it('shows a cluster-wide warning when the interface is not detected anywhere', () => {
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'not_found',
      deviceLocation: null,
      targetNode: null,
    })

    render(<HoToneJoGGView />)

    expect(screen.getByText('No HoTone JoGG interface is currently detected on any cluster node')).toBeTruthy()
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })

  it('renders the meter-source banner above the interface control when ready', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: 'placeholder',
      payload: undefined,
      isError: false,
      isLoading: false,
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'ready',
      deviceLocation: { nodeId: 'node-local', hostname: 'local-rack' },
      targetNode: { nodeId: 'node-local', hostname: 'local-rack', isOnline: true },
    })

    render(<HoToneJoGGView />)

    expect(screen.getByTestId('jogg-meter-source-banner')).toBeTruthy()
    expect(screen.getByTestId('jogg-meter-source').textContent).toContain(
      'Awaiting engine wire-up',
    )
  })

  it('renders the meter-source banner in error state when the route 5xxs', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: undefined,
      payload: undefined,
      isError: true,
      isLoading: false,
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'ready',
      deviceLocation: { nodeId: 'node-local', hostname: 'local-rack' },
      targetNode: { nodeId: 'node-local', hostname: 'local-rack', isOnline: true },
    })

    render(<HoToneJoGGView />)

    expect(screen.getByTestId('jogg-meter-source').textContent).toContain(
      'Endpoint unavailable',
    )
  })

  it('disables the meter-source query when viewing a remote node (banner shows undefined source)', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: undefined,
      payload: undefined,
      isError: false,
      isLoading: false,
    })
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'ready',
      deviceLocation: { nodeId: 'node-b', hostname: 'rack-b' },
      targetNode: { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
    })
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', isOnline: true },
        { nodeId: 'node-b', hostname: 'rack-b', isOnline: true },
      ],
    })

    render(<HoToneJoGGView />)

    // Hook called with enabled=false because controlIsRemote=true.
    const lastCall = mockUseDeviceMeterSource.mock.calls[
      mockUseDeviceMeterSource.mock.calls.length - 1
    ] as unknown as [string, { enabled?: boolean } | undefined]
    expect(lastCall[0]).toBe('hotone-jogg')
    expect(lastCall[1]?.enabled).toBe(false)
  })

  it('shows an offline-node message instead of controls when the reporting node is offline', () => {
    mockUseDeviceNodeContext.mockReturnValue({
      deviceState: 'node_offline',
      deviceLocation: { nodeId: 'node-b', hostname: 'rack-b' },
      targetNode: { nodeId: 'node-b', hostname: 'rack-b', isOnline: false },
    })

    render(<HoToneJoGGView />)

    expect(screen.getByText('The node with the HoTone JoGG interface is offline')).toBeTruthy()
    expect(screen.queryByTestId('audio-interface-control')).toBeNull()
  })
})
