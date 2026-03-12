import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { ClusterMeteringStrip } from './ClusterMeteringStrip'

const mockSetActiveNode = jest.fn()
const mockUseCluster = jest.fn()
const mockUseVuMeters = jest.fn()
const mockUseCPUMetrics = jest.fn()

jest.mock('../../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../../hooks/useVuMeters', () => ({
  useVuMeters: (...args: unknown[]) => mockUseVuMeters(...args),
}))

jest.mock('../../hooks/useCPUMetrics', () => ({
  useCPUMetrics: (...args: unknown[]) => mockUseCPUMetrics(...args),
}))

describe('ClusterMeteringStrip', () => {
  beforeEach(() => {
    mockSetActiveNode.mockReset()
    mockUseCluster.mockReset()
    mockUseVuMeters.mockReset()
    mockUseCPUMetrics.mockReset()

    mockUseCluster.mockReturnValue({
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'AUDIO-NODE', isLocal: false, isOnline: true, latencyMs: 9.4 },
      ],
      setActiveNode: mockSetActiveNode,
    })
    mockUseVuMeters.mockReturnValue({
      levels: { outputLeft: -12, outputRight: -10 },
      peakHold: { outputLeft: -9, outputRight: -8 },
      isRunning: true,
    })
    mockUseCPUMetrics.mockReturnValue({
      metrics: { totalCpuPercent: 34, xrunCount: 0 },
    })
  })

  it('targets local and remote nodes with the correct meter and cpu hook parameters', () => {
    render(<ClusterMeteringStrip />)

    expect(screen.getByText('local-rack')).toBeTruthy()
    expect(screen.getByText('rack-b')).toBeTruthy()
    expect(mockUseVuMeters.mock.calls).toEqual([
      [{ nodeId: null }],
      [{ nodeId: 'node-b' }],
    ])
    expect(mockUseCPUMetrics.mock.calls).toEqual([
      [{ nodeId: null, useWebSocket: false, pollingInterval: 2000 }],
      [{ nodeId: 'node-b', useWebSocket: false, pollingInterval: 2000 }],
    ])
  })

  it('switches the active node when an operator clicks a node column', () => {
    render(<ClusterMeteringStrip />)

    fireEvent.click(screen.getByRole('button', { name: /rack-b/i }))

    expect(mockSetActiveNode).toHaveBeenCalledWith('node-b')
  })
})
