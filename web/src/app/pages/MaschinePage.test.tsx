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
    getTransportConfig: jest.fn(),
    updateTransportConfig: jest.fn(),
  },
}))

const { maschineApi } = jest.requireMock('../../map2/clients/maschine') as {
  maschineApi: {
    getStatus: jest.Mock
    getEncoderMap: jest.Mock
    renderLcd: jest.Mock
    getTransportConfig: jest.Mock
    updateTransportConfig: jest.Mock
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
        daemon_version: '0.1.0',
        websocket_connected: true,
        virtual_port_name: 'MAP2:Maschine-MK1',
        hid_device: { vendor_id: '17cc', product_id: '0808' },
        transport: {
          transport_id: 'hidapi',
          preference: 'auto',
          connected: true,
          candidates: [{ transport_id: 'hidapi', module_available: true, connectable: true }],
        },
        transport_candidates: [{ transport_id: 'hidapi', module_available: true, connectable: true }],
        firmware_info: { version: '1.8' },
        capabilities: { protocol_version: 'open-maschine' },
        last_seen_at: '2026-04-01T13:00:00Z',
        registered_at: '2026-04-01T12:55:00Z',
        heartbeat_at: '2026-04-01T13:00:00Z',
        last_event_type: 'lcd',
        lcd: {
          left: { width: 128, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
          right: { width: 128, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
        },
        led_state: {
          pads: Array.from({ length: 16 }, (_, index) => ({
            index,
            state: index === 0 ? 'on' : 'off',
            color: index === 0 ? 'green' : 'empty',
            selected: index === 0,
          })),
          updated_at: '2026-04-01T13:00:00Z',
        },
        audio_grid: {
          blocks: [],
          selected_block_id: null,
          page_index: 0,
          updated_at: '2026-04-01T13:00:00Z',
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
        left: { width: 128, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
        right: { width: 128, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
      },
      lcd: {
        left: { width: 128, height: 64, format: 'xbm', data: 'AA', source: 'render:audio_grid' },
        right: { width: 128, height: 64, format: 'xbm', data: '55', source: 'render:audio_grid' },
      },
    })

    maschineApi.getTransportConfig.mockResolvedValue({
      status: 'ok',
      config: {
        transport_preference: 'auto',
        allow_kernel_detach: false,
        applies_on: 'next-reconnect-or-daemon-start',
      },
    })

    maschineApi.updateTransportConfig.mockResolvedValue({
      status: 'ok',
      config: {
        transport_preference: 'auto',
        allow_kernel_detach: false,
        applies_on: 'next-reconnect-or-daemon-start',
      },
    })
  })

  it('renders all Maschine panels including transport policy and shows a connected status tag', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Maschine MK1' })).toBeTruthy()
    expect(await screen.findByText('Connected')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connection' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Transport Policy' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Encoder Map' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LED Preview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LCD Simulator' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'HID Traffic' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Firmware Info' })).toBeTruthy()
    expect(screen.getAllByText('MAP2:Maschine-MK1').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('maschine-transport-panel')).getAllByText('hidapi').length).toBeGreaterThan(0)
    expect(screen.getByText('Mix')).toBeTruthy()
  })
})
