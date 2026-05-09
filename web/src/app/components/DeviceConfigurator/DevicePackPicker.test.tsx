import '@testing-library/jest-dom'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DevicePackPicker } from './DevicePackPicker'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from './types'

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

function makeStatus(
  packId: string,
  presence: DevicePresence,
): DeviceDetectionStatus {
  return {
    pack_id: packId,
    presence,
    transport: 'usb-sysfs',
    serial: null,
    raw: {},
  }
}

function makePack(
  packId: string,
  presence: DevicePresence,
  overrides: Partial<ConfiguratorPackDescriptor> = {},
): ConfiguratorPackDescriptor {
  return {
    packId,
    displayName: packId.toUpperCase(),
    vendorName: `${packId}-vendor`,
    summary: `Configure ${packId}`,
    supportedPrimitives: ['detection', 'push'],
    fetchStatus: jest.fn(async () => makeStatus(packId, presence)),
    tabs: [],
    ...overrides,
  }
}

function renderPicker(
  packs: ConfiguratorPackDescriptor[],
  onPick = jest.fn(),
  onPickMidiLearn?: () => void,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    onPick,
    onPickMidiLearn,
    ...render(
      <QueryClientProvider client={client}>
        <DevicePackPicker
          packs={packs}
          onPick={onPick}
          onPickMidiLearn={onPickMidiLearn}
          pollMs={false}
        />
      </QueryClientProvider>,
    ),
  }
}

describe('DevicePackPicker', () => {
  it('renders a tile for each pack', async () => {
    renderPicker([
      makePack('alpha', 'present_stock'),
      makePack('beta', 'not_present'),
    ])
    expect(await screen.findByTestId('device-pack-tile-alpha')).toBeInTheDocument()
    expect(screen.getByTestId('device-pack-tile-beta')).toBeInTheDocument()
  })

  it('floats present packs above not-present packs', async () => {
    renderPicker([
      makePack('zeta', 'not_present'),
      makePack('alpha', 'present_stock'),
      makePack('mu', 'present_custom'),
    ])
    await waitFor(() =>
      expect(
        screen.getByTestId('device-pack-presence-alpha'),
      ).toBeInTheDocument(),
    )
    const tiles = screen.getAllByTestId(/^device-pack-tile-/)
    // alpha + mu (both present) come before zeta (not present); within
    // the present group they're alphabetized.
    const order = tiles.map((el) => el.getAttribute('data-testid'))
    expect(order).toEqual([
      'device-pack-tile-alpha',
      'device-pack-tile-mu',
      'device-pack-tile-zeta',
    ])
  })

  it('renders the right presence tag per pack', async () => {
    renderPicker([
      makePack('alpha', 'present_stock'),
      makePack('beta', 'present_custom'),
      makePack('gamma', 'present_bootloader'),
      makePack('delta', 'present_unknown'),
      makePack('zeta', 'not_present'),
    ])
    expect(
      await screen.findByTestId('device-pack-presence-alpha'),
    ).toHaveTextContent('Stock')
    expect(screen.getByTestId('device-pack-presence-beta')).toHaveTextContent(
      'Custom',
    )
    expect(screen.getByTestId('device-pack-presence-gamma')).toHaveTextContent(
      'Bootloader',
    )
    expect(screen.getByTestId('device-pack-presence-delta')).toHaveTextContent(
      'Unknown mode',
    )
    expect(screen.getByTestId('device-pack-presence-zeta')).toHaveTextContent(
      'Not connected',
    )
  })

  it('calls onPick when a tile is clicked', async () => {
    const { onPick } = renderPicker([makePack('alpha', 'present_stock')])
    const tile = await screen.findByTestId('device-pack-tile-alpha')
    fireEvent.click(tile)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'alpha' }),
    )
  })

  it('renders the MIDI Learn fallback tile when onPickMidiLearn is supplied', async () => {
    const onPickMidiLearn = jest.fn()
    renderPicker([makePack('alpha', 'present_stock')], jest.fn(), onPickMidiLearn)
    expect(
      await screen.findByTestId('device-pack-tile-midi-learn'),
    ).toBeInTheDocument()
  })

  it('omits the MIDI Learn fallback when onPickMidiLearn is not supplied', async () => {
    renderPicker([makePack('alpha', 'present_stock')])
    await screen.findByTestId('device-pack-tile-alpha')
    expect(screen.queryByTestId('device-pack-tile-midi-learn')).toBeNull()
  })

  it('calls onPickMidiLearn when the fallback tile is clicked', async () => {
    const onPickMidiLearn = jest.fn()
    renderPicker([makePack('alpha', 'present_stock')], jest.fn(), onPickMidiLearn)
    const tile = await screen.findByTestId('device-pack-tile-midi-learn')
    fireEvent.click(tile)
    expect(onPickMidiLearn).toHaveBeenCalledTimes(1)
  })

  it('surfaces a per-pack detection error without breaking the list', async () => {
    const happyPack = makePack('alpha', 'present_stock')
    const sadPack = makePack('beta', 'not_present', {
      fetchStatus: jest.fn(async () => {
        throw new Error('detector blew up')
      }),
    })
    renderPicker([happyPack, sadPack])
    await screen.findByTestId('device-pack-tile-alpha')
    await waitFor(() =>
      expect(screen.getByText('detector blew up')).toBeInTheDocument(),
    )
    // Both tiles still render; the error doesn't tank the picker.
    expect(screen.getByTestId('device-pack-tile-alpha')).toBeInTheDocument()
    expect(screen.getByTestId('device-pack-tile-beta')).toBeInTheDocument()
  })
})
