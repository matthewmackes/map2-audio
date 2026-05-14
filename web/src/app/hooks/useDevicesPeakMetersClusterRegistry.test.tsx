// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersClusterRegistry — TanStack hook tests.

import '@testing-library/jest-dom'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

import { useDevicesPeakMetersClusterRegistry } from './useDevicesPeakMetersClusterRegistry'

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

function Probe({ includeSnapshot }: { includeSnapshot?: boolean }) {
  const { local, peers, errors, isError, isLoading } =
    useDevicesPeakMetersClusterRegistry({
      refetchIntervalMs: 60_000,
      includeSnapshot,
    })
  return (
    <div>
      <span data-testid="probe-local-count">
        {String(local?.devices?.length ?? '')}
      </span>
      <span data-testid="probe-peers-count">{peers.length}</span>
      <span data-testid="probe-errors-keys">
        {Object.keys(errors).sort().join(',')}
      </span>
      <span data-testid="probe-error">{isError ? 'yes' : 'no'}</span>
      <span data-testid="probe-loading">{isLoading ? 'yes' : 'no'}</span>
    </div>
  )
}

describe('useDevicesPeakMetersClusterRegistry', () => {
  beforeEach(() => {
    // @ts-expect-error jsdom
    global.fetch = undefined
  })

  it('parses the local + peers + errors shape', async () => {
    mockFetchOnce({
      local: { devices: [{ device_id: 'edirol-ua-1000' }] },
      peers: [
        {
          node_id: 'peer-1',
          hostname: 'p1.local',
          devices: [{ device_id: 'tascam-us144mkii' }],
          health: 'ok',
        },
      ],
      errors: { 'peer-2': 'http 504' },
    })
    renderWithQuery(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-local-count')).toHaveTextContent('1')
    })
    expect(screen.getByTestId('probe-peers-count')).toHaveTextContent('1')
    expect(screen.getByTestId('probe-errors-keys')).toHaveTextContent('peer-2')
  })

  it('appends include_snapshot=true to the URL when requested', async () => {
    const calls: string[] = []
    // @ts-expect-error jsdom shim
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          local: { devices: [] },
          peers: [],
          errors: {},
        }),
      }
    })
    renderWithQuery(<Probe includeSnapshot />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    expect(calls.some((u) => u.includes('include_snapshot=true'))).toBe(true)
  })

  it('uses distinct cache keys for include_snapshot=true vs flat', async () => {
    const calls: string[] = []
    // @ts-expect-error jsdom shim
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({ local: { devices: [] }, peers: [], errors: {} }),
      }
    })
    renderWithQuery(
      <>
        <Probe />
        <Probe includeSnapshot />
      </>,
    )
    await waitFor(() => {
      expect(calls.length).toBe(2)
    })
    expect(calls.some((u) => u.endsWith('/cluster/registry'))).toBe(true)
    expect(calls.some((u) => u.includes('include_snapshot=true'))).toBe(true)
  })

  it('flags isError when the route 5xxs', async () => {
    mockFetchOnce({}, 500)
    renderWithQuery(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId('probe-error')).toHaveTextContent('yes')
    })
  })

  it('returns empty defaults until first fetch resolves', () => {
    mockFetchOnce({ local: { devices: [] }, peers: [], errors: {} })
    renderWithQuery(<Probe />)
    expect(screen.getByTestId('probe-peers-count')).toHaveTextContent('0')
    expect(screen.getByTestId('probe-errors-keys')).toHaveTextContent('')
  })
})
