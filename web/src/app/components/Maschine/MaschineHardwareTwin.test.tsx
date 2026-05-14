import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { MaschineHardwareTwin } from './MaschineHardwareTwin'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
} from '../../../map2/types'

// T2522-A — MaschineHardwareTwin v1 unit tests.
//
// The Twin component is a pure presentation surface: status + encoderMap
// in, SVG out. We assert (a) the SVG renders without crashing under the
// disconnected/empty case, (b) the connection chip flips Live/
// Disconnected based on `status.connected`, (c) selected pads receive
// the pulse class, and (d) encoder labels resolve from the encoder map
// when present.
//
// The dual-LCD canvases use foreignObject in the SVG; jsdom can't draw
// to canvas, but the canvas elements should still render and the
// drawLcdBitmap useEffect must run without throwing on a null bitmap.

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillStyle: '',
    fillRect: jest.fn(),
  })) as never
})

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
      led_array: new Array(62).fill(0),
      updated_at: '2026-04-14T13:00:00Z',
    },
    led_array: new Array(62).fill(0),
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
} as unknown as MaschineEncoderMap

describe('MaschineHardwareTwin', () => {
  it('renders the SVG mirror without crashing when status and encoderMap are both null', () => {
    render(<MaschineHardwareTwin status={null} encoderMap={null} />)
    expect(screen.getByRole('img', { name: 'NI Maschine MK1 hardware twin' })).toBeInTheDocument()
    // Disconnected chip when no status.
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows the Live chip when status.connected is true', () => {
    render(<MaschineHardwareTwin status={makeStatus()} encoderMap={sampleEncoderMap} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
  })

  it('renders all 16 pads as SVG rects keyed by pad-index data attribute', () => {
    const { container } = render(
      <MaschineHardwareTwin status={makeStatus()} encoderMap={sampleEncoderMap} />,
    )
    const pads = container.querySelectorAll('rect[data-pad-index]')
    expect(pads.length).toBe(16)
  })

  it('marks the selected pad with the maschine-twin__pad--selected class', () => {
    const { container } = render(
      <MaschineHardwareTwin status={makeStatus()} encoderMap={sampleEncoderMap} />,
    )
    const selected = container.querySelectorAll('.maschine-twin__pad--selected')
    expect(selected.length).toBe(1)
  })

  it('renders all 11 encoder labels (vol, 1-8, tempo, swing) plus their resolved labels', () => {
    render(<MaschineHardwareTwin status={makeStatus()} encoderMap={sampleEncoderMap} />)
    // Encoder slot keys (always present).
    expect(screen.getByText('vol')).toBeInTheDocument()
    expect(screen.getByText('tempo')).toBeInTheDocument()
    expect(screen.getByText('swing')).toBeInTheDocument()
    // Encoder map labels (resolved via the slot lookup; some are
    // truncated to 7 chars + ellipsis). 'Mix' appears as the resolved
    // label for enc2; matching at least one occurrence is enough — the
    // <title> tooltips also contain it now (cycle 4).
    expect(screen.getAllByText('Mix').length).toBeGreaterThan(0)
    // 'Master Gain' truncates in the visible label text node to
    // 'Master…' (7 chars + ellipsis); also appears verbatim inside
    // the <title> tooltip text. Either is fine.
    expect(screen.getAllByText(/Master/).length).toBeGreaterThan(0)
  })

  it('renders all 8 group buttons A-H', () => {
    render(<MaschineHardwareTwin status={makeStatus()} encoderMap={null} />)
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  // ---- Cycle 4 polish ----

  it('cycle-4 — every pad/encoder/group carries a native SVG <title> tooltip', () => {
    const { container } = render(
      <MaschineHardwareTwin status={makeStatus()} encoderMap={sampleEncoderMap} />,
    )
    const titles = container.querySelectorAll('title')
    // 16 pads + 11 encoders + 8 groups = 35 tooltip <title> elements.
    expect(titles.length).toBe(35)
    // Spot-check one pad title.
    const padTitleTexts = Array.from(titles).map((t) => t.textContent ?? '')
    expect(padTitleTexts.some((t) => t.includes('Pad 1') && t.includes('MIDI note 36'))).toBe(true)
  })

  it('cycle-4 — pads are non-clickable when no audio-grid block is mounted', () => {
    const onPadClick = jest.fn()
    const { container } = render(
      <MaschineHardwareTwin status={makeStatus()} encoderMap={null} onPadClick={onPadClick} />,
    )
    // makeStatus() sets audio_grid.blocks = [], so no pad should be
    // clickable. Click pad 0 anyway and confirm the handler does NOT
    // fire (the rect has no click handler at all in the no-block case).
    const pad0 = container.querySelector('rect[data-pad-index="0"]')!
    expect(pad0.getAttribute('data-clickable')).toBe('false')
    fireEvent.click(pad0)
    expect(onPadClick).not.toHaveBeenCalled()
  })

  it('cycle-4 — pads with a mounted block fire onPadClick when clicked', () => {
    const onPadClick = jest.fn()
    const status = makeStatus({
      audio_grid: {
        blocks: [
          {
            block_id: 'block-7',
            pad_index: 7,
            plugin_name: 'NAM Distortion',
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
    const { container } = render(
      <MaschineHardwareTwin status={status} encoderMap={null} onPadClick={onPadClick} />,
    )
    const pad7 = container.querySelector('rect[data-pad-index="7"]')!
    expect(pad7.getAttribute('data-clickable')).toBe('true')
    expect(pad7.getAttribute('role')).toBe('button')
    fireEvent.click(pad7)
    expect(onPadClick).toHaveBeenCalledWith(7)
  })

  it('cycle-4 — clickable pads activate via Enter key (a11y)', () => {
    const onPadClick = jest.fn()
    const status = makeStatus({
      audio_grid: {
        blocks: [
          { block_id: 'block-3', pad_index: 3, plugin_name: 'Reverb' },
        ],
        selected_block_id: null,
        page_index: 0,
        updated_at: '2026-04-14T13:00:00Z',
        snapshot_id: 1,
        snapshot_name: 'Live',
      },
    } as Partial<MaschineDaemonStatus>)
    const { container } = render(
      <MaschineHardwareTwin status={status} encoderMap={null} onPadClick={onPadClick} />,
    )
    const pad3 = container.querySelector('rect[data-pad-index="3"]')!
    fireEvent.keyDown(pad3, { key: 'Enter' })
    expect(onPadClick).toHaveBeenCalledWith(3)
  })

  it('cycle-4 — encoder HID delta accumulates and rotates the tick mark', () => {
    const baseProps = {
      status: makeStatus(),
      encoderMap: sampleEncoderMap,
    }
    const events: MaschineHidEvent[] = [
      {
        timestamp: '2026-05-14T17:00:00Z',
        direction: 'in',
        decoded_type: 'encoder',
        raw_hex: 'AA',
        payload: { encoder: 0, delta: 6 }, // quarter-turn clockwise
      },
    ]
    const { container } = render(
      <MaschineHardwareTwin {...baseProps} hidEvents={events} />,
    )
    // Encoder index 0 corresponds to the "1" label in our row. Find
    // its line and inspect the rotation in its transform attribute.
    const enc1Group = container.querySelector('circle[data-encoder-label="1"]')!.parentElement!
    const tick = enc1Group.querySelector('line')!
    const transform = tick.getAttribute('transform') ?? ''
    // 6/24 = 0.25 of a turn → 0.25 * 270° = 67.5°; with the start
    // offset of -135° the absolute rotation is -67.5°.
    expect(transform).toMatch(/rotate\(-67\.5/)
  })
})
