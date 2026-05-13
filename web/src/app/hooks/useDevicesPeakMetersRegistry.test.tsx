// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

import '@testing-library/jest-dom'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

import { useDevicesPeakMetersRegistry } from './useDevicesPeakMetersRegistry'

function renderWithQuery(node: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

function mockFetchOnce(payload: unknown, status = 200) {
  // @ts-expect-error jsdom shim
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }))
}

function Probe({ enabled }: { enabled?: boolean }) {
  const { devices, isError, isLoading } = useDevicesPeakMetersRegistry({
    refetchIntervalMs: 60_000,
    enabled,
  })
  return (
    <div>
      <span data-testid="probe-count">{devices.length}</span>
      <span data-testid="probe-error">{isError ? 'yes' : 'no'}</span>
      <span data-testid="probe-loading">{isLoading ? 'yes' : 'no'}</span>
      <span data-testid="probe-ids">{devices.map((d) => d.device_id).join(',')}</span>
    </div>
  )
}

describe('useDevicesPeakMetersRegistry', () => {
  beforeEach(() => {
    // @ts-expect-error
    global.fetch = undefined
  })

  it('returns the alphabetical device list', async () => {
    mockFetchOnce({
      devices: [
        { device_id: 'edirol-ua-1000', input_channels: 10, output_channels: 10, has_engine_source: false },
        { device_id: 'hotone-jogg', input_channels: 2, output_channels: 2, has_engine_source: false },
        { device_id: 'lexicon-mpx1', input_channels: 2, output_channels: 2, has_engine_source: true },
        { device_id: 'tascam-us144mkii', input_channels: 4, output_channels: 4, has_engine_source: false },
      ],
    })
    renderWithQuery(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-count').textContent).toBe('4')
    })
    expect(screen.getByTestId('probe-ids').textContent).toBe(
      'edirol-ua-1000,hotone-jogg,lexicon-mpx1,tascam-us144mkii',
    )
  })

  it('flags isError when the route 5xxs', async () => {
    mockFetchOnce({}, 500)
    renderWithQuery(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-error').textContent).toBe('yes')
    })
  })

  it('returns empty list when disabled', () => {
    mockFetchOnce({ devices: [] })
    renderWithQuery(<Probe enabled={false} />)
    expect(screen.getByTestId('probe-count').textContent).toBe('0')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
