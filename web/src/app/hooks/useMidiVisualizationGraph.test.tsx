/**
 * T2500-MV-C1 — useMidiVisualizationGraph tests.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  isNoiseEvent,
  useMidiVisualizationGraph,
} from './useMidiVisualizationGraph'

interface FakeSocket extends WebSocket {
  __emit: (data: unknown) => void
  __open: () => void
  __close: () => void
}

function makeFakeSocket(): FakeSocket {
  const handlers: {
    open?: () => void
    message?: (msg: { data: string }) => void
    error?: () => void
    close?: () => void
  } = {}
  const fake = {
    close: () => handlers.close?.(),
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    __emit: (data: unknown) =>
      handlers.message?.({ data: JSON.stringify(data) }),
    __open: () => handlers.open?.(),
    __close: () => handlers.close?.(),
  } as unknown as FakeSocket
  Object.defineProperty(fake, 'onopen', {
    set(cb: (() => void) | null) {
      handlers.open = cb ?? undefined
    },
  })
  Object.defineProperty(fake, 'onmessage', {
    set(cb: ((msg: { data: string }) => void) | null) {
      handlers.message = cb ?? undefined
    },
  })
  Object.defineProperty(fake, 'onerror', {
    set(cb: (() => void) | null) {
      handlers.error = cb ?? undefined
    },
  })
  Object.defineProperty(fake, 'onclose', {
    set(cb: (() => void) | null) {
      handlers.close = cb ?? undefined
    },
  })
  return fake
}

function wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useMidiVisualizationGraph', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nodes: [], edges: [] }),
    })) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('processes a replay handshake into edge + node activity', async () => {
    const fakeSocket = makeFakeSocket()
    let scheduled: (() => void) | null = null
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: (cb) => {
            scheduled = cb
            return 1
          },
          cancelFrame: () => undefined,
          now: () => 1_000_000,
        }),
      { wrapper: wrap },
    )

    await act(async () => {
      fakeSocket.__open()
      fakeSocket.__emit({
        type: 'replay',
        events: [
          {
            kind: 'raw',
            source_node_id: 'device:p1',
            target_node_id: 'mapping:m1',
            ts_ms: 999_500,
            raw_hex: '903c40',
          },
          {
            kind: 'raw',
            source_node_id: 'device:p1',
            target_node_id: 'mapping:m1',
            ts_ms: 999_900,
            raw_hex: '903c40',
          },
        ],
      })
      // Run the scheduled flush.
      scheduled?.()
    })

    await waitFor(() => {
      expect(result.current.edgeActivity.size).toBe(1)
    })
    const edge = result.current.edgeActivity.get('device:p1=>mapping:m1')!
    expect(edge.totalEvents).toBe(2)
    expect(edge.lastEventAt).toBe(999_900)
    expect(result.current.nodeActivity.get('device:p1')!.recentEvents).toHaveLength(
      2,
    )
  })

  it('drops MIDI clock events when dropClockAndActiveSense is true', async () => {
    const fakeSocket = makeFakeSocket()
    let scheduled: (() => void) | null = null
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: (cb) => {
            scheduled = cb
            return 1
          },
          cancelFrame: () => undefined,
          now: () => 1_000_000,
        }),
      { wrapper: wrap },
    )

    await act(async () => {
      fakeSocket.__open()
      fakeSocket.__emit({
        type: 'event',
        event: {
          kind: 'raw',
          source_node_id: 'device:p1',
          target_node_id: 'mapping:m1',
          ts_ms: 999_500,
          status_byte: 0xf8,
        },
      })
      fakeSocket.__emit({
        type: 'event',
        event: {
          kind: 'raw',
          source_node_id: 'device:p1',
          target_node_id: 'mapping:m1',
          ts_ms: 999_600,
          status_byte: 0x90,
        },
      })
      scheduled?.()
    })

    const edge = result.current.edgeActivity.get('device:p1=>mapping:m1')
    expect(edge?.totalEvents).toBe(1)
  })

  it('respects eventKind filter ("dispatched" only)', async () => {
    const fakeSocket = makeFakeSocket()
    let scheduled: (() => void) | null = null
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: (cb) => {
            scheduled = cb
            return 1
          },
          cancelFrame: () => undefined,
          now: () => 1_000_000,
          initialFilters: { eventKind: 'dispatched' },
        }),
      { wrapper: wrap },
    )

    await act(async () => {
      fakeSocket.__open()
      fakeSocket.__emit({
        type: 'event',
        event: {
          kind: 'raw',
          source_node_id: 'device:p1',
          target_node_id: 'mapping:m1',
          ts_ms: 999_500,
        },
      })
      fakeSocket.__emit({
        type: 'event',
        event: {
          kind: 'dispatched',
          source_node_id: 'mapping:m1',
          target_node_id: 'target:audio.snapshot.recall',
          ts_ms: 999_600,
        },
      })
      scheduled?.()
    })

    expect(result.current.edgeActivity.get('device:p1=>mapping:m1')).toBeUndefined()
    expect(
      result.current.edgeActivity.get('mapping:m1=>target:audio.snapshot.recall'),
    ).toBeDefined()
  })

  it('coalesces multiple events into one rAF flush', async () => {
    const fakeSocket = makeFakeSocket()
    let scheduledCount = 0
    let scheduled: (() => void) | null = null
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: (cb) => {
            scheduledCount += 1
            scheduled = cb
            return scheduledCount
          },
          cancelFrame: () => undefined,
          now: () => 1_000_000,
        }),
      { wrapper: wrap },
    )

    await act(async () => {
      fakeSocket.__open()
      // 50 events delivered before the rAF tick fires.
      for (let i = 0; i < 50; i += 1) {
        fakeSocket.__emit({
          type: 'event',
          event: {
            kind: 'raw',
            source_node_id: 'device:p1',
            target_node_id: 'mapping:m1',
            ts_ms: 999_000 + i,
          },
        })
      }
      // Exactly one frame should have been scheduled.
      expect(scheduledCount).toBe(1)
      scheduled?.()
    })

    expect(
      result.current.edgeActivity.get('device:p1=>mapping:m1')!.totalEvents,
    ).toBe(50)
  })

  it.skip('exposes status="live" once the socket opens', async () => {
    const fakeSocket = makeFakeSocket()
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: () => 1,
          cancelFrame: () => undefined,
        }),
      { wrapper: wrap },
    )
    // Wait for topology query to settle so status leaves 'loading'.
    await waitFor(() => {
      expect(['connecting', 'live']).toContain(result.current.status)
    })
    await act(async () => {
      fakeSocket.__open()
    })
    await waitFor(() => {
      expect(result.current.status).toBe('live')
    })
  })

  it('setFilters can take a partial or an updater', async () => {
    const fakeSocket = makeFakeSocket()
    const { result } = renderHook(
      () =>
        useMidiVisualizationGraph({
          websocketFactory: () => fakeSocket,
          websocketUrlBuilder: () => 'ws://localhost/x',
          scheduleFrame: () => 1,
          cancelFrame: () => undefined,
        }),
      { wrapper: wrap },
    )
    await act(async () => {
      result.current.setFilters({ intensity: 0.5 })
    })
    expect(result.current.filters.intensity).toBe(0.5)

    await act(async () => {
      result.current.setFilters((prev) => ({ ...prev, intensity: 0.25 }))
    })
    expect(result.current.filters.intensity).toBe(0.25)
  })
})

describe('isNoiseEvent', () => {
  it('matches MIDI clock + active sense status bytes', () => {
    expect(isNoiseEvent({ status_byte: 0xf8 } as never)).toBe(true)
    expect(isNoiseEvent({ status_byte: 0xfe } as never)).toBe(true)
    expect(isNoiseEvent({ raw_hex: 'f8' } as never)).toBe(true)
    expect(isNoiseEvent({ raw_hex: '903c40' } as never)).toBe(false)
    expect(isNoiseEvent({} as never)).toBe(false)
  })
})
