/**
 * T2459-H3-CFG Phase 5 slice 2 — render tests for the four firmware-kind
 * paths (stock / custom / dfu_bootloader / not_present), the loading
 * state, and the error state.
 */

import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockGetStatus = jest.fn()
const mockGetOverride = jest.fn()
const mockDeleteOverride = jest.fn()
const mockGetBundledFirmware = jest.fn()

jest.mock('../../../map2/clients/meloaudioCommander', () => ({
  __esModule: true,
  default: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    getOverride: (...args: unknown[]) => mockGetOverride(...args),
    deleteOverride: (...args: unknown[]) => mockDeleteOverride(...args),
    getBundledFirmware: (...args: unknown[]) => mockGetBundledFirmware(...args),
  },
}))

import { MeloAudioCommanderConfigurator } from './MeloAudioCommanderConfigurator'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MeloAudioCommanderConfigurator />
    </QueryClientProvider>,
  )
}

const STOCK_STATUS = {
  firmware_kind: 'stock' as const,
  is_present: true,
  supports_discovery_wizard: true,
  supports_canonical_config_push: false,
  vendor_id: 0x2eee,
  product_id: 0x0301,
  product_string: 'TSMIDI2.0',
  manufacturer_string: 'MeloAudio',
  serial: '000000000000011',
  sysfs_path: '/sys/bus/usb/devices/3-7',
  bcd_device: '2.00',
}

const CUSTOM_STATUS = {
  firmware_kind: 'custom' as const,
  is_present: true,
  supports_discovery_wizard: true,
  supports_canonical_config_push: true,
  vendor_id: 0x2eee,
  product_id: 0x0301,
  product_string: 'STM32 Customisable Midi Foot Controller',
  manufacturer_string: 'harvie256',
  serial: 'ABC',
  sysfs_path: '/sys/bus/usb/devices/3-7',
  bcd_device: '1.00',
}

const DFU_STATUS = {
  firmware_kind: 'dfu_bootloader' as const,
  is_present: true,
  supports_discovery_wizard: false,
  supports_canonical_config_push: false,
  vendor_id: 0x0483,
  product_id: 0xdf11,
  product_string: 'STM32 BOOTLOADER',
  manufacturer_string: 'STMicroelectronics',
  serial: null,
  sysfs_path: '/sys/bus/usb/devices/3-7',
  bcd_device: null,
}

const NOT_PRESENT_STATUS = {
  firmware_kind: 'not_present' as const,
  is_present: false,
  supports_discovery_wizard: false,
  supports_canonical_config_push: false,
  vendor_id: null,
  product_id: null,
  product_string: null,
  manufacturer_string: null,
  serial: null,
  sysfs_path: null,
  bcd_device: null,
}

beforeEach(() => {
  mockGetStatus.mockReset()
  mockGetOverride.mockReset()
  mockDeleteOverride.mockReset()
  mockGetBundledFirmware.mockReset()
})

describe('MeloAudioCommanderConfigurator — status card', () => {
  test('renders stock firmware path with discovery wizard available', async () => {
    mockGetStatus.mockResolvedValue(STOCK_STATUS)
    renderPage()
    expect(
      await screen.findByText(/MeloAudio MIDI Commander Configurator/i),
    ).toBeInTheDocument()
    expect(await screen.findByTestId('firmware-kind-tag')).toHaveTextContent(
      /Stock firmware/i,
    )
    expect(
      await screen.findByText(/Factory MeloAudio firmware/i),
    ).toBeInTheDocument()
    // USB descriptors visible — confirm vendor/product as hex.
    expect(screen.getByText(/0x2EEE \/ 0x0301/)).toBeInTheDocument()
    expect(screen.getByText('TSMIDI2.0')).toBeInTheDocument()
    expect(screen.getByText('000000000000011')).toBeInTheDocument()
    // Capability flags present.
    const availableCells = screen.getAllByText('Available')
    expect(availableCells.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(1)
  })

  test('renders custom firmware path with canonical SysEx push available', async () => {
    mockGetStatus.mockResolvedValue(CUSTOM_STATUS)
    renderPage()
    expect(await screen.findByTestId('firmware-kind-tag')).toHaveTextContent(
      /Custom firmware/i,
    )
    expect(
      await screen.findByText(/MAP2 canonical config/i),
    ).toBeInTheDocument()
    expect(screen.getByText('harvie256')).toBeInTheDocument()
    // Both capabilities are 'Available' in the custom path.
    expect(screen.getAllByText('Available').length).toBe(2)
  })

  test('renders DFU bootloader path with both capabilities unavailable', async () => {
    mockGetStatus.mockResolvedValue(DFU_STATUS)
    renderPage()
    expect(await screen.findByTestId('firmware-kind-tag')).toHaveTextContent(
      /DFU bootloader/i,
    )
    expect(
      await screen.findByText(/STM32 DFU bootloader/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/0x0483 \/ 0xDF11/)).toBeInTheDocument()
    // Both capabilities are 'Not available' in DFU mode.
    expect(screen.getAllByText('Not available').length).toBe(2)
  })

  test('renders not_present path with helpful copy and no descriptors', async () => {
    mockGetStatus.mockResolvedValue(NOT_PRESENT_STATUS)
    renderPage()
    expect(await screen.findByTestId('firmware-kind-tag')).toHaveTextContent(
      /Not present/i,
    )
    expect(
      await screen.findByText(/No MIDI Commander or DFU bootloader/i),
    ).toBeInTheDocument()
    // All descriptor cells should render the em-dash placeholder.
    const emDashes = screen.getAllByText('—')
    expect(emDashes.length).toBeGreaterThanOrEqual(4)
  })

  test('renders error notification when /status endpoint errors', async () => {
    mockGetStatus.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(
      await screen.findByText(/Could not detect Commander status/i),
    ).toBeInTheDocument()
  })

  test('shows InlineLoading while the first status fetch is pending', async () => {
    let resolveFn: (v: typeof STOCK_STATUS) => void = () => {}
    mockGetStatus.mockReturnValue(
      new Promise<typeof STOCK_STATUS>((resolve) => {
        resolveFn = resolve
      }),
    )
    renderPage()
    expect(
      await screen.findByText(/Detecting connected Commander/i),
    ).toBeInTheDocument()
    resolveFn(STOCK_STATUS)
    await waitFor(() => {
      expect(screen.queryByText(/Detecting connected Commander/i)).toBeNull()
    })
  })
})
