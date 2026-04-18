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
    getMidiMap: jest.fn(),
    updateMidiMap: jest.fn(),
    resetMidiMap: jest.fn(),
    testMidiElement: jest.fn(),
    setLed: jest.fn(),
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
    getMidiMap: jest.Mock
    updateMidiMap: jest.Mock
    resetMidiMap: jest.Mock
    testMidiElement: jest.Mock
    setLed: jest.Mock
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

    const midiMapResponse = {
      status: 'ok',
      midi_map: {
        channel: 1,
        pads: Array.from({ length: 16 }, (_, index) => ({
          note: 36 + index,
          message_type: 'note',
          velocity_curve: 'linear',
          label: `PAD ${index + 1}`,
        })),
        buttons: {
          '0': { number: 0, message_type: 'cc', label: 'MUTE' },
          '1': { number: 1, message_type: 'cc', label: 'SOLO' },
          '2': { number: 2, message_type: 'cc', label: 'SELECT' },
          '3': { number: 3, message_type: 'cc', label: 'DUPLICATE' },
          '4': { number: 4, message_type: 'cc', label: 'NAV' },
          '5': { number: 5, message_type: 'cc', label: 'KEYBOARD' },
          '6': { number: 6, message_type: 'cc', label: 'PATTERN' },
          '7': { number: 7, message_type: 'cc', label: 'SCENE' },
          '9': { number: 9, message_type: 'cc', label: 'REC' },
          '10': { number: 10, message_type: 'cc', label: 'ERASE' },
          '11': { number: 11, message_type: 'cc', label: 'SHIFT' },
          '12': { number: 12, message_type: 'cc', label: 'GRID' },
          '13': { number: 13, message_type: 'cc', label: 'RIGHT' },
          '14': { number: 14, message_type: 'cc', label: 'LEFT' },
          '15': { number: 15, message_type: 'cc', label: 'LOOP' },
          '16': { number: 16, message_type: 'cc', label: 'GROUP E' },
          '17': { number: 17, message_type: 'cc', label: 'GROUP F' },
          '18': { number: 18, message_type: 'cc', label: 'GROUP G' },
          '19': { number: 19, message_type: 'cc', label: 'GROUP H' },
          '20': { number: 20, message_type: 'cc', label: 'GROUP D' },
          '21': { number: 21, message_type: 'cc', label: 'GROUP C' },
          '22': { number: 22, message_type: 'cc', label: 'GROUP B' },
          '23': { number: 23, message_type: 'cc', label: 'GROUP A' },
          '24': { number: 24, message_type: 'cc', label: 'CONTROL' },
          '25': { number: 25, message_type: 'cc', label: 'BROWSE' },
          '26': { number: 26, message_type: 'cc', label: 'BROWSE LEFT' },
          '27': { number: 27, message_type: 'cc', label: 'SNAP' },
          '28': { number: 28, message_type: 'cc', label: 'AUTO WRITE' },
          '29': { number: 29, message_type: 'cc', label: 'BROWSE RIGHT' },
          '30': { number: 30, message_type: 'cc', label: 'SAMPLING' },
          '31': { number: 31, message_type: 'cc', label: 'STEP' },
          '32': { number: 32, message_type: 'cc', label: 'D8' },
          '33': { number: 33, message_type: 'cc', label: 'D7' },
          '34': { number: 34, message_type: 'cc', label: 'D6' },
          '35': { number: 35, message_type: 'cc', label: 'D5' },
          '36': { number: 36, message_type: 'cc', label: 'D4' },
          '37': { number: 37, message_type: 'cc', label: 'D3' },
          '38': { number: 38, message_type: 'cc', label: 'D2' },
          '39': { number: 39, message_type: 'cc', label: 'D1' },
          '40': { number: 40, message_type: 'cc', label: 'NOTE REPEAT' },
          '41': { number: 41, message_type: 'cc', label: 'PLAY' },
        },
        encoders: Array.from({ length: 11 }, (_, index) => ({
          cc: index + 1,
          mode: 'relative',
          label: `ENC ${index}`,
        })),
        button_labels: {},
        button_zones: {},
        button_led_slots: {
          '24': 48,
          '25': 46,
          '28': 41,
          '31': 47,
        },
        encoder_labels: Array.from({ length: 11 }, (_, index) => `ENC ${index}`),
        pad_labels: Array.from({ length: 16 }, (_, index) => `PAD ${index + 1}`),
      },
    }

    maschineApi.getMidiMap.mockResolvedValue(midiMapResponse)
    maschineApi.updateMidiMap.mockResolvedValue(midiMapResponse)
    maschineApi.resetMidiMap.mockResolvedValue(midiMapResponse)
    maschineApi.testMidiElement.mockResolvedValue({
      status: 'ok',
      test: 'midi_element_test',
      result: { success: true },
    })
    maschineApi.setLed.mockResolvedValue({
      status: 'ok',
      test: 'led_set',
      result: { success: true },
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
    expect(screen.getByRole('heading', { name: 'Hardware Layout + MIDI Map' })).toBeTruthy()
    expect(screen.getAllByText('MAP2:Maschine-MK1').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('maschine-transport-panel')).getByText('usb-bulk')).toBeTruthy()
    expect(screen.getByText('Mix')).toBeTruthy()
    expect(screen.getByText('62 slots')).toBeTruthy()
  })
})
