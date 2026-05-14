import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { MaschineHardwareTwin } from './MaschineHardwareTwin'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
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
    // truncated to 7 chars + ellipsis).
    expect(screen.getByText('Mix')).toBeInTheDocument()
    expect(screen.getByText(/Master/)).toBeInTheDocument()
  })

  it('renders all 8 group buttons A-H', () => {
    render(<MaschineHardwareTwin status={makeStatus()} encoderMap={null} />)
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
