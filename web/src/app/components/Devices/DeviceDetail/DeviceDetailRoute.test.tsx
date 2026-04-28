import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Carbon Tabs reads window.matchMedia for breakpoint detection.
// jsdom doesn't ship it; polyfill before any component renders.
beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

jest.mock('../../../../map2/clients/devices', () => ({
  __esModule: true,
  getDeviceProfile: jest.fn(async (_packId: string, _model: string, kind: string) => {
    if (kind !== 'audio') {
      throw new Error('not found')
    }
    return {
      profile: {
        pack_id: 'edirol-ua',
        model: 'ua-1000',
        kind: 'audio',
        path: '/repo/x.yaml',
        hardware_id: 'usb:0582:00ed',
        document: {
          description: 'UA-1000.',
          identity: { hardware_id: 'usb:0582:00ed' },
          loopback_ports: { playback: 'system:playback_1', capture: 'system:capture_1' },
        },
      },
    }
  }),
  listPackSources: jest.fn(async () => ({
    sources: [
      {
        pack_id: 'edirol-ua', vendor: 'EDIROL / Roland', source: 'shipped',
        path: '/repo/device-packs/edirol-ua', is_degraded: false,
        degraded_files: [], model_count: 6, profile_count: 12,
      },
    ],
    count: 1,
  })),
  listDeviceDiagnostics: jest.fn(async () => ({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })),
}))

import { DeviceDetailRoute } from './DeviceDetailRoute'

function renderRoute(path = '/devices/profile/edirol-ua/ua-1000/v2') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/devices/profile/:packId/:model/v2" element={<DeviceDetailRoute />} />
          <Route path="/devices" element={<div>devices stub</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

test('DeviceDetailRoute: hero card + tab strip + Overview default', async () => {
  renderRoute()
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'ua-1000', level: 1 })).toBeInTheDocument()
  })
  const crumb = screen.getByRole('link', { name: 'Hardware Store' })
  expect(crumb).toHaveAttribute('href', '/devices')
  // All five tabs present.
  expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Audio I/O' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Bindings' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Diagnostics' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'License' })).toBeInTheDocument()
})

test('DeviceDetailRoute: profile-not-found shows warning + back link', async () => {
  const devicesMock = jest.requireMock('../../../../map2/clients/devices')
  ;(devicesMock.getDeviceProfile as jest.Mock).mockRejectedValueOnce(new Error('404'))
  ;(devicesMock.getDeviceProfile as jest.Mock).mockRejectedValueOnce(new Error('404'))
  ;(devicesMock.getDeviceProfile as jest.Mock).mockRejectedValueOnce(new Error('404'))

  renderRoute('/devices/profile/unknown/missing/v2')
  await waitFor(() => {
    expect(screen.getByText('Profile not found')).toBeInTheDocument()
  })
  expect(screen.getByText(/Back to Hardware Store/)).toBeInTheDocument()
})
