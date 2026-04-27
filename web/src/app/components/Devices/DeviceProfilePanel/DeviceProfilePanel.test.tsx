// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceProfilePanel Jest coverage — T2459-C1 acceptance gate.

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DeviceProfilePanel } from './DeviceProfilePanel'

// Mock the API client so the test runs without a backend.
const mockGetDeviceProfile = jest.fn()
jest.mock('../../../../map2/clients/devices', () => ({
  getDeviceProfile: (...args) => mockGetDeviceProfile(...args),
}))

function withClient(node: React.ReactElement): React.ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

const UA1000_AUDIO_PROFILE = {
  pack_id: 'edirol-ua',
  model: 'ua-1000',
  kind: 'audio' as const,
  path: '/repo/device-packs/edirol-ua/profiles/ua-1000.audio.yaml',
  hardware_id: 'usb:0582:00ed',
  alsa_card_regex: '^UA1000\\b',
  document: {
    schema_version: 1,
    identity: {
      manufacturer: 'Edirol (Roland)',
      model: 'UA-1000',
      family: 'Edirol UA series',
      hardware_id: 'usb:0582:00ed',
    },
    ports: [
      { id: 'aux0', kind: 'analog', direction: 'bidirectional', count: 1, connectors: ['trs_quarter_inch'] },
      { id: 'spdif_in', kind: 'digital', direction: 'input', count: 2, connectors: ['spdif_coax'] },
    ],
    mixer_surfaces: [
      { id: 'front_panel_monitor', kind: 'hardware', description: 'Front-panel hardware mixer.' },
    ],
    on_device_dsp: [],
    use_case_presets: [
      { id: 'studio_recording_8ch', name: '8-channel studio recording', description: 'Identity routing.' },
    ],
    metadata: {
      product_image_urls: ['https://example.com/ua-1000.jpg'],
      datasheet_url: 'https://example.com/ua-1000.pdf',
      manual_url: 'https://example.com/ua-1000-manual',
      vendor_support_url: 'https://example.com/support',
    },
  },
}

const UA1000_MIDI_PROFILE = {
  pack_id: 'edirol-ua',
  model: 'ua-1000',
  kind: 'midi' as const,
  path: '/repo/device-packs/edirol-ua/profiles/ua-1000.midi.yaml',
  hardware_id: 'alsa-seq:UA-1000 MIDI:0',
  alsa_client_pattern: 'UA-1000 MIDI',
  document: {
    schema_version: 1,
    identity: {
      manufacturer: 'Edirol (Roland)',
      model: 'ua-1000',
      alsa_client_pattern: 'UA-1000 MIDI',
    },
    controls: [
      {
        status: 0xB0,
        midino: 64,
        target: 'audio.chain.1.bypass',
        action: 'toggle',
        fast_path: true,
      },
      {
        status: 0xB0,
        midino: 7,
        script: 'UA1000Mapping.masterVolume',
      },
    ],
  },
}

beforeEach(() => {
  mockGetDeviceProfile.mockReset()
})

describe('DeviceProfilePanel — T2459-C1', () => {
  function setupHappyPath(): void {
    mockGetDeviceProfile.mockImplementation((_packId, _model, kind) => {
      if (kind === 'audio') return Promise.resolve({ profile: UA1000_AUDIO_PROFILE })
      if (kind === 'midi') return Promise.resolve({ profile: UA1000_MIDI_PROFILE })
      return Promise.resolve({ profile: null })
    })
  }

  it('shows a loading state while the profile is being fetched', () => {
    let resolveAudio: (value: unknown) => void = () => {}
    mockGetDeviceProfile.mockImplementation(
      () => new Promise((resolve) => {
        resolveAudio = resolve
      }),
    )
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    expect(screen.getByTestId('device-profile-panel-loading')).toBeInTheDocument()
    resolveAudio({ profile: UA1000_AUDIO_PROFILE })
  })

  it('renders the hero card with manufacturer and hardware id', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByTestId('device-hero-card')).toBeInTheDocument()
    })
    expect(screen.getByText(/Edirol \(Roland\)/)).toBeInTheDocument()
    expect(screen.getByText(/usb:0582:00ed/)).toBeInTheDocument()
  })

  it('renders datasheet, manual, and manufacturer support buttons when metadata provides URLs', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByText('Datasheet')).toBeInTheDocument()
    })
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Manufacturer support')).toBeInTheDocument()
  })

  it('lists ports from the profile', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByTestId('device-ports-section')).toBeInTheDocument()
    })
    expect(screen.getByText('aux0')).toBeInTheDocument()
    expect(screen.getByText('spdif_in')).toBeInTheDocument()
  })

  it('shows mixer surface entries with descriptions', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByTestId('device-mixer-surfaces-section')).toBeInTheDocument()
    })
    expect(screen.getByText(/Front-panel hardware mixer/)).toBeInTheDocument()
  })

  it('shows use-case presets as Carbon buttons', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByTestId('device-use-cases-section')).toBeInTheDocument()
    })
    expect(screen.getByText('8-channel studio recording')).toBeInTheDocument()
  })

  it('renders MIDI bindings when the MIDI profile loads', async () => {
    setupHappyPath()
    render(withClient(<DeviceProfilePanel packId="edirol-ua" model="ua-1000" />))
    await waitFor(() => {
      expect(screen.getByTestId('device-midi-bindings-section')).toBeInTheDocument()
    })
    // Both control rows surface — the fast-path one and the JS one.
    expect(screen.getByText('audio.chain.1.bypass')).toBeInTheDocument()
    expect(screen.getByText('UA1000Mapping.masterVolume')).toBeInTheDocument()
    expect(screen.getByText('fast-path')).toBeInTheDocument()
    expect(screen.getByText('JS')).toBeInTheDocument()
  })

  it('renders an error notification when the audio profile is missing', async () => {
    mockGetDeviceProfile.mockImplementation((_packId, _model, kind) => {
      if (kind === 'audio') return Promise.resolve({ profile: undefined })
      return Promise.resolve({ profile: undefined })
    })
    render(withClient(<DeviceProfilePanel packId="missing" model="zzz" />))
    await waitFor(() => {
      expect(screen.getByText('Profile not found')).toBeInTheDocument()
    })
  })

  it('renders a vendor-override slot when provided (T2459-C2 contract)', async () => {
    setupHappyPath()
    render(
      withClient(
        <DeviceProfilePanel
          packId="edirol-ua"
          model="ua-1000"
          vendorOverride={<div data-testid="r-bus-router">R-BUS Router</div>}
        />,
      ),
    )
    await waitFor(() => {
      expect(screen.getByTestId('device-profile-panel-vendor-override')).toBeInTheDocument()
    })
    expect(screen.getByTestId('r-bus-router')).toBeInTheDocument()
  })
})
