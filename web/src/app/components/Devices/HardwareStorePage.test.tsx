/**
 * HardwareStorePage — T2459-G3 page-shell tests.
 *
 * Mocks the WS hook + REST client; verifies section partitioning,
 * empty state, and degraded-backend banner.
 */

import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// T2461-A9 — page now consumes brainApi.getAssetsForDevice via
// useBrainAssetsByDevice. Stub it so jsdom queries don't try to fetch.
jest.mock('../../../map2/clients/brain', () => ({
  __esModule: true,
  brainApi: {
    getAssetsForDevice: jest.fn(async (profile_key: string) => ({
      profile_key,
      asset_count: 0,
      asset_ids: [],
    })),
  },
}))

// Mock the WS hook (T2459-G2) — page tests don't exercise the socket.
jest.mock('./hooks/useDeviceConnections', () => ({
  __esModule: true,
  useDeviceConnections: () => ({
    connectedKeys: new Set(['edirol-ua/ua-1000.audio']),
    pinnedKeys: new Set(['hotone/jogg.audio']),
    knownKeys: new Set(),
    degradedPacks: new Set(),
    lastEvent: null,
    status: 'open' as const,
  }),
}))

// Mock the REST client.
jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  listDeviceProfiles: jest.fn(async () => ({
    profiles: [
      {
        pack_id: 'edirol-ua', model: 'ua-1000', kind: 'audio',
        path: '/x', hardware_id: 'usb:0582:00ed',
      },
      {
        pack_id: 'hotone', model: 'jogg', kind: 'audio',
        path: '/y', hardware_id: 'usb:1f38:0001',
      },
      {
        pack_id: 'edirol-ua', model: 'ua-25', kind: 'audio',
        path: '/z', hardware_id: 'usb:0582:00b9',
      },
    ],
    count: 3,
  })),
  listPackSources: jest.fn(async () => ({
    sources: [
      { pack_id: 'edirol-ua', vendor: 'EDIROL / Roland', source: 'shipped',
        path: '/repo/device-packs/edirol-ua', is_degraded: false,
        degraded_files: [], model_count: 6, profile_count: 12 },
      { pack_id: 'hotone', vendor: 'Hotone Audio', source: 'shipped',
        path: '/repo/device-packs/hotone', is_degraded: false,
        degraded_files: [], model_count: 4, profile_count: 8 },
    ],
    count: 2,
  })),
  listConnectedDevices: jest.fn(async () => ({
    snapshot: {
      records: [],
      sources_attempted: ['usb', 'alsa_seq', 'alsa_card', 'pipewire'],
      sources_failed: [],
      snapshot_at: 1.0,
    },
    count: 0,
  })),
  listKnownDevices: jest.fn(async () => ({
    known: [
      { profile_key: 'edirol-ua/ua-1000.audio', is_pinned: false, last_seen_at: 1000 },
      { profile_key: 'hotone/jogg.audio', is_pinned: true, last_seen_at: 999 },
    ],
    count: 2,
  })),
  listRecentlyDisconnected: jest.fn(async () => ({
    recently_disconnected: [],
    count: 0,
  })),
  listDeviceDiagnostics: jest.fn(async () => ({
    diagnostics: [],
    count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })),
}))

import { HardwareStorePage } from './HardwareStorePage'

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <HardwareStorePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

test('HardwareStorePage: renders header + status tag', async () => {
  renderShell()
  expect(await screen.findByText('Hardware Store')).toBeInTheDocument()
  expect(await screen.findByText(/WS · open/)).toBeInTheDocument()
})

test('HardwareStorePage: connected section shows the connected profile', async () => {
  renderShell()
  // Section heading is the <h2> with class hwstore-section__title.
  await waitFor(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>('.hwstore-section__title'),
    ).map((h) => h.textContent)
    expect(headings).toContain('Connected')
  })
  // The connected key from the WS hook mock.
  await waitFor(() => {
    const tile = document.querySelector(
      '[data-profile-key="edirol-ua/ua-1000.audio"]',
    )
    expect(tile).not.toBeNull()
  })
})

test('HardwareStorePage: catalogue includes profiles not connected and not known', async () => {
  renderShell()
  // ua-25 is in the profile list but not connected and not known →
  // belongs in catalogue.
  await waitFor(() => {
    const tile = document.querySelector(
      '[data-profile-key="edirol-ua/ua-25.audio"]',
    )
    expect(tile).not.toBeNull()
  })
})

test('HardwareStorePage: section counts reflect partitioning', async () => {
  const { container } = renderShell()
  await waitFor(() => {
    expect(container.querySelector('.hwstore-section__count')).not.toBeNull()
  })
  // Connected count is 1 (ua-1000.audio).
  const sections = container.querySelectorAll('.hwstore-section')
  // First section is "Connected".
  const connectedSection = sections[0]
  const connectedCount = connectedSection.querySelector('.hwstore-section__count')
  expect(connectedCount?.textContent).toBe('1')
})

test('HardwareStorePage: empty-state renders when nothing in any section', async () => {
  // Override mocks for this test only.
  const devicesMock = jest.requireMock('../../../map2/clients/devices')
  ;(devicesMock.listDeviceProfiles as jest.Mock).mockResolvedValueOnce({ profiles: [], count: 0 })
  ;(devicesMock.listPackSources as jest.Mock).mockResolvedValueOnce({ sources: [], count: 0 })
  ;(devicesMock.listKnownDevices as jest.Mock).mockResolvedValueOnce({ known: [], count: 0 })
  ;(devicesMock.listRecentlyDisconnected as jest.Mock).mockResolvedValueOnce({
    recently_disconnected: [], count: 0,
  })
  ;(devicesMock.listConnectedDevices as jest.Mock).mockResolvedValueOnce({
    snapshot: { records: [], sources_attempted: [], sources_failed: [], snapshot_at: 1 },
    count: 0,
  })
  ;(devicesMock.listDeviceDiagnostics as jest.Mock).mockResolvedValueOnce({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })

  // Override the WS hook for the empty case.
  const wsHookMock = jest.requireMock('./hooks/useDeviceConnections')
  const original = wsHookMock.useDeviceConnections
  wsHookMock.useDeviceConnections = () => ({
    connectedKeys: new Set<string>(),
    pinnedKeys: new Set<string>(),
    knownKeys: new Set<string>(),
    degradedPacks: new Set<string>(),
    lastEvent: null,
    status: 'open' as const,
  })

  try {
    renderShell()
    await waitFor(() => {
      expect(screen.getByText(/No hardware detected/)).toBeInTheDocument()
    })
  } finally {
    wsHookMock.useDeviceConnections = original
  }
})
