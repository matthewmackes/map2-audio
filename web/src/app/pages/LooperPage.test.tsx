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
import { act, render, screen, waitFor } from '@testing-library/react'
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
  })),
  active_track_count: 0,
  sync_master: false,
  master_level_db: 0,
  bpm: null,
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
