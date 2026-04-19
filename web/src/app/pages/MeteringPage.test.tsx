import React from 'react'
import { render, screen } from '@testing-library/react'

import { MeteringPage } from './MeteringPage'

const mockUseCluster = jest.fn()
const mockUseIsMobile = jest.fn()
const mockUseWebSocketTopic = jest.fn()

function mockNodePanel(testId: string) {
  return ({ nodeId }: { nodeId?: string | null }) => (
    <div data-testid={testId}>{nodeId ?? 'local'}</div>
  )
}

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketTopic: (...args: unknown[]) => mockUseWebSocketTopic(...args),
}))

jest.mock('../components/Visualizations/SpectrumAnalyzer', () => ({
  SpectrumAnalyzer: mockNodePanel('spectrum-analyzer'),
}))

jest.mock('../components/Visualizations/LoudnessMeter', () => ({
  LoudnessMeter: mockNodePanel('loudness-meter'),
}))

jest.mock('../components/Visualizations/CPUMeterPanel', () => ({
  CPUMeterPanel: mockNodePanel('cpu-meter-panel'),
}))

jest.mock('../components/Visualizations/LatencyDisplay', () => ({
  LatencyDisplay: mockNodePanel('latency-display'),
}))

jest.mock('../components/Visualizations/PhaseCorrelationMeter', () => ({
  PhaseCorrelationMeter: mockNodePanel('phase-correlation-meter'),
}))

jest.mock('../components/Visualizations/VuMeterDisplay', () => ({
  VuMeterDisplay: mockNodePanel('vu-meter-display'),
}))

jest.mock('../components/Visualizations/DynamicsMeteringPanel', () => ({
  DynamicsMeteringPanel: mockNodePanel('dynamics-metering-panel'),
}))

jest.mock('../components/Visualizations/ClusterMeteringStrip', () => ({
  ClusterMeteringStrip: () => <div data-testid="cluster-metering-strip">cluster-strip</div>,
}))

describe('MeteringPage cluster integration', () => {
  beforeEach(() => {
    mockUseCluster.mockReset()
    mockUseIsMobile.mockReset()
    mockUseWebSocketTopic.mockReset()

    mockUseIsMobile.mockReturnValue(false)
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', latencyMs: 18.4 },
      ],
    })
  })

  it('subscribes to node-prefixed meter topics and propagates the selected node into detail panels', () => {
    render(<MeteringPage />)

    expect(screen.getByText('JUCE Core Engine · rack-b')).toBeTruthy()
    expect(screen.getByText('Viewing remote node rack-b · peer latency 18.4 ms.')).toBeTruthy()

    expect(Array.from(new Set(mockUseWebSocketTopic.mock.calls.map(([topic]) => topic)))).toEqual([
      'node:node-b/meters',
      'node:node-b/cpu',
      'node:node-b/latency',
    ])

    expect(screen.getByTestId('spectrum-analyzer').textContent).toBe('node-b')
    expect(screen.getByTestId('vu-meter-display').textContent).toBe('node-b')
    expect(screen.getByTestId('loudness-meter').textContent).toBe('node-b')
    expect(screen.getByTestId('phase-correlation-meter').textContent).toBe('node-b')
    expect(screen.getByTestId('dynamics-metering-panel').textContent).toBe('node-b')
    expect(screen.getByTestId('cpu-meter-panel').textContent).toBe('node-b')
    expect(screen.getByTestId('latency-display').textContent).toBe('node-b')
  })

  it('switches to cluster-strip mode when all nodes are selected', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'all',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', latencyMs: 18.4 },
      ],
    })

    render(<MeteringPage />)

    expect(screen.getByText('JUCE Core Engine')).toBeTruthy()
    expect(screen.getByText(': Cluster Meters')).toBeTruthy()
    expect(screen.getByText('Viewing cluster mode. Click a node column below to switch into full single-node metering.')).toBeTruthy()
    expect(screen.getByTestId('cluster-metering-strip')).toBeTruthy()
    expect(screen.queryByTestId('spectrum-analyzer')).toBeNull()
    expect(screen.queryByTestId('vu-meter-display')).toBeNull()
    expect(screen.queryByTestId('cpu-meter-panel')).toBeNull()
  })

  it('uses unprefixed local topics and local panel props when no remote node is selected', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', latencyMs: 18.4 },
      ],
    })

    render(<MeteringPage />)

    expect(Array.from(new Set(mockUseWebSocketTopic.mock.calls.map(([topic]) => topic)))).toEqual([
      'meters',
      'cpu',
      'latency',
    ])
    expect(screen.getByTestId('spectrum-analyzer').textContent).toBe('local')
    expect(screen.getByTestId('vu-meter-display').textContent).toBe('local')
    expect(screen.queryByTestId('cluster-metering-strip')).toBeNull()
  })
})
