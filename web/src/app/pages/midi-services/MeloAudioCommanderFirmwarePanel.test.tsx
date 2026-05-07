/**
 * T2459-H3-CFG Phase 5 slice 4 — Custom Firmware install flow tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockGetBundledFirmware = jest.fn()

jest.mock('../../../map2/clients/meloaudioCommander', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(),
    getOverride: jest.fn(),
    deleteOverride: jest.fn(),
    getBundledFirmware: (...args: unknown[]) => mockGetBundledFirmware(...args),
  },
}))

import { MeloAudioCommanderFirmwarePanel } from './MeloAudioCommanderFirmwarePanel'
import type { CommanderFirmwareKind } from '../../../map2/clients/meloaudioCommander'

function renderPanel(
  firmwareKind: CommanderFirmwareKind = 'stock',
  isPresent = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MeloAudioCommanderFirmwarePanel
        firmwareKind={firmwareKind}
        isPresent={isPresent}
      />
    </QueryClientProvider>,
  )
}

const EMPTY_BUNDLE = {
  has_bundled_firmware: false,
  firmwares: [],
  bundle_dir: '/home/mm/map2-audio/device-packs/meloaudio/firmware',
}

const POPULATED_BUNDLE = {
  has_bundled_firmware: true,
  firmwares: [
    {
      name: 'harvie256-v1.0.dfu',
      path: '/home/mm/map2-audio/device-packs/meloaudio/firmware/harvie256-v1.0.dfu',
      size_bytes: 1234,
    },
    {
      name: 'harvie256-v2.0.dfu',
      path: '/home/mm/map2-audio/device-packs/meloaudio/firmware/harvie256-v2.0.dfu',
      size_bytes: 65536,
    },
  ],
  bundle_dir: '/home/mm/map2-audio/device-packs/meloaudio/firmware',
}

beforeEach(() => {
  mockGetBundledFirmware.mockReset()
})

describe('MeloAudioCommanderFirmwarePanel', () => {
  test('renders empty bundle hint when no .dfu files are present', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('stock')
    expect(
      await screen.findByText(/Custom firmware \(harvie256\)/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/No bundled firmware in this MAP2 install/i),
    ).toBeInTheDocument()
    expect(screen.getByTestId('firmware-panel-tag')).toHaveTextContent(
      'Stock firmware',
    )
  })

  test('renders firmware list when bundled binaries exist', async () => {
    mockGetBundledFirmware.mockResolvedValue(POPULATED_BUNDLE)
    renderPanel('stock')
    expect(await screen.findByText('harvie256-v1.0.dfu')).toBeInTheDocument()
    expect(screen.getByText('harvie256-v2.0.dfu')).toBeInTheDocument()
    // 1234 B → "1.2 KiB"
    expect(screen.getByText('1.2 KiB')).toBeInTheDocument()
    // 65536 B → "64.0 KiB"
    expect(screen.getByText('64.0 KiB')).toBeInTheDocument()
  })

  test('shows custom-firmware-active tag when firmwareKind=custom', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('custom')
    expect(await screen.findByTestId('firmware-panel-tag')).toHaveTextContent(
      'Custom firmware active',
    )
  })

  test('shows DFU-on-bus tag when firmwareKind=dfu_bootloader', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('dfu_bootloader')
    expect(await screen.findByTestId('firmware-panel-tag')).toHaveTextContent(
      'DFU bootloader on bus',
    )
  })

  test('shows no-Commander warning when isPresent=false', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('not_present', false)
    expect(
      await screen.findByText(/No Commander on the bus/i),
    ).toBeInTheDocument()
  })

  test('renders MeloAudio support contact link in restore-to-stock runbook', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('custom')
    const link = await screen.findByRole('link', { name: /meloaudio\.com\/contact/i })
    expect(link).toHaveAttribute('href', 'https://www.meloaudio.com/contact')
    expect(link).toHaveAttribute('target', '_blank')
  })

  test('renders error notification when firmware listing endpoint errors', async () => {
    mockGetBundledFirmware.mockRejectedValue(new Error('boom'))
    renderPanel('stock')
    expect(
      await screen.findByText(/Could not list bundled firmware/i),
    ).toBeInTheDocument()
  })

  test('always shows the slice-4-deferred notice and CLI runbook', async () => {
    mockGetBundledFirmware.mockResolvedValue(EMPTY_BUNDLE)
    renderPanel('stock')
    expect(
      await screen.findByText(/Interactive flash UI ships in a follow-up/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/dfu-util -a 0 -s 0x08000000:leave/i),
    ).toBeInTheDocument()
  })
})
