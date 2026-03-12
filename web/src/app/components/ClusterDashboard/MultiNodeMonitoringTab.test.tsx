import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

const mockUseMultiSystemMonitoring = jest.fn()

jest.mock('@/app/hooks/useMultiSystemMonitoring', () => ({
  useMultiSystemMonitoring: () => mockUseMultiSystemMonitoring(),
}))

import { MultiNodeMonitoringTab } from './MultiNodeMonitoringTab'

describe('MultiNodeMonitoringTab', () => {
  beforeEach(() => {
    mockUseMultiSystemMonitoring.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }
  })

  it('renders comparison table rows with Carbon tags for high and low values', async () => {
    const now = Date.now()
    mockUseMultiSystemMonitoring.mockReturnValue({
      systems: [
        {
          systemId: 'node-a',
          systemName: 'Node A',
          hostInfo: null,
          health: {
            cpu_temp_celsius: 42.1,
            max_temp_celsius: 55,
            cpu_usage_percent: 10,
            memory_usage_percent: 40,
            fans: [],
            power: { power_status: 'good' },
            overall_health: 'good',
            health_details: {
              temperature_status: 'good',
              fan_status: 'good',
              power_status: 'good',
            },
          },
          disk: {
            disks: [],
            use_percent: 32,
            overall_health: 'good',
          },
          audioEngine: null,
          clusterServices: null,
          avbNetwork: null,
          versionInfo: null,
          isConnected: true,
          lastUpdate: now,
          status: 'online',
        },
      ],
      getStats: () => ({
        totalSystems: 1,
        onlineSystems: 1,
        offlineSystems: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        avgCpuUsage: 10,
        avgMemoryUsage: 40,
        avgDiskUsage: 32,
        avgAudioCpuLoad: 0,
        totalXruns: 0,
        avbNodesActive: 0,
        ptpSyncedNodes: 0,
        raftLeaders: 0,
        totalAvbStreams: 0,
      }),
      getComparisons: () => [
        {
          metric: 'CPU',
          unit: '%',
          values: {
            'node-b': 67.2,
            'node-a': 10.1,
          },
          highest: { systemId: 'node-b', value: 67.2 },
          lowest: { systemId: 'node-a', value: 10.1 },
          average: 38.6,
        },
      ],
      getSystemsRankedBy: () => [
        {
          systemId: 'node-a',
          systemName: 'Node A',
          hostInfo: null,
          health: {
            cpu_temp_celsius: 42.1,
            max_temp_celsius: 55,
            cpu_usage_percent: 10,
            memory_usage_percent: 40,
            fans: [],
            power: { power_status: 'good' },
            overall_health: 'good',
            health_details: {
              temperature_status: 'good',
              fan_status: 'good',
              power_status: 'good',
            },
          },
          disk: {
            disks: [],
            use_percent: 32,
            overall_health: 'good',
          },
          audioEngine: null,
          clusterServices: null,
          avbNetwork: null,
          versionInfo: null,
          isConnected: true,
          lastUpdate: now,
          status: 'online',
        },
      ],
    })

    render(<MultiNodeMonitoringTab />)

    expect(screen.getByText('CPU (%)')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('Average')).toBeInTheDocument()
  })

  it('renders empty state when no systems are monitored', () => {
    mockUseMultiSystemMonitoring.mockReturnValue({
      systems: [],
      getStats: () => ({
        totalSystems: 0,
        onlineSystems: 0,
        offlineSystems: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        avgDiskUsage: 0,
        avgAudioCpuLoad: 0,
        totalXruns: 0,
        avbNodesActive: 0,
        ptpSyncedNodes: 0,
        raftLeaders: 0,
        totalAvbStreams: 0,
      }),
      getComparisons: () => [],
      getSystemsRankedBy: () => [],
    })

    render(<MultiNodeMonitoringTab />)
    expect(screen.getByText('No nodes are currently being monitored')).toBeInTheDocument()
  })
})
