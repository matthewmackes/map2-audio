import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { MaschinePage } from './MaschinePage'

jest.mock('../layout/useSetShellWindow', () => ({
  useSetShellWindow: jest.fn(),
}))

// Stub the State Authority API client — the Quad Morph zone in the
// Performance tab pulls it in transitively via MorphPad. Real morph
// behavior is covered by stateAuthority/MorphPad's own tests.
jest.mock('../../map2/clients/stateAuthority', () => ({
  __esModule: true,
  stateAuthorityApi: {
    getMorphState: jest.fn(async () => ({ x: 0.5, y: 0.5, configured_corners: [] })),
    setMorphPosition: jest.fn(async (x: number, y: number) => ({
      x,
      y,
      configured_corners: [],
    })),
    getReconciliationMetrics: jest.fn(async () => ({
      metrics: {
        local_runs_total: 0,
        local_drift_detected_total: 0,
        local_corrections_applied_total: 0,
        local_reactivations_required_total: 0,
        cluster_runs_total: 0,
        cluster_nodes_with_drift_total: 0,
        last_local_reconcile_unix_s: 0,
        last_cluster_reconcile_unix_s: 0,
        last_local_status: 'IDLE',
        last_cluster_status: 'IDLE',
        last_local_error: null,
        last_cluster_error: null,
      },
      prometheus: '',
    })),
  },
}))

function getShellWindowPatches(): Array<{ title?: string; subtitle?: string; actions?: Array<{ id: string }> }> {
  const mocked = jest.requireMock('../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
  return mocked.useSetShellWindow.mock.calls.map((call) => call[0])
}

jest.mock('../../map2/clients/maschine', () => ({
  maschineApi: {
    getStatus: jest.fn(),
    getEncoderMap: jest.fn(),
    updateEncoderMap: jest.fn(),
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
    getPressureCurves: jest.fn(),
    updatePressureCurves: jest.fn(),
    getPerformancePatterns: jest.fn(),
    updatePerformancePatterns: jest.fn(),
    getLedChoreography: jest.fn(),
    updateLedChoreography: jest.fn(),
  },
}))

const { maschineApi } = jest.requireMock('../../map2/clients/maschine') as {
  maschineApi: {
    getStatus: jest.Mock
    getEncoderMap: jest.Mock
    updateEncoderMap: jest.Mock
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
    getPressureCurves: jest.Mock
    updatePressureCurves: jest.Mock
    getPerformancePatterns: jest.Mock
    updatePerformancePatterns: jest.Mock
    getLedChoreography: jest.Mock
    updateLedChoreography: jest.Mock
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

function renderPage(initialEntries: string[] = ['/maschine?tab=diagnostics']) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        initialEntries={initialEntries}
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
    // T2522-E cycle 15 — clear the useSetShellWindow mock between
    // tests so action-list assertions only reflect the test's own
    // renders, not state carried over from prior cases.
    const mocked = jest.requireMock('../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
    mocked.useSetShellWindow.mockClear()

    ;(globalThis as typeof globalThis & { WebSocket?: typeof WebSocketMock }).WebSocket = WebSocketMock as never
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      fillStyle: '',
      strokeStyle: '',
      globalAlpha: 1,
      font: '',
      textBaseline: '',
      textAlign: '',
      fillRect: jest.fn(),
      fillText: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
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
    maschineApi.getPressureCurves.mockResolvedValue({
      status: 'ok',
      usb_serial: 'default-mk1',
      pressure_curves: {
        global_compensation: 0,
        per_pad: Array.from({ length: 16 }, () => ({ polynomial: [0, 1] })),
      },
    })
    maschineApi.updatePressureCurves.mockImplementation(async (curves: unknown) => ({
      status: 'ok',
      usb_serial: 'default-mk1',
      pressure_curves: curves,
    }))
    maschineApi.getPerformancePatterns.mockResolvedValue({
      status: 'ok',
      usb_serial: 'default-mk1',
      performance_patterns: { active_pattern_id: null, patterns: [] },
    })
    maschineApi.updatePerformancePatterns.mockImplementation(async (bank: unknown) => ({
      status: 'ok',
      usb_serial: 'default-mk1',
      performance_patterns: bank,
    }))
    maschineApi.updateEncoderMap.mockImplementation(async (encoder_map: unknown) => ({
      status: 'ok',
      encoder_map,
    }))
    maschineApi.getLedChoreography.mockResolvedValue({
      status: 'ok',
      usb_serial: 'default-mk1',
      led_choreography: {
        per_pad: Array.from({ length: 16 }, () => ({ idle_color: 'empty', press_color: 'white' })),
      },
    })
    maschineApi.updateLedChoreography.mockImplementation(async (cho: unknown) => ({
      status: 'ok',
      usb_serial: 'default-mk1',
      led_choreography: cho,
    }))
  })

  it('renders all Maschine panels with cabl protocol info and shows connected status', async () => {
    renderPage()

    // Wait for the async status query to resolve before synchronous assertions.
    const portMatches = await screen.findAllByText('MAP2:Maschine-MK1')
    expect(portMatches.length).toBeGreaterThan(0)
    const patches = getShellWindowPatches()
    expect(patches.some((p) => p.title === 'Maschine MK1')).toBe(true)
    const hasStatusAction = patches.some((p) =>
      (p.actions ?? []).some((a: { id: string }) => a.id === 'status'),
    )
    expect(hasStatusAction).toBe(true)
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
    // Carbon's TabPanels keeps every panel mounted, so the "Mix"
    // encoder label appears twice (Diagnostics' EncoderMap panel and
    // the Twin's encoder ring labels). Match either via getAllByText.
    expect(screen.getAllByText('Mix').length).toBeGreaterThan(0)
    expect(screen.getByText('62 slots')).toBeTruthy()
  })

  it('T2522 — renders the five extended-GUI tabs in the shell', () => {
    renderPage(['/maschine'])
    expect(screen.getByRole('tab', { name: 'Hardware Twin' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Profile Workbench' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Mapping Studio' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Diagnostics' })).toBeInTheDocument()
  })

  it('T2522 — defaults to the Hardware Twin tab when no ?tab param is set', () => {
    renderPage(['/maschine'])
    const twinTab = screen.getByRole('tab', { name: 'Hardware Twin' })
    expect(twinTab.getAttribute('aria-selected')).toBe('true')
    // Cycle 3 wired the real Twin SVG mirror; the placeholder copy is
    // gone. Anchor on the canonical aria-label of the twin SVG.
    expect(screen.getByRole('img', { name: 'NI Maschine MK1 hardware twin' })).toBeInTheDocument()
  })

  it('T2522 — ?tab=workbench deep-link selects the Profile Workbench tab', () => {
    renderPage(['/maschine?tab=workbench'])
    const workbenchTab = screen.getByRole('tab', { name: 'Profile Workbench' })
    expect(workbenchTab.getAttribute('aria-selected')).toBe('true')
    // Cycle 12 wired the real workbench; the placeholder copy is gone.
    expect(screen.getByRole('heading', { name: 'Profile Workbench' })).toBeInTheDocument()
    expect(screen.getByText('8 starter profiles')).toBeInTheDocument()
  })

  it('T2522 — ?tab=performance deep-link selects the Performance tab', async () => {
    renderPage(['/maschine?tab=performance'])
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('aria-selected')).toBe('true')
    // Cycle 5 wired the real Performance shell; cycle 7 swapped the
    // legacy "Scenes" placeholder for the step sequencer + scene
    // strip. Anchor on the Performance heading and the seq title
    // (which renders inside the Performance tab body).
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(await screen.findByText('Step sequencer + scenes')).toBeInTheDocument()
  })

  it('T2522 — ?tab=mapping deep-link selects the Mapping Studio tab', async () => {
    renderPage(['/maschine?tab=mapping'])
    expect(screen.getByRole('tab', { name: 'Mapping Studio' }).getAttribute('aria-selected')).toBe('true')
    // Cycle 9 wired the real Mapping Studio scaffold; the placeholder
    // copy is gone. Anchor on the canonical heading + sources pane.
    expect(screen.getByRole('heading', { name: 'Mapping Studio' })).toBeInTheDocument()
    expect(await screen.findByText('Parameter sources')).toBeInTheDocument()
  })

  it('T2522 — ?tab=<unknown> falls back to the default Hardware Twin tab', () => {
    renderPage(['/maschine?tab=bogus'])
    expect(screen.getByRole('tab', { name: 'Hardware Twin' }).getAttribute('aria-selected')).toBe('true')
  })

  it('T2522-A cycle 3 — Hardware Twin tab renders the live SVG mirror, not the placeholder', () => {
    renderPage(['/maschine'])
    expect(screen.getByRole('img', { name: 'NI Maschine MK1 hardware twin' })).toBeInTheDocument()
    expect(screen.queryByText(/Photoreal SVG mirror of the MK1/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hardware Twin' })).toBeInTheDocument()
  })

  it('T2522-E cycle 15 — AppShell Hardware Layout action is hidden outside the Diagnostics tab', () => {
    renderPage(['/maschine'])
    const patches = getShellWindowPatches()
    // On the default Twin tab, no patch should ever include the
    // Hardware Layout action (the toggle hides it for non-diagnostics).
    const everIncluded = patches.some((p) =>
      (p.actions ?? []).some((a: { id: string }) => a.id === 'hardware-layout'),
    )
    expect(everIncluded).toBe(false)
    const hasStatus = patches.some((p) =>
      (p.actions ?? []).some((a: { id: string }) => a.id === 'status'),
    )
    expect(hasStatus).toBe(true)
  })

  it('T2522-E cycle 15 — AppShell Hardware Layout action is present on the Diagnostics tab', () => {
    renderPage(['/maschine?tab=diagnostics'])
    const patches = getShellWindowPatches()
    const hasHardwareLayout = patches.some((p) =>
      (p.actions ?? []).some((a: { id: string }) => a.id === 'hardware-layout'),
    )
    expect(hasHardwareLayout).toBe(true)
  })
})
