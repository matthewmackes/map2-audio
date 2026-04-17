import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { MaschinePage } from './MaschinePage'

jest.mock('../../map2/clients/maschine', () => ({
  maschineApi: {
    getStatus: jest.fn(),
    getEncoderMap: jest.fn(),
    renderLcd: jest.fn(),
    getAudioGrid: jest.fn(),
    getTransportConfig: jest.fn(),
    updateTransportConfig: jest.fn(),
    runHwTest: jest.fn(),
  },
}))

const { maschineApi } = jest.requireMock('../../map2/clients/maschine') as {
  maschineApi: {
    getStatus: jest.Mock
    getEncoderMap: jest.Mock
    renderLcd: jest.Mock
    getAudioGrid: jest.Mock
    getTransportConfig: jest.Mock
    updateTransportConfig: jest.Mock
    runHwTest: jest.Mock
  }
}

class WebSocketMock {
  onmessage: ((event: { data: string }) => void) | null = null
  close = jest.fn()
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <MaschinePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MaschinePage', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { WebSocket?: typeof WebSocketMock }).WebSocket = WebSocketMock as never
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
    })) as never

    maschineApi.getStatus.mockResolvedValue({
      status: 'ok',
      state: {
        connected: true,
        status: 'connected',
        daemon_version: '2.0.0',
        protocol_version: 'cabl-mk1-v1',
        websocket_connected: true,
        virtual_port_name: 'MAP2:Maschine-MK1',
        hid_device: { vendor_id: '17cc', product_id: '0808' },
        transport: {
          transport_id: 'usb-bulk',
          preference: 'usb-bulk',
          connected: true,
        },
        transport_candidates: [],
        firmware_info: { version: '1.8' },
        capabilities: { protocol_version: 'cabl-mk1-v1', led_slots: 62, encoders: 11 },
        last_seen_at: '2026-04-14T13:00:00Z',
        registered_at: '2026-04-14T12:55:00Z',
        heartbeat_at: '2026-04-14T13:00:00Z',
        last_event_type: 'lcd',
        lcd: {
          left: { width: 255, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
          right: { width: 255, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
        },
        led_state: {
          pads: Array.from({ length: 16 }, (_, index) => ({
            index,
            state: index === 0 ? 'bright' : 'off',
            color: index === 0 ? 'red' : 'empty',
            selected: index === 0,
          })),
          led_array: new Array(62).fill(0).map((_, i) => (i === 0 ? 180 : 0)),
          updated_at: '2026-04-14T13:00:00Z',
        },
        led_array: new Array(62).fill(0).map((_, i) => (i === 0 ? 180 : 0)),
        led_slots: 62,
        encoders: 11,
        audio_grid: {
          blocks: [],
          selected_block_id: null,
          page_index: 0,
          updated_at: '2026-04-14T13:00:00Z',
          snapshot_id: 1,
          snapshot_name: 'Live Snapshot',
        },
      },
    })

    maschineApi.getEncoderMap.mockResolvedValue({
      status: 'ok',
      encoder_map: {
        enc1: { fixed: true, label: 'Macro 1' },
        enc2: { block_id: 'block-2', param_id: 'mix', label: 'Mix' },
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: { fixed: true, label: 'Master Gain' },
        tempo: { fixed: true, label: 'MIDI Clock BPM' },
        swing: { label: 'Swing' },
      },
    })

    maschineApi.renderLcd.mockResolvedValue({
      status: 'ok',
      render: {
        context: 'audio_grid',
        left: { width: 255, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
        right: { width: 255, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
      },
      lcd: {
        left: { width: 255, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
        right: { width: 255, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
      },
    })

    maschineApi.getAudioGrid.mockResolvedValue({
      status: 'ok',
      audio_grid: { blocks: [], selected_block_id: null, page_index: 0 },
    })

    maschineApi.getTransportConfig.mockResolvedValue({
      status: 'ok',
      config: {
        transport_preference: 'usb-bulk',
        allow_kernel_detach: true,
        applies_on: 'next-reconnect-or-daemon-start',
      },
    })

    maschineApi.updateTransportConfig.mockResolvedValue({
      status: 'ok',
      config: {
        transport_preference: 'usb-bulk',
        allow_kernel_detach: true,
        applies_on: 'next-reconnect-or-daemon-start',
      },
    })

    maschineApi.runHwTest.mockResolvedValue({
      status: 'ok',
      test: 'led_walk',
      result: { success: true, message: 'Test passed' },
    })
  })

  it('renders all Maschine panels with cabl protocol info and shows connected status', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Maschine MK1' })).toBeTruthy()
    expect(await screen.findByText('Connected')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connection' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'USB Protocol' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Encoder Map' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LED Preview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LCD Simulator' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Input Monitor' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Firmware Info' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Hardware Test Suite' })).toBeTruthy()
    expect(screen.getAllByText('MAP2:Maschine-MK1').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('maschine-transport-panel')).getByText('usb-bulk')).toBeTruthy()
    expect(screen.getByText('Mix')).toBeTruthy()
    expect(screen.getByText('62 slots')).toBeTruthy()
  })
})
