import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschinePerformanceTab } from './MaschinePerformanceTab'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
} from '../../../map2/types'

// T2523-C — Performance tab now mounts MaschineLooperSection, which
// polls /api/v1/looper/status via TanStack Query. Stub the client
// so the test doesn't hit the network and so the LooperSection
// query never resolves to ``undefined`` (which TanStack rejects).
jest.mock('../../../map2/clients/looper', () => ({
  __esModule: true,
  looperApi: {
    getStatus: jest.fn(async () => ({
      tracks: [],
      active_track_count: 0,
      sync_master: false,
      master_level_db: 0,
      master_muted: false,
      bpm: null,
      sync_master_track: null,
      recent_activity: [],
      metrics: {},
      preset_names: [],
    })),
    play: jest.fn(),
    stop: jest.fn(),
    record: jest.fn(),
    restart: jest.fn(),
    clear: jest.fn(),
  },
}))

// The Quad Morph zone mounts the State Authority MorphPad which
// hits stateAuthorityApi on render. Stub it out — MorphPad's own
// network behavior is covered by its dedicated test.
jest.mock('../../../map2/clients/stateAuthority', () => ({
  __esModule: true,
  stateAuthorityApi: {
    getMorphState: jest.fn(async () => ({
      x: 0.5,
      y: 0.5,
      configured_corners: [],
    })),
    setMorphPosition: jest.fn(async (x: number, y: number) => ({
      x,
      y,
      configured_corners: [],
    })),
  },
}))

// The curve editor (mounted by Performance) calls maschineApi at
// render. Mock both methods with a stable default so the tests
// here don't need a backend.
jest.mock('../../../map2/clients/maschine', () => {
  const defaults = {
    status: 'ok',
    usb_serial: 'default-mk1',
    pressure_curves: {
      global_compensation: 0,
      per_pad: Array.from({ length: 16 }, () => ({ polynomial: [0, 1] })),
    },
  }
  const patternsDefault = {
    status: 'ok',
    usb_serial: 'default-mk1',
    performance_patterns: { active_pattern_id: null, patterns: [] },
  }
  return {
    __esModule: true,
    maschineApi: {
      getPressureCurves: jest.fn(async () => defaults),
      updatePressureCurves: jest.fn(async () => defaults),
      getPerformancePatterns: jest.fn(async () => patternsDefault),
      updatePerformancePatterns: jest.fn(async () => patternsDefault),
    },
  }
})

function withQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

// T2522-C — Performance tab v1 unit tests.
//
// Cycle 5 ships the shell: header strip, 4×4 pad grid with live
// velocity/pressure derived from HID, scene strip mirroring group
// LEDs, Quad Morph placeholder. We assert (a) all 16 pads render,
// (b) live velocity from HID is surfaced, (c) clickable pads fire
// the callback when a block is mounted, (d) scene cells reflect
// led_array brightness.

function makeStatus(overrides?: Partial<MaschineDaemonStatus>): MaschineDaemonStatus {
  return {
    connected: true,
    status: 'connected',
    daemon_version: '2.0.0',
    protocol_version: 'cabl-mk1-v1',
    websocket_connected: true,
    virtual_port_name: 'MAP2:Maschine-MK1',
    hid_device: { vendor_id: '17cc', product_id: '0808' },
    transport: { transport_id: 'usb-bulk', preference: 'usb-bulk', connected: true },
    transport_candidates: [],
    firmware_info: { version: '1.8' },
    capabilities: { protocol_version: 'cabl-mk1-v1', led_slots: 62, encoders: 11 },
    last_seen_at: '2026-04-14T13:00:00Z',
    registered_at: '2026-04-14T12:55:00Z',
    heartbeat_at: '2026-04-14T13:00:00Z',
    last_event_type: 'lcd',
    lcd: null,
    led_state: {
      pads: Array.from({ length: 16 }, (_, index) => ({
        index,
        state: index === 0 ? 'bright' : 'off',
        color: index === 0 ? 'red' : 'empty',
        selected: index === 0,
      })),
      led_array: new Array(62).fill(0).map((_, i) => (i === 24 ? 200 : 0)), // Group A lit
      updated_at: '2026-04-14T13:00:00Z',
    },
    led_array: new Array(62).fill(0).map((_, i) => (i === 24 ? 200 : 0)),
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
    ...overrides,
  } as MaschineDaemonStatus
}

const sampleEncoderMap: MaschineEncoderMap = {
  enc1: { fixed: true, label: 'Macro 1' },
  vol: { fixed: true, label: 'Master Gain' },
  tempo: { fixed: true, label: '120 BPM' },
  swing: { label: 'Swing' },
} as unknown as MaschineEncoderMap

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-05-14T17:00:00.000Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('MaschinePerformanceTab', () => {
  it('renders all 16 pads with their MIDI note labels', () => {
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={[]} />,
      ),
    )
    // Pads label as N36..N51 (MIDI notes 36-51).
    for (let n = 36; n <= 51; n += 1) {
      expect(screen.getByText(`N${n}`)).toBeInTheDocument()
    }
  })

  it('renders the kit name and BPM-ish label in the header', () => {
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={sampleEncoderMap} hidEvents={[]} />,
      ),
    )
    expect(screen.getByText(/Live Snapshot/)).toBeInTheDocument()
    expect(screen.getByText('120 BPM')).toBeInTheDocument()
  })

  it('surfaces live velocity from a recent pad_press HID event', () => {
    const events: MaschineHidEvent[] = [
      {
        timestamp: '2026-05-14T17:00:00.000Z',
        direction: 'in',
        decoded_type: 'pad_press',
        raw_hex: 'AA',
        payload: { pad_index: 4, velocity: 96, pressure: 110, pressed: true },
      },
    ]
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={events} />,
      ),
    )
    expect(screen.getByText('v96')).toBeInTheDocument()
  })

  it('marks pads with a mounted audio-grid block as clickable and fires onPadClick', () => {
    const onPadClick = jest.fn()
    const status = makeStatus({
      audio_grid: {
        blocks: [
          {
            block_id: 'b-9',
            pad_index: 9,
            plugin_name: 'NAM',
            bypassed: false,
          },
        ],
        selected_block_id: null,
        page_index: 0,
        updated_at: '2026-04-14T13:00:00Z',
        snapshot_id: 1,
        snapshot_name: 'Live',
      },
    } as Partial<MaschineDaemonStatus>)
    render(
      withQuery(
        <MaschinePerformanceTab status={status} encoderMap={null} hidEvents={[]} onPadClick={onPadClick} />,
      ),
    )
    const padButton = screen.getByRole('button', {
      name: /Pad 10 \(MIDI note 45\), mapped to NAM/,
    })
    expect(padButton).not.toBeDisabled()
    fireEvent.click(padButton)
    expect(onPadClick).toHaveBeenCalledWith(9)
  })

  it('disables pads that have no mounted block', () => {
    const onPadClick = jest.fn()
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={[]} onPadClick={onPadClick} />,
      ),
    )
    const padButton = screen.getByRole('button', { name: /Pad 1 \(MIDI note 36\)/ })
    expect(padButton).toBeDisabled()
    fireEvent.click(padButton)
    expect(onPadClick).not.toHaveBeenCalled()
  })

  it('cycle-7 — embeds the step sequencer with the new scene strip', async () => {
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={[]} />,
      ),
    )
    // The cycle-7 scene strip is rendered by MaschineStepSequencer; it
    // shows the same 8 letters but as buttons (not just badges) so
    // operators can recall a scene by clicking. No legacy
    // .maschine-perf__scene-cell--lit strip should exist any more.
    expect(await screen.findByText('Step sequencer + scenes')).toBeInTheDocument()
    // 8 scene buttons A-H, all empty by default → all disabled.
    // Wait for the working bank to seed before asserting.
    const sceneButtons = await screen.findAllByRole('button', { name: /Scene [A-H] — empty/ })
    expect(sceneButtons.length).toBe(8)
  })

  it('shows the Disconnected chip when status.connected is false', () => {
    const { rerender } = render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={[]} />,
      ),
    )
    expect(screen.getByText('Live')).toBeInTheDocument()
    rerender(
      withQuery(
        <MaschinePerformanceTab
          status={makeStatus({ connected: false })}
          encoderMap={null}
          hidEvents={[]}
        />,
      ),
    )
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('cycle-8 — Quad Morph zone is a real component (no placeholder)', async () => {
    render(
      withQuery(
        <MaschinePerformanceTab status={makeStatus()} encoderMap={null} hidEvents={[]} />,
      ),
    )
    expect(screen.getByText('Quad Morph')).toBeInTheDocument()
    // No placeholder copy from cycle 5; the morph zone now mounts the
    // real corner legend.
    expect(screen.queryByText('Cycle 8')).not.toBeInTheDocument()
    expect(await screen.findByText(/cycle 11/i)).toBeInTheDocument()
  })
})
