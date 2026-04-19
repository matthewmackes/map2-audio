import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { SystemSummary } from './SystemSummary'
import type { ShellSummaryData } from './useShellSummaryData'

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div data-testid="node-nav-bar" />,
}))

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div data-testid="shell-latency-pressure-readout">09</div>,
}))

jest.mock('../components/TaskbarClock', () => ({
  TaskbarClock: () => <div data-testid="taskbar-clock">9:41 AM</div>,
}))

function buildSummaryData(overrides: Partial<ShellSummaryData> = {}): ShellSummaryData {
  return {
    hostInfo: {
      hostname: 'map2-host',
      kernel_version: '6.9.0-rt',
      os_version: 'Fedora Linux 42',
    },
    hostSummaryItems: ['Fedora Linux 42', 'map2-host'],
    hostSummaryState: 'ready',
    platformStatus: {
      avb: { label: 'AVB: operational', state: 'ok' },
      avdecc: { label: 'AVDECC: 1 entity', state: 'ok' },
      nodes: { label: 'Nodes: 1 active', state: 'ok' },
    },
    platformStatusItems: [
      { label: 'AVB: operational', state: 'ok' },
      { label: 'AVDECC: 1 entity', state: 'ok' },
      { label: 'Nodes: 1 active', state: 'ok' },
    ],
    launcherInterfaceSummary: {
      audioInterfaces: ['RME Fireface UFX'],
      midiInterfaces: ['Express 128'],
      isLoading: false,
      errorMessage: null,
    },
    pendingPushConfirmation: null,
    ...overrides,
  }
}

describe('SystemSummary', () => {
  it('renders explicit loading affordances while host and interface status are still resolving', () => {
    render(
      <SystemSummary
        classNamePrefix="map2-launcher"
        summaryData={buildSummaryData({
          hostInfo: null,
          hostSummaryItems: ['Detecting OS version...', 'Detecting host name...'],
          hostSummaryState: 'loading',
          platformStatus: {
            avb: { label: 'AVB: …', state: 'loading' },
            avdecc: { label: 'AVDECC: …', state: 'loading' },
            nodes: { label: 'Nodes: …', state: 'loading' },
          },
          platformStatusItems: [
            { label: 'AVB: …', state: 'loading' },
            { label: 'AVDECC: …', state: 'loading' },
            { label: 'Nodes: …', state: 'loading' },
          ],
          launcherInterfaceSummary: {
            audioInterfaces: [],
            midiInterfaces: [],
            isLoading: true,
            errorMessage: null,
          },
        })}
      />,
    )

    expect(screen.getByText('Detecting OS version...')).toBeInTheDocument()
    expect(screen.getByText('Detecting host name...')).toBeInTheDocument()
    expect(screen.getByText('AVB: …')).toHaveAttribute('data-status-state', 'loading')
    expect(screen.getByText('Detecting audio interfaces...')).toBeInTheDocument()
    expect(screen.getByText('Detecting MIDI interfaces...')).toBeInTheDocument()
  })

  it('renders degraded-state affordances when host and interface queries fail', () => {
    render(
      <SystemSummary
        classNamePrefix="map2-launcher"
        summaryData={buildSummaryData({
          hostInfo: null,
          hostSummaryItems: ['Host OS unavailable', 'Host name unavailable'],
          hostSummaryState: 'error',
          platformStatus: {
            avb: { label: 'AVB: degraded', state: 'warn' },
            avdecc: { label: 'AVDECC: error', state: 'warn' },
            nodes: { label: 'Nodes: unavailable', state: 'warn' },
          },
          platformStatusItems: [
            { label: 'AVB: degraded', state: 'warn' },
            { label: 'AVDECC: error', state: 'warn' },
            { label: 'Nodes: unavailable', state: 'warn' },
          ],
          launcherInterfaceSummary: {
            audioInterfaces: [],
            midiInterfaces: ['Express 128'],
            isLoading: false,
            errorMessage: 'Failed to fetch interface summary',
          },
        })}
      />,
    )

    expect(screen.getByText('Host OS unavailable')).toBeInTheDocument()
    expect(screen.getByText('Host name unavailable')).toBeInTheDocument()
    expect(screen.getByText('AVDECC: error')).toHaveAttribute('data-status-state', 'warn')
    expect(screen.getByRole('status')).toHaveTextContent('Live interface scan is degraded')
    expect(screen.getByText('MIDI interface scan unavailable')).toBeInTheDocument()
    expect(screen.getByText('Express 128')).toBeInTheDocument()
    expect(screen.getByText('Audio interface scan unavailable')).toBeInTheDocument()
  })
})
