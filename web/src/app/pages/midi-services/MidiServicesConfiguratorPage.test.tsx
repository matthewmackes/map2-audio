import '@testing-library/jest-dom'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MidiServicesConfiguratorPage } from './MidiServicesConfiguratorPage'
import type { ConfiguratorPackDescriptor } from '../../components/DeviceConfigurator/types'

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

const mockPushToast = jest.fn()
jest.mock('../../components/Toasts', () => ({
  __esModule: true,
  useToasts: () => ({ pushToast: mockPushToast, dismissToast: jest.fn() }),
}))

function makePack(
  packId: string,
  bespokeRoute?: string,
): ConfiguratorPackDescriptor {
  return {
    packId,
    displayName: packId.toUpperCase(),
    vendorName: `${packId}-vendor`,
    summary: `Configure ${packId}`,
    supportedPrimitives: ['detection'],
    fetchStatus: jest.fn(async () => ({
      pack_id: packId,
      presence: 'present_stock' as const,
      transport: 'usb-sysfs',
      serial: null,
      raw: {},
    })),
    tabs: [],
    metadata: bespokeRoute ? { bespoke_route: bespokeRoute } : {},
  }
}

function renderPage(packs: ConfiguratorPackDescriptor[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/midi/devices/configurator']}>
        <Routes>
          <Route
            path="/midi/devices/configurator"
            element={<MidiServicesConfiguratorPage packs={packs} />}
          />
          <Route
            path="/midi/devices/meloaudio-midi-commander/configurator"
            element={<div data-testid="meloaudio-bespoke">bespoke</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MidiServicesConfiguratorPage', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
  })

  it('renders the page title and the device-pack picker', async () => {
    renderPage([makePack('alpha', '/alpha/route')])
    expect(
      await screen.findByText('Map a MIDI controller'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('device-pack-picker')).toBeInTheDocument()
  })

  it('navigates to the pack bespoke_route when an available pack is picked', async () => {
    renderPage([makePack('meloaudio', '/midi/devices/meloaudio-midi-commander/configurator')])
    const tile = await screen.findByTestId('device-pack-tile-meloaudio')
    fireEvent.click(tile)
    await waitFor(() =>
      expect(screen.getByTestId('meloaudio-bespoke')).toBeInTheDocument(),
    )
  })

  it('warns via toast when a pack has no bespoke_route registered', async () => {
    renderPage([makePack('rookie')])
    const tile = await screen.findByTestId('device-pack-tile-rookie')
    fireEvent.click(tile)
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringContaining('ROOKIE has not registered a configurator surface'),
      'warn',
    )
  })

  it('switches to the MIDI Learn module when the operator picks the fallback', async () => {
    renderPage([makePack('alpha', '/alpha/route')])
    const learnTile = await screen.findByTestId('device-pack-tile-midi-learn')
    fireEvent.click(learnTile)
    expect(await screen.findByTestId('midi-learn-module')).toBeInTheDocument()
    // Picker is gone; learn is up.
    expect(screen.queryByTestId('device-pack-picker')).toBeNull()
  })

  it('seeds four brain slots in the MIDI Learn module', async () => {
    renderPage([makePack('alpha', '/alpha/route')])
    fireEvent.click(await screen.findByTestId('device-pack-tile-midi-learn'))
    await screen.findByTestId('midi-learn-module')
    // Slot picker label
    expect(screen.getByText('Brain slot')).toBeInTheDocument()
  })
})
