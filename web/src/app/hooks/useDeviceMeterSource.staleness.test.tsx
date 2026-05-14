// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// pivot-13c cycle 3 — staleness branch of useDeviceMeterSource.

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

function Probe({
  deviceId,
  staleThresholdSeconds,
}: {
  deviceId: string
  staleThresholdSeconds?: number
}) {
  const { source, isStale, ageSeconds } = useDeviceMeterSource(deviceId, {
    refetchIntervalMs: 60_000,
    staleThresholdSeconds,
  })
  return (
    <div>
      <span data-testid="probe-source">{String(source ?? '')}</span>
      <span data-testid="probe-stale">{isStale ? 'yes' : 'no'}</span>
      <span data-testid="probe-age">{ageSeconds === null ? '' : String(Math.floor(ageSeconds))}</span>
    </div>
  )
}

describe('useDeviceMeterSource staleness', () => {
  beforeEach(() => {
    // @ts-expect-error jsdom
    global.fetch = undefined
  })

  it('marks fresh snapshots as not stale', async () => {
    mockFetchOnce({
      device_id: 'edirol-ua-1000',
      input_peak_db: [-6.0],
      output_peak_db: [-3.0],
      source: 'engine',
      captured_at: Date.now() / 1000,
    })
    renderWithQuery(<Probe deviceId="edirol-ua-1000" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('engine')
    })
    expect(screen.getByTestId('probe-stale')).toHaveTextContent('no')
  })

  it('marks old snapshots as stale once the threshold is crossed', async () => {
    mockFetchOnce({
      device_id: 'tascam-us144mkii',
      input_peak_db: [-150],
      output_peak_db: [-150],
      source: 'engine',
      captured_at: Date.now() / 1000 - 30, // 30 s old
    })
    renderWithQuery(
      <Probe deviceId="tascam-us144mkii" staleThresholdSeconds={5} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('probe-stale')).toHaveTextContent('yes')
    })
    // age >= 30 s (clamped by Math.floor)
    expect(Number(screen.getByTestId('probe-age').textContent)).toBeGreaterThanOrEqual(30)
  })

  it('reports ageSeconds=null when payload omits captured_at', async () => {
    mockFetchOnce({
      device_id: 'hotone-jogg',
      input_peak_db: [-150, -150],
      output_peak_db: [-150, -150],
      source: 'placeholder',
    })
    renderWithQuery(<Probe deviceId="hotone-jogg" />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-source')).toHaveTextContent('placeholder')
    })
    expect(screen.getByTestId('probe-age').textContent).toBe('')
    expect(screen.getByTestId('probe-stale')).toHaveTextContent('no')
  })
})
