// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Pivot-13e cycle 3 — HardwareStorePage mounts the pinned-streaming
// overview when the operator has at least one metered device pinned.

import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Reuse the same scaffolding mocks as the main HardwareStorePage tests.
jest.mock('../../../map2/clients/sequencer', () => ({
  __esModule: true,
  sequencerApi: {
    getAssetsForDevice: jest.fn(async (profile_key: string) => ({
      profile_key,
      asset_count: 0,
      asset_ids: [],
    })),
  },
}))

jest.mock('./hooks/useDeviceConnections', () => ({
  __esModule: true,
  useDeviceConnections: () => ({
    connectedKeys: new Set(),
    pinnedKeys: new Set(),
    knownKeys: new Set(),
    degradedPacks: new Set(),
    lastEvent: null,
    status: 'open' as const,
  }),
}))

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  listDeviceProfiles: jest.fn(async () => ({ profiles: [], count: 0 })),
  listPackSources: jest.fn(async () => ({ sources: [], count: 0 })),
  listConnectedDevices: jest.fn(async () => ({
    snapshot: {
      records: [],
      sources_attempted: ['usb', 'alsa_seq', 'alsa_card', 'pipewire'],
      sources_failed: [],
      snapshot_at: 1.0,
    },
    count: 0,
  })),
  listKnownDevices: jest.fn(async () => ({ known: [], count: 0 })),
  listRecentlyDisconnected: jest.fn(async () => ({ recently_disconnected: [], count: 0 })),
  listDeviceDiagnostics: jest.fn(async () => ({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })),
}))

// Mock the streaming hooks so the overview doesn't open a real WS.
const mockStream = jest.fn()
jest.mock('../../hooks/useDevicesPeakMetersStream', () => ({
  useDevicesPeakMetersStream: () => mockStream(),
}))

// Polling hook also referenced by the overview when useStream=false;
// stub it as empty.
jest.mock('../../hooks/useDevicesPeakMetersRegistry', () => ({
  useDevicesPeakMetersRegistry: () => ({
    devices: [],
    isError: false,
    isLoading: false,
  }),
}))

// usePinnedDevices is the main lever for these tests.
const mockUsePinnedDevices = jest.fn<readonly string[], []>()
jest.mock('../../state/uiSettings', () => ({
  __esModule: true,
  usePinnedDevices: () => mockUsePinnedDevices(),
  getPinnedDeviceIds: () => [],
  pinDevice: jest.fn(),
  unpinDevice: jest.fn(),
}))

import { HardwareStorePage } from './HardwareStorePage'

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <HardwareStorePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockStream.mockReturnValue({
    devices: [],
    rows: [],
    hasFirstFrame: true,
    isConnected: true,
    lastError: null,
  })
})

test('HardwareStorePage: omits pinned-streaming overview with no pins', async () => {
  mockUsePinnedDevices.mockReturnValue([])
  renderShell()
  await waitFor(() => {
    // Header always renders.
    expect(screen.getByText('Hardware Store')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('hwstore-pinned-meters')).not.toBeInTheDocument()
})

test('HardwareStorePage: mounts overview when pin translates to metered device', async () => {
  // 'edirol-ua1000' (legacy id) → 'edirol-ua-1000' (registry id).
  mockUsePinnedDevices.mockReturnValue(['edirol-ua1000', 'lcd'])
  mockStream.mockReturnValue({
    devices: [
      {
        device_id: 'edirol-ua-1000',
        input_channels: 10,
        output_channels: 10,
        has_engine_source: true,
        snapshot: {
          input_peak_db: [-6],
          output_peak_db: [-3],
          source: 'engine',
          captured_at: 1715731200.0,
        },
      },
    ],
    rows: [
      {
        device_id: 'edirol-ua-1000',
        input_channels: 10,
        output_channels: 10,
        has_engine_source: true,
        snapshot: {
          input_peak_db: [-6],
          output_peak_db: [-3],
          source: 'engine',
          captured_at: 1715731200.0,
        },
        ageSeconds: 1,
        isStale: false,
      },
    ],
    hasFirstFrame: true,
    isConnected: true,
    lastError: null,
  })
  renderShell()
  await waitFor(() => {
    expect(screen.getByTestId('hwstore-pinned-meters')).toBeInTheDocument()
  })
  expect(screen.getByText('Pinned devices (live)')).toBeInTheDocument()
})

test('HardwareStorePage: omits overview when pins are non-metered surfaces', async () => {
  mockUsePinnedDevices.mockReturnValue(['lcd', 'maschine-mk1', 'tesira'])
  renderShell()
  await waitFor(() => {
    expect(screen.getByText('Hardware Store')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('hwstore-pinned-meters')).not.toBeInTheDocument()
})
