// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDeviceMeterSource RTL coverage. Mocks global fetch so the hook
// can exercise the placeholder / engine / error paths against any
// device_id without a backend.

import '@testing-library/jest-dom'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

import { useDeviceMeterSource } from './useDeviceMeterSource'

function renderWithQuery(node: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

function mockFetchOnce(payload: unknown, status = 200) {
  // @ts-expect-error jsdom fetch shim
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }))
}

function Probe({ deviceId, enabled }: { deviceId: string; enabled?: boolean }) {
  const { source, isError, isLoading } = useDeviceMeterSource(deviceId, {
    refetchIntervalMs: 60_000,
    enabled,
  })
  return (
    <div>
      <span data-testid="probe-source">{String(source ?? '')}</span>
      <span data-testid="probe-error">{isError ? 'yes' : 'no'}</span>
      <span data-testid="probe-loading">{isLoading ? 'yes' : 'no'}</span>
    </div>
  )
}

describe('useDeviceMeterSource', () => {
  beforeEach(() => {
    // @ts-expect-error jsdom
    global.fetch = undefined
  })

  it('returns placeholder source for a placeholder payload', async () => {
    mockFetchOnce({
      device_id: 'tascam-us144mkii',
      input_peak_db: [-150, -150, -150, -150],
      output_peak_db: [-150, -150, -150, -150],
      source: 'placeholder',
    })
    renderWithQuery(<Probe deviceId="tascam-us144mkii" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('placeholder')
    })
    expect(screen.getByTestId('probe-error')).toHaveTextContent('no')
  })

  it('returns engine source for an engine payload', async () => {
    mockFetchOnce({
      device_id: 'edirol-ua-1000',
      input_peak_db: [-6.0],
      output_peak_db: [-3.0],
      source: 'engine',
    })
    renderWithQuery(<Probe deviceId="edirol-ua-1000" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('engine')
    })
  })

  it('flags isError when the route 5xxs', async () => {
    mockFetchOnce({}, 500)
    renderWithQuery(<Probe deviceId="hotone-jogg" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-error')).toHaveTextContent('yes')
    })
  })

  it('does not fetch when enabled=false (source stays undefined)', () => {
    mockFetchOnce({ source: 'engine' })
    renderWithQuery(<Probe deviceId="lexicon-mpx1" enabled={false} />)
    // No await — disabled queries shouldn't fire at all.
    expect(screen.getByTestId('probe-source').textContent).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keys the cache by device_id so two devices stay independent', async () => {
    // First mount: tascam → placeholder.
    mockFetchOnce({
      device_id: 'tascam-us144mkii',
      input_peak_db: [-150],
      output_peak_db: [-150],
      source: 'placeholder',
    })
    const { unmount } = renderWithQuery(<Probe deviceId="tascam-us144mkii" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('placeholder')
    })
    unmount()

    // Second mount: ua-1000 → engine. Cache key differs so a fresh
    // fetch fires.
    mockFetchOnce({
      device_id: 'edirol-ua-1000',
      input_peak_db: [-6.0],
      output_peak_db: [-3.0],
      source: 'engine',
    })
    renderWithQuery(<Probe deviceId="edirol-ua-1000" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('engine')
    })
  })
})
