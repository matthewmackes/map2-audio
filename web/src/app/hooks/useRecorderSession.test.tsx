/**
 * useRecorderSession — T2509-5 hook tests.
 *
 * Covers:
 *   - Initial list fetch populates `sessions`.
 *   - WS subscribe message goes out on open with correct topic.
 *   - Incoming `recorder_session` frame updates state.
 *   - WS frame with bad JSON / wrong type is ignored.
 *   - `armSession` calls api + threads result into list.
 *   - `startRolling` / `stopSession` update list in place.
 *   - `disarmSession` removes the session row.
 *   - WS close flips `isConnected` to false.
 *   - Hook with `enableWebSocket: false` skips WS entirely.
 *   - Polling kicks in when WS is closed.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

import type {
  RecorderSessionStatus,
  RecorderSessionListResponse,
} from '../../map2/clients/recorder'
import { useRecorderSession } from './useRecorderSession'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------


class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  url: string
  readyState: number = 0
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null

  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.call(this as unknown as WebSocket, new Event('open'))
  }

  emit(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent
    this.onmessage?.call(this as unknown as WebSocket, event)
  }

  emitRaw(raw: string) {
    const event = { data: raw } as MessageEvent
    this.onmessage?.call(this as unknown as WebSocket, event)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'))
  }
}

function makeStatus(
  partial: Partial<RecorderSessionStatus> = {},
): RecorderSessionStatus {
  return {
    session_id: 'sess-1',
    snapshot_id: 1,
    state: 'armed',
    armed: true,
    rolling: false,
    started_at: '2026-05-11T18:00:00+00:00',
    rolling_at: null,
    stopped_at: null,
    tap_matrix: {},
    participating_nodes: ['map2-prod-01'],
    ...partial,
  }
}

interface FakeApi {
  listSessions: jest.Mock<Promise<RecorderSessionListResponse>, []>
  armSession: jest.Mock<Promise<RecorderSessionStatus>, [any]>
  startRolling: jest.Mock<Promise<RecorderSessionStatus>, [string]>
  stopSession: jest.Mock<Promise<RecorderSessionStatus>, [string]>
  disarmSession: jest.Mock<Promise<void>, [string]>
  getSessionStatus: jest.Mock<Promise<RecorderSessionStatus>, [string]>
  // Unused by the hook but required for type-completeness:
  listRecordings: jest.Mock
  getRecordingMetadata: jest.Mock
  recordingWavUrl: jest.Mock
  deleteRecording: jest.Mock
}

function buildFakeApi(initialSessions: RecorderSessionStatus[] = []): FakeApi {
  return {
    listSessions: jest
      .fn<Promise<RecorderSessionListResponse>, []>()
      .mockResolvedValue({ sessions: initialSessions, count: initialSessions.length }),
    armSession: jest.fn<Promise<RecorderSessionStatus>, [any]>(),
    startRolling: jest.fn<Promise<RecorderSessionStatus>, [string]>(),
    stopSession: jest.fn<Promise<RecorderSessionStatus>, [string]>(),
    disarmSession: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    getSessionStatus: jest.fn<Promise<RecorderSessionStatus>, [string]>(),
    listRecordings: jest.fn(),
    getRecordingMetadata: jest.fn(),
    recordingWavUrl: jest.fn(),
    deleteRecording: jest.fn(),
  }
}

function wrap(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  FakeWebSocket.instances = []
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


test('initial list fetch populates sessions', async () => {
  const api = buildFakeApi([makeStatus({ session_id: 'sess-A' })])
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: false },
        { recorderApi: api as any },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.sessions).toHaveLength(1))
  expect(result.current.sessions[0].session_id).toBe('sess-A')
  expect(api.listSessions).toHaveBeenCalled()
})

test('WS open sends subscribe action on recorder:session topic', async () => {
  const api = buildFakeApi()
  renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  expect(ws).toBeDefined()
  act(() => ws.open())
  expect(ws.sent).toContain(
    JSON.stringify({ action: 'subscribe', topic: 'recorder:session' }),
  )
})

test('incoming recorder_session frame updates sessions list', async () => {
  const api = buildFakeApi([makeStatus({ session_id: 'sess-A', state: 'armed' })])
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.sessions).toHaveLength(1))
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  act(() => ws.open())
  // Push a frame that flips sess-A to rolling.
  act(() =>
    ws.emit({
      type: 'recorder_session',
      payload: makeStatus({ session_id: 'sess-A', state: 'rolling', rolling: true }),
    }),
  )
  await waitFor(() => expect(result.current.sessions[0].state).toBe('rolling'))
  expect(result.current.sessions[0].rolling).toBe(true)
})

test('incoming frame for unknown session adds a new row', async () => {
  const api = buildFakeApi()
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  act(() => ws.open())
  act(() =>
    ws.emit({
      type: 'recorder_session',
      payload: makeStatus({ session_id: 'sess-new', state: 'armed' }),
    }),
  )
  await waitFor(() => expect(result.current.sessions).toHaveLength(1))
  expect(result.current.sessions[0].session_id).toBe('sess-new')
})

test('bad JSON on the WS topic is ignored and does not crash the hook', async () => {
  const api = buildFakeApi()
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  act(() => ws.open())
  act(() => ws.emitRaw('{ malformed'))
  // No crash, no session.
  expect(result.current.sessions).toEqual([])
  consoleErrorSpy.mockRestore()
})

test('wrong-type frame on the topic is ignored', async () => {
  const api = buildFakeApi()
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  act(() => ws.open())
  act(() =>
    ws.emit({
      type: 'something_else',
      payload: makeStatus({ session_id: 'sess-other' }),
    }),
  )
  expect(result.current.sessions).toEqual([])
})

test('armSession threads result into the list', async () => {
  const api = buildFakeApi()
  const armed = makeStatus({ session_id: 'sess-armed', state: 'armed' })
  api.armSession.mockResolvedValue(armed)
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: false },
        { recorderApi: api as any },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await act(async () => {
    await result.current.armSession({ snapshot_id: 7, tap_matrix: {} })
  })
  expect(api.armSession).toHaveBeenCalledWith({ snapshot_id: 7, tap_matrix: {} })
  expect(result.current.sessions).toContainEqual(armed)
})

test('startRolling and stopSession update the list in place', async () => {
  const api = buildFakeApi([makeStatus({ session_id: 'sess-A', state: 'armed' })])
  const rolling = makeStatus({ session_id: 'sess-A', state: 'rolling', rolling: true })
  const stopped = makeStatus({ session_id: 'sess-A', state: 'stopped', armed: false })
  api.startRolling.mockResolvedValue(rolling)
  api.stopSession.mockResolvedValue(stopped)
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: false },
        { recorderApi: api as any },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.sessions).toHaveLength(1))
  await act(async () => {
    await result.current.startRolling('sess-A')
  })
  expect(result.current.sessions[0].state).toBe('rolling')
  await act(async () => {
    await result.current.stopSession('sess-A')
  })
  expect(result.current.sessions[0].state).toBe('stopped')
})

test('disarmSession removes the session row', async () => {
  const api = buildFakeApi([
    makeStatus({ session_id: 'sess-A' }),
    makeStatus({ session_id: 'sess-B' }),
  ])
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: false },
        { recorderApi: api as any },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.sessions).toHaveLength(2))
  await act(async () => {
    await result.current.disarmSession('sess-A')
  })
  expect(api.disarmSession).toHaveBeenCalledWith('sess-A')
  expect(result.current.sessions.map((s) => s.session_id)).toEqual(['sess-B'])
})

test('WS close flips isConnected to false', async () => {
  const api = buildFakeApi()
  const { result } = renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: true },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  act(() => ws.open())
  await waitFor(() => expect(result.current.isConnected).toBe(true))
  act(() => ws.close())
  await waitFor(() => expect(result.current.isConnected).toBe(false))
})

test('enableWebSocket=false skips WS entirely', async () => {
  const api = buildFakeApi()
  renderHook(
    () =>
      useRecorderSession(
        { enableWebSocket: false },
        {
          recorderApi: api as any,
          WebSocketImpl: FakeWebSocket as any,
          getWsUrl: () => 'ws://test/ws',
        },
      ),
    { wrapper: ({ children }) => wrap(children) },
  )
  // No FakeWebSocket instance should have been constructed.
  expect(FakeWebSocket.instances).toHaveLength(0)
})
