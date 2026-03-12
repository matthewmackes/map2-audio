import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { NodeSelector } from './NodeSelector'

const mockSetActiveNode = jest.fn()
const mockUseCluster = jest.fn()

jest.mock('../../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

describe('NodeSelector', () => {
  beforeEach(() => {
    mockSetActiveNode.mockReset()
    mockUseCluster.mockReturnValue({
      nodes: [
        {
          nodeId: 'node-local',
          hostname: 'local-rack',
          role: 'LOCAL',
          isLocal: true,
          isOnline: true,
          latencyMs: 0,
          lastSeen: '2026-03-11T12:00:00Z',
        },
        {
          nodeId: 'node-b',
          hostname: 'rack-b',
          role: 'AUDIO-NODE',
          isLocal: false,
          isOnline: false,
          latencyMs: 12.5,
          lastSeen: '2026-03-11T11:58:00Z',
        },
      ],
      activeNodeId: null,
      setActiveNode: mockSetActiveNode,
      isClusterMode: true,
      localNodeId: 'node-local',
    })
  })

  it('renders all cluster nodes plus the all-nodes option with status markers', () => {
    render(<NodeSelector />)

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual([
      'Online · local-rack (local) · 0.0ms',
      'Offline · rack-b · 12.5ms',
      'Online · All nodes',
    ])
  })

  it('updates cluster selection for remote and local targets', () => {
    render(<NodeSelector />)

    const select = screen.getByRole('combobox')

    fireEvent.change(select, { target: { value: 'node-b' } })
    expect(mockSetActiveNode).toHaveBeenCalledWith('node-b')

    fireEvent.change(select, { target: { value: 'node-local' } })
    expect(mockSetActiveNode).toHaveBeenCalledWith(null)
  })

  it('hides itself when cluster mode is disabled', () => {
    mockUseCluster.mockReturnValue({
      nodes: [],
      activeNodeId: null,
      setActiveNode: mockSetActiveNode,
      isClusterMode: false,
      localNodeId: 'node-local',
    })

    const { container } = render(<NodeSelector />)

    expect(container).toBeEmptyDOMElement()
  })
})
