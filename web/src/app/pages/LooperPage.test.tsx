/**
 * T2512 — LooperPage component tests.
 *
 * Mocks looperApi + global WebSocket so the test runs offline and
 * exercises:
 *   - Initial render shows the WS-status Tag in "Polling" state.
 *   - Tag flips to "Live" after the mocked WS open event.
 *   - Incoming looper_status frames apply to the track grid without
 *     hitting the HTTP path.
 *
 * Carbon components are rendered for real (no shallow rendering) so a
 * future class-name change in Carbon Tag still surfaces here.
 */

import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Stub the WebSocket constructor before importing LooperPage so the page's
// useEffect picks up the stub class instead of jsdom's noop.
// ---------------------------------------------------------------------------

interface FakeWS {
  readyState: number
  onopen: ((this: WebSocket) => unknown) | null
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null
  onclose: ((this: WebSocket) => unknown) | null
  onerror: ((this: WebSocket) => unknown) | null
  send: jest.Mock
  close: jest.Mock
}

const sockets: FakeWS[] = []

class StubWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = StubWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send = jest.fn()
  close = jest.fn()

  constructor() {
    sockets.push(this as unknown as FakeWS)
  }
}

;(globalThis as unknown as { WebSocket: typeof StubWebSocket }).WebSocket =
  StubWebSocket

// ---------------------------------------------------------------------------
// Mock looperApi so initial getStatus() resolves to a deterministic snapshot.
// ---------------------------------------------------------------------------

import type { LooperStatus } from '../../map2/clients/looper'

const mockIdleSnapshot: LooperStatus = {
  tracks: Array.from({ length: 4 }, (_, i) => ({
    track: i,
    state: 0,
    state_label: 'empty',
    loop_length_frames: 0,
    playhead_frames: 0,
    layer_count: 0,
    level_db: 0,
    muted: false,
    soloed: false,
    reverse: false,
    half_speed: false,
    locked: false,
    one_shot: false,
    auto_armed: false,
    auto_threshold_db: -36.0,
    stop_mode: 'hard',
    fade_ms: 250,
    sync_mode: 'free',
    slices: [],
    quantize_division: 'off',
  })),
  active_track_count: 0,
  sync_master: false,
  master_level_db: 0,
  bpm: null,
  sync_master_track: null,
  recent_activity: [],
}

jest.mock('../../map2/clients/looper', () => ({
  looperApi: {
    getStatus: jest.fn(async () => mockIdleSnapshot),
    record: jest.fn(async () => mockIdleSnapshot),
    stop: jest.fn(async () => mockIdleSnapshot),
    clear: jest.fn(async () => mockIdleSnapshot),
    undo: jest.fn(async () => mockIdleSnapshot),
    redo: jest.fn(async () => mockIdleSnapshot),
    setLevel: jest.fn(async () => mockIdleSnapshot),
    setMuted: jest.fn(async () => mockIdleSnapshot),
    setSoloed: jest.fn(async () => mockIdleSnapshot),
    setReverse: jest.fn(async () => mockIdleSnapshot),
    setHalfSpeed: jest.fn(async () => mockIdleSnapshot),
    setLocked: jest.fn(async () => mockIdleSnapshot),
    setOneShot: jest.fn(async () => mockIdleSnapshot),
    setAutoArmed: jest.fn(async () => mockIdleSnapshot),
    setAutoThresholdDb: jest.fn(async () => mockIdleSnapshot),
    setStopMode: jest.fn(async () => mockIdleSnapshot),
    setFadeMs: jest.fn(async () => mockIdleSnapshot),
    setSyncMode: jest.fn(async () => mockIdleSnapshot),
    setQuantizeDivision: jest.fn(async () => mockIdleSnapshot),
    addSlice: jest.fn(async () => mockIdleSnapshot),
    addSliceAtPlayhead: jest.fn(async () => mockIdleSnapshot),
    clearSlices: jest.fn(async () => mockIdleSnapshot),
    deleteSlice: jest.fn(async () => mockIdleSnapshot),
    resetState: jest.fn(async () => mockIdleSnapshot),
    getActivity: jest.fn(async () => ({ events: [], cap: 200 })),
    clearActivity: jest.fn(async () => ({ events: [], cap: 200 })),
    autoRecordPush: jest.fn(async () => ({
      fired: false,
      status: mockIdleSnapshot,
    })),
    setMasterLevel: jest.fn(async () => mockIdleSnapshot),
  },
}))

jest.mock('../../map2/transport', () => ({
  API_BASE: '/api',
  getWsUrl: () => 'ws://localhost:8080/ws',
}))

import { LooperPage } from './LooperPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LooperPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sockets.length = 0
})

describe('LooperPage WS connectivity indicator', () => {
  it('starts in "Polling" state before the WS opens', async () => {
    renderPage()
    const tag = await screen.findByTestId('looper-ws-status')
    expect(tag).toHaveTextContent('Polling (2 s)')
  })

  it('flips to "Live" when the WS open event fires', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    expect(sockets).toHaveLength(1)

    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    await waitFor(() => {
      expect(screen.getByTestId('looper-ws-status')).toHaveTextContent('Live')
    })
    // Subscribed to the looper:status topic on open.
    expect(sockets[0]!.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', topic: 'looper:status' }),
    )
  })

  it('flips back to "Polling" on WS close', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })
    await waitFor(() => {
      expect(screen.getByTestId('looper-ws-status')).toHaveTextContent('Live')
    })

    act(() => {
      sockets[0]!.onclose?.call(sockets[0] as unknown as WebSocket)
    })

    await waitFor(() => {
      expect(screen.getByTestId('looper-ws-status')).toHaveTextContent(
        'Polling (2 s)',
      )
    })
  })
})

describe('LooperPage WS frame application', () => {
  it('applies a looper_status frame from the WS without an HTTP call', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    // Synthesize a status frame in which track 0 is RECORDING.
    const recordingFrame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? {
                ...t,
                state: 1, // RECORDING
                state_label: 'recording',
                layer_count: 1,
              }
            : t,
        ),
        active_track_count: 1,
      },
    }

    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(recordingFrame) } as MessageEvent,
      )
    })

    // The TrackCard for Track 1 should now show the recording state
    // label "REC" (via the LED text). Wait for re-render.
    await waitFor(() => {
      // The LED is the first child element on each track tile and shows
      // 'REC' when recording; query by visible text.
      expect(screen.getByText('REC')).toBeInTheDocument()
    })
  })

  it('drops malformed JSON frames silently (no crash)', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })
    // Should not throw.
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: '{not json' } as MessageEvent,
      )
    })
    // Tag still readable.
    expect(screen.getByTestId('looper-ws-status')).toBeInTheDocument()
  })

  it('ignores frames with the wrong type discriminator', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        {
          data: JSON.stringify({ type: 'something_else', payload: {} }),
        } as MessageEvent,
      )
    })

    // Track grid is still rendered, no crash, state still empty.
    expect(screen.getByTestId('looper-ws-status')).toBeInTheDocument()
  })
})

describe('LooperPage transport-button → looperApi wiring', () => {
  // We import the mocked looperApi back via require() so we can read
  // its jest.fn instances without breaking the jest.mock factory's
  // hoist-safety rules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looperApi } = require('../../map2/clients/looper') as {
    looperApi: Record<string, jest.Mock>
  }

  beforeEach(() => {
    Object.values(looperApi).forEach((fn) => fn.mockClear())
  })

  it('clicking the Record button calls looperApi.record(track)', async () => {
    renderPage()
    const btn = await screen.findByTestId('looper-record-1')
    btn.click()
    await waitFor(() => {
      expect(looperApi.record).toHaveBeenCalledWith(1)
    })
  })

  it('clicking Stop / Undo / Redo / Clear routes to the matching client method', async () => {
    renderPage()
    const stop = await screen.findByTestId('looper-stop-2')
    stop.click()
    await waitFor(() => expect(looperApi.stop).toHaveBeenCalledWith(2))

    const undo = await screen.findByTestId('looper-undo-2')
    undo.click()
    await waitFor(() => expect(looperApi.undo).toHaveBeenCalledWith(2))

    const redo = await screen.findByTestId('looper-redo-2')
    redo.click()
    await waitFor(() => expect(looperApi.redo).toHaveBeenCalledWith(2))

    const clear = await screen.findByTestId('looper-clear-2')
    clear.click()
    await waitFor(() => expect(looperApi.clear).toHaveBeenCalledWith(2))
  })

  it('each track 0..3 has its own independent transport buttons', async () => {
    renderPage()
    // Pull all 4 record buttons in parallel and click each.
    for (let t = 0; t < 4; t++) {
      const btn = await screen.findByTestId(`looper-record-${t}`)
      btn.click()
    }
    await waitFor(() => {
      expect(looperApi.record).toHaveBeenCalledTimes(4)
    })
    const callArgs = looperApi.record.mock.calls.map((c) => c[0])
    expect(callArgs.sort()).toEqual([0, 1, 2, 3])
  })

  it('record-button rerender swaps label on state change', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    // Push a frame with track 0 RECORDING.
    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? {
                ...t,
                state: 1,
                state_label: 'recording',
                layer_count: 1,
              }
            : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    // While recording, the same testid resolves to a Button whose
    // text content is "Stop & play".
    await waitFor(() => {
      const btn = screen.getByTestId('looper-record-0')
      expect(btn).toHaveTextContent('Stop & play')
    })
  })
})

describe('LooperPage T2512-PAGE-V2 advanced state surface', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looperApi } = require('../../map2/clients/looper') as {
    looperApi: Record<string, jest.Mock>
  }

  beforeEach(() => {
    Object.values(looperApi).forEach((fn) => fn.mockClear())
  })

  it('renders the advanced row per track', async () => {
    renderPage()
    for (let t = 0; t < 4; t++) {
      const row = await screen.findByTestId(`looper-advanced-${t}`)
      expect(row).toBeInTheDocument()
    }
  })

  // Carbon's <Select labelText=...> renders the label as a separate
  // element rather than associating it via htmlFor, so RTL's
  // findByLabelText doesn't resolve. Pull the <select> directly by
  // id — same identifier the component sets.
  async function _selectById(id: string): Promise<HTMLSelectElement> {
    // findByTestId on a parent container, then drill to the <select>.
    await screen.findByTestId('looper-advanced-0')
    const el = document.getElementById(id)
    if (!el) throw new Error(`select #${id} not found in DOM`)
    return el as HTMLSelectElement
  }

  it('changing the sync-mode select calls looperApi.setSyncMode', async () => {
    renderPage()
    const select = await _selectById('looper-sync-0')
    select.value = 'master'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => {
      expect(looperApi.setSyncMode).toHaveBeenCalledWith(0, 'master')
    })
  })

  it('changing the stop-mode select calls looperApi.setStopMode', async () => {
    renderPage()
    const select = await _selectById('looper-stop-mode-0')
    select.value = 'fade'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => {
      expect(looperApi.setStopMode).toHaveBeenCalledWith(0, 'fade')
    })
  })

  it('changing the quantize select calls looperApi.setQuantizeDivision', async () => {
    renderPage()
    const select = await _selectById('looper-quantize-0')
    select.value = 'eighth'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => {
      expect(looperApi.setQuantizeDivision).toHaveBeenCalledWith(0, 'eighth')
    })
  })

  it('shows a "0 slices" badge per track by default', async () => {
    renderPage()
    for (let t = 0; t < 4; t++) {
      const strip = await screen.findByTestId(`looper-slices-${t}`)
      expect(strip).toHaveTextContent('0 slices')
    }
  })

  it('does not render the Clear-slices button when slices are empty', async () => {
    renderPage()
    // No matching testid should exist for empty tracks.
    expect(screen.queryByTestId('looper-clear-slices-0')).toBeNull()
  })

  it('renders Clear-slices when a status frame carries slices', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? { ...t, slices: [{ start_frame: 0, end_frame: 1000, label: 'a' }] }
            : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const btn = await screen.findByTestId('looper-clear-slices-0')
    btn.click()
    await waitFor(() => {
      expect(looperApi.clearSlices).toHaveBeenCalledWith(0)
    })
  })
})

describe('LooperPage T2512-SLICE-UI region editor', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looperApi } = require('../../map2/clients/looper') as {
    looperApi: Record<string, jest.Mock>
  }

  beforeEach(() => {
    Object.values(looperApi).forEach((fn) => fn.mockClear())
  })

  it('renders the slice-editor toggle for every track', async () => {
    renderPage()
    for (let t = 0; t < 4; t++) {
      const toggle = await screen.findByTestId(
        `looper-slice-editor-toggle-${t}`,
      )
      expect(toggle).toBeInTheDocument()
    }
  })

  it('does not render the editor body until the toggle is clicked', async () => {
    renderPage()
    // Body absent before toggle.
    expect(screen.queryByTestId('looper-add-slice-0')).toBeNull()
    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()
    expect(await screen.findByTestId('looper-add-slice-0')).toBeInTheDocument()
  })

  it('shows the empty-state copy when a track has no slices', async () => {
    renderPage()
    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()
    expect(await screen.findByText(/No slices yet/)).toBeInTheDocument()
    expect(screen.queryByTestId('looper-slice-list-0')).toBeNull()
  })

  it('Add-slice button fires looperApi.addSlice with the form values', async () => {
    renderPage()
    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()

    // Set the label by firing a synthetic change event — React's
    // controlled input requires the React-aware event helper to pick
    // up the value transition.
    const labelInput = await screen.findByTestId('looper-slice-label-0')
    fireEvent.change(labelInput, { target: { value: 'intro' } })

    const btn = await screen.findByTestId('looper-add-slice-0')
    btn.click()

    await waitFor(() => {
      expect(looperApi.addSlice).toHaveBeenCalled()
    })
    // Default form values are start=0, end=48000.
    const call = looperApi.addSlice.mock.calls[0]
    expect(call?.[0]).toBe(0)         // track
    expect(call?.[1]).toBe(0)         // start_frame
    expect(call?.[2]).toBe(48000)     // end_frame
    expect(call?.[3]).toBe('intro')   // label (trimmed)
  })

  it('renders the slice list when status carries slices', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? {
                ...t,
                slices: [
                  { start_frame: 0,     end_frame: 24000,  label: 'intro' },
                  { start_frame: 24000, end_frame: 48000,  label: 'verse' },
                ],
              }
            : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()

    const list = await screen.findByTestId('looper-slice-list-0')
    expect(list).toBeInTheDocument()
    expect(list).toHaveTextContent('0–24000')
    expect(list).toHaveTextContent('intro')
    expect(list).toHaveTextContent('24000–48000')
    expect(list).toHaveTextContent('verse')
  })

  it('Slice-here button is hidden when playhead is 0', async () => {
    // Default mock snapshot has playhead_frames=0 for every track.
    renderPage()
    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()
    expect(screen.queryByTestId('looper-slice-at-playhead-0')).toBeNull()
  })

  it('Slice-here button renders when a WS frame reports a non-zero playhead', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0 ? { ...t, playhead_frames: 24000 } : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()
    const btn = await screen.findByTestId('looper-slice-at-playhead-0')
    expect(btn).toHaveTextContent('Slice here (playhead @ 24000)')
  })

  it('Slice-here click fires looperApi.addSliceAtPlayhead with the trimmed label', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        {
          data: JSON.stringify({
            type: 'looper_status',
            payload: {
              ...mockIdleSnapshot,
              tracks: mockIdleSnapshot.tracks.map((t, i) =>
                i === 0 ? { ...t, playhead_frames: 24000 } : t,
              ),
            },
          }),
        } as MessageEvent,
      )
    })

    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()

    // Type into the same label field shared with the manual add form.
    const labelInput = await screen.findByTestId('looper-slice-label-0')
    fireEvent.change(labelInput, { target: { value: '  bridge  ' } })

    const btn = await screen.findByTestId('looper-slice-at-playhead-0')
    btn.click()
    await waitFor(() => {
      expect(looperApi.addSliceAtPlayhead).toHaveBeenCalledWith(0, 'bridge')
    })
  })

  it('per-slice delete button fires looperApi.deleteSlice with the start_frame', async () => {
    // T2512-SLICE-DEL — each row in the slice list carries a trash
    // button keyed by track + start_frame.
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? {
                ...t,
                slices: [
                  { start_frame: 0,     end_frame: 1000, label: 'a' },
                  { start_frame: 2000,  end_frame: 3000, label: 'b' },
                ],
              }
            : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()

    const trash = await screen.findByTestId('looper-delete-slice-0-2000')
    trash.click()
    await waitFor(() => {
      expect(looperApi.deleteSlice).toHaveBeenCalledWith(0, 2000)
    })
  })

  it('renders "unlabeled" placeholder for slices with empty labels', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0
            ? {
                ...t,
                slices: [
                  { start_frame: 0, end_frame: 1000, label: '' },
                ],
              }
            : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const toggle = await screen.findByTestId('looper-slice-editor-toggle-0')
    toggle.click()
    expect(await screen.findByText('unlabeled')).toBeInTheDocument()
  })
})

describe('LooperPage T2512-INVENTORY-V2 feature inventory accuracy', () => {
  it('summary button reflects the current live / pending split', async () => {
    renderPage()
    // The toggle button text encodes both counts as "Feature
    // inventory — N live, M on the worklist". Pin both numbers so a
    // future regression that mis-flags a shipped feature trips the
    // test loudly.
    const button = await screen.findByRole('button', {
      name: /Feature inventory/,
    })
    expect(button).toHaveTextContent('22 live')
    expect(button).toHaveTextContent('8 on the worklist')
  })

  it('clicking the summary button expands the body with both lists', async () => {
    renderPage()
    const button = await screen.findByRole('button', {
      name: /Feature inventory/,
    })
    // Body hidden initially.
    expect(screen.queryByText('Live in v1')).toBeNull()
    button.click()
    // After clicking, both lists are rendered.
    expect(await screen.findByText('Live in v1')).toBeInTheDocument()
    expect(screen.getByText('Filed as worklist follow-ons')).toBeInTheDocument()
  })

  it('headline features shipped this run appear in the live list', async () => {
    // After cycles 1-13 of this run, several major features moved
    // from "pending" to "live". Spot-check that the inventory body
    // reflects that — catches a regression where someone updates
    // the service contract but forgets to update the operator-
    // visible inventory.
    renderPage()
    const button = await screen.findByRole('button', {
      name: /Feature inventory/,
    })
    button.click()
    await screen.findByText('Live in v1')

    // Each of these features must appear as a <strong> label inside
    // the live list. The "live" tag is a sibling of the strong; we
    // assert presence of the label text.
    const livePhrases = [
      'MIDI control (CC / Program Change)',
      'Loop syncing (master/slave)',
      'Fade-out / stop modes',
      'Loop slicing / editing',
      'External footswitch support',
    ]
    for (const phrase of livePhrases) {
      expect(screen.getByText(phrase)).toBeInTheDocument()
    }
  })
})

describe('LooperPage T2512-ACTIVITY-UI panel', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looperApi } = require('../../map2/clients/looper') as {
    looperApi: Record<string, jest.Mock>
  }

  beforeEach(() => {
    // mockClear preserves implementations; mockReset wipes them.
    // We use mockReset on activity-related mocks so a queued
    // ``mockResolvedValueOnce`` from one test doesn't leak into the
    // next, then re-install the empty default.
    ;(looperApi.getActivity as jest.Mock).mockReset()
    ;(looperApi.clearActivity as jest.Mock).mockReset()
    ;(looperApi.getActivity as jest.Mock).mockResolvedValue({
      events: [],
      cap: 200,
    })
    ;(looperApi.clearActivity as jest.Mock).mockResolvedValue({
      events: [],
      cap: 200,
    })
    Object.values(looperApi).forEach((fn) => fn.mockClear())
  })

  it('Activity panel toggle renders on the page', async () => {
    renderPage()
    const toggle = await screen.findByTestId('looper-activity-toggle')
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveTextContent(/Recent activity/)
  })

  it('does not fetch activity until the toggle is clicked', async () => {
    renderPage()
    await screen.findByTestId('looper-activity-toggle')
    // Panel is closed → no fetch.
    expect(looperApi.getActivity).not.toHaveBeenCalled()
  })

  it('opens the panel, fetches activity, and shows the empty-state copy', async () => {
    renderPage()
    const toggle = await screen.findByTestId('looper-activity-toggle')
    act(() => {
      toggle.click()
    })
    await waitFor(() => {
      expect(looperApi.getActivity).toHaveBeenCalled()
    })
    expect(
      await screen.findByText(/No recorded activity yet/i),
    ).toBeInTheDocument()
  })

  it('renders newest-first events when the API returns a non-empty log', async () => {
    looperApi.getActivity.mockResolvedValueOnce({
      events: [
        {
          timestamp_iso: '2026-05-12T10:00:00Z',
          verb: 'record',
          track: 0,
          summary: 'track 0 record stomp',
        },
        {
          timestamp_iso: '2026-05-12T10:00:05Z',
          verb: 'stop',
          track: 0,
          summary: 'track 0 stop',
        },
      ],
      cap: 200,
    })
    renderPage()
    const toggle = await screen.findByTestId('looper-activity-toggle')
    act(() => {
      toggle.click()
    })
    const list = await screen.findByTestId('looper-activity-list')
    // Service returns oldest-first; UI flips to newest-first.
    const rows = list.querySelectorAll('li')
    expect(rows.length).toBe(2)
    expect(rows[0]).toHaveTextContent('stop')        // newer
    expect(rows[1]).toHaveTextContent('record')      // older
  })

  it('Clear-log button is disabled when events is empty', async () => {
    renderPage()
    const toggle = await screen.findByTestId('looper-activity-toggle')
    act(() => {
      toggle.click()
    })
    const clearBtn = await screen.findByTestId('looper-activity-clear')
    expect(clearBtn).toBeDisabled()
  })

  it('renders embedded recent_activity from a WS frame without polling', async () => {
    // T2512-ACTIVITY-WS — when the WS is connected, the panel
    // reads status.recent_activity directly and does NOT call
    // getActivity() on a polling interval.
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        recent_activity: [
          {
            timestamp_iso: '2026-05-12T11:00:00Z',
            verb: 'record',
            track: 0,
            summary: 'track 0 record stomp',
          },
          {
            timestamp_iso: '2026-05-12T11:00:01Z',
            verb: 'stop',
            track: 0,
            summary: 'track 0 stop',
          },
        ],
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    // Open the activity toggle.
    const toggle = await screen.findByTestId('looper-activity-toggle')
    act(() => {
      toggle.click()
    })
    // getActivity() gets called *once* on open (to populate `cap`),
    // but the rendered list comes from the WS-embedded payload, not
    // from the polling fetch. Reset getActivity to default empty so
    // we can detect that the rendered events come from the status
    // frame, not the fetch.
    looperApi.getActivity.mockResolvedValueOnce({ events: [], cap: 200 })

    const list = await screen.findByTestId('looper-activity-list')
    // The WS frame's recent_activity is newest-first already; UI
    // renders verbatim.
    expect(list).toHaveTextContent('record')
    expect(list).toHaveTextContent('stop')
  })

  it('Clear-log button fires looperApi.clearActivity and empties the list', async () => {
    looperApi.getActivity.mockResolvedValue({
      events: [
        {
          timestamp_iso: '2026-05-12T10:00:00Z',
          verb: 'record',
          track: 0,
          summary: 'track 0 record stomp',
        },
      ],
      cap: 200,
    })
    renderPage()
    const toggle = await screen.findByTestId('looper-activity-toggle')
    act(() => {
      toggle.click()
    })
    // Wait for the list to render with the seeded event.
    await screen.findByTestId('looper-activity-list')

    const clearBtn = await screen.findByTestId('looper-activity-clear')
    expect(clearBtn).not.toBeDisabled()
    act(() => {
      clearBtn.click()
    })
    await waitFor(() => {
      expect(looperApi.clearActivity).toHaveBeenCalled()
    })
  })
})

describe('LooperPage T2512-RESET state-reset modal', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looperApi } = require('../../map2/clients/looper') as {
    looperApi: Record<string, jest.Mock>
  }

  beforeEach(() => {
    Object.values(looperApi).forEach((fn) => fn.mockClear())
  })

  it('Reset-state button is rendered on the master Tile', async () => {
    renderPage()
    const btn = await screen.findByTestId('looper-reset-state-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('Reset state')
  })

  it('clicking Reset-state opens the confirmation modal without firing the API', async () => {
    renderPage()
    const btn = await screen.findByTestId('looper-reset-state-button')
    act(() => {
      btn.click()
    })
    // The modal copy is present in the DOM once open.
    expect(
      await screen.findByText(/clears every per-track flag/i),
    ).toBeInTheDocument()
    // No reset call has fired yet.
    expect(looperApi.resetState).not.toHaveBeenCalled()
  })

  it('clicking the modal primary button fires looperApi.resetState', async () => {
    renderPage()
    const trigger = await screen.findByTestId('looper-reset-state-button')
    act(() => {
      trigger.click()
    })
    // Wait for the modal copy to render so we know the modal is open.
    await screen.findByText(/clears every per-track flag/i)
    // The Carbon Modal primary button isn't directly addressable
    // by role/name in jsdom because of Carbon's internal markup —
    // pull it out by its rendered text within the modal footer.
    // The primary button has the literal "Reset state" inside it
    // but as the second occurrence (first is the trigger).
    const allResets = screen.getAllByText('Reset state').filter(
      (el) => (el as HTMLElement).tagName === 'BUTTON' ||
              (el as HTMLElement).closest('button') !== null,
    )
    expect(allResets.length).toBeGreaterThanOrEqual(2)
    // The trigger is rendered first in the DOM; the modal confirm
    // comes later (Carbon Modal appends to the body via a portal-
    // like positioning).
    const modalConfirmText = allResets[allResets.length - 1]
    const modalConfirm = modalConfirmText.closest('button') ?? modalConfirmText
    act(() => {
      ;(modalConfirm as HTMLElement).click()
    })
    await waitFor(() => {
      expect(looperApi.resetState).toHaveBeenCalledTimes(1)
    })
  })
})

describe('LooperPage T2512-FIX-SYNC-TAG master sync indicator', () => {
  it('does not render the sync-master tag when sync_master is false', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    // Initial mock snapshot has sync_master: false.
    expect(screen.queryByTestId('looper-master-sync-tag')).toBeNull()
  })

  it('renders "Track N = sync master" using sync_master_track from status', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    // Push a frame with Track 3 (index 2) as the sync master.
    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        sync_master: true,
        sync_master_track: 2,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 2 ? { ...t, sync_mode: 'master' as const } : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const tag = await screen.findByTestId('looper-master-sync-tag')
    // Display uses 1-based track numbering — index 2 → "Track 3".
    expect(tag).toHaveTextContent('Track 3 = sync master')
  })

  it('honors sync_master_track even when it is 0 (formerly hardcoded)', async () => {
    // Regression: the prior implementation hard-coded "Track 0" in
    // the label. This test pins the new behavior where track index
    // 0 explicitly resolves to "Track 1" (1-based display).
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        sync_master: true,
        sync_master_track: 0,
        tracks: mockIdleSnapshot.tracks.map((t, i) =>
          i === 0 ? { ...t, sync_mode: 'master' as const } : t,
        ),
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    const tag = await screen.findByTestId('looper-master-sync-tag')
    expect(tag).toHaveTextContent('Track 1 = sync master')
  })
})

describe('LooperPage T2512-CLOCK BPM tag', () => {
  it('renders the BPM tag when status.bpm is non-null', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    act(() => {
      sockets[0]!.onopen?.call(sockets[0] as unknown as WebSocket)
    })

    const frame = {
      type: 'looper_status',
      payload: {
        ...mockIdleSnapshot,
        bpm: 142.5,
      },
    }
    act(() => {
      sockets[0]!.onmessage?.call(
        sockets[0] as unknown as WebSocket,
        { data: JSON.stringify(frame) } as MessageEvent,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('looper-bpm')).toHaveTextContent('142.5 BPM')
    })
  })

  it('omits the BPM tag entirely when status.bpm is null', async () => {
    renderPage()
    await screen.findByTestId('looper-ws-status')
    // Initial snapshot has bpm=null; tag should never appear.
    expect(screen.queryByTestId('looper-bpm')).toBeNull()
  })
})
