import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { OverviewPage } from './OverviewPage'

jest.mock('../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

jest.mock('../components/StatCard', () => ({
  StatCard: ({ label }: { label: string }) => <div>{label}</div>,
}))

jest.mock('../components/CPUStatusOverview', () => ({
  CPUStatusOverview: () => <div>CPU overview</div>,
}))

jest.mock('../components/PlatformCapabilities', () => ({
  PlatformCapabilities: () => <div>Platform capabilities</div>,
}))

jest.mock('../components/SystemArchitectureFlow', () => ({
  SystemArchitectureFlow: () => <div>System architecture</div>,
}))

jest.mock('../hooks/usePipeWire', () => ({
  usePipeWire: () => ({
    isDaemonRunning: false,
    totalLatencyMs: 0,
    daemonVersion: 'test',
    effectiveQuantum: 128,
    effectiveRate: 48_000,
  }),
}))

jest.mock('../hooks/useAvbStatus', () => ({
  useAVBStatus: () => ({
    data: {
      available: false,
      interface: null,
      ptp: { state: 'unknown' },
      reason: 'Unavailable in test',
    },
    isLoading: false,
  }),
}))

describe('OverviewPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock
  })

  it('renders the restored legacy overview dashboard content', async () => {
    render(<OverviewPage />)

    expect(screen.getByText('Mackes Audio Platform 1-22-25')).toBeTruthy()
    expect(screen.getByText('PipeWire')).toBeTruthy()
    expect(screen.getByText('AVB Stack')).toBeTruthy()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/folders/network-shares')
    })
  })
})
