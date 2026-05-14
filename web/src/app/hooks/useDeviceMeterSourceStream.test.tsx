// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-13h cycle 1 — useDeviceMeterSourceStream WS variant tests.
// Mocks wsSubscriptionStore.subscribe directly so frames are
// deterministic; the store itself is covered by its own 10-case
// suite.

import { act, renderHook, waitFor } from '@testing-library/react'

import { useDeviceMeterSourceStream } from './useDeviceMeterSourceStream'

interface CapturedCallbacks {
  onFrame: (frame: unknown) => void
  onStateChange?: (state: 'connecting' | 'open' | 'closed') => void
  onError?: (message: string) => void
}

interface CapturedSubscription {
  url: string
  callbacks: CapturedCallbacks
  unsubscribed: boolean
}

const captures: CapturedSubscription[] = []

jest.mock('./wsSubscriptionStore', () => ({
  subscribe: (url: string, callbacks: CapturedCallbacks) => {
    const entry: CapturedSubscription = {
      url,
      callbacks,
      unsubscribed: false,
    }
    captures.push(entry)
    return {
      unsubscribe: () => {
        entry.unsubscribed = true
      },
      state: () => 'connecting' as const,
      lastError: () => null,
    }
  },
}))

beforeEach(() => {
  captures.length = 0
})

function frameFor(
  deviceId: string,
  source: 'engine' | 'engine_unavailable' | 'placeholder',
  captured_at: number | null,
): unknown {
  return {
    type: 'device_peak_meters:registry',
    schema_version: 1,
    data: {
      devices: [
        {
          device_id: deviceId,
          input_channels: 2,
          output_channels: 2,
          has_engine_source: source === 'engine',
          snapshot: {
            input_peak_db: [-6],
            output_peak_db: [-3],
            source,
            captured_at,
          },
        },
      ],
    },
  }
}

describe('useDeviceMeterSourceStream', () => {
  it('subscribes with the canonical device_ids query', () => {
    renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak-meters/stream',
      }),
    )
    expect(captures.length).toBe(1)
    expect(captures[0].url).toBe(
      'ws://test/peak-meters/stream?device_ids=tascam-us144mkii',
    )
  })

  it('projects the device entry from frames into the existing payload shape', async () => {
    const { result } = renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak',
      }),
    )
    expect(result.current.isLoading).toBe(true)
    act(() => {
      captures[0].callbacks.onFrame(
        frameFor('tascam-us144mkii', 'engine', 1715731200.0),
      )
    })
    await waitFor(() => {
      expect(result.current.source).toBe('engine')
    })
    expect(result.current.payload?.captured_at).toBe(1715731200.0)
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores frames that omit the requested device_id', async () => {
    const { result } = renderHook(() =>
      useDeviceMeterSourceStream('lexicon-mpx1', { url: 'ws://test/peak' }),
    )
    act(() => {
      // Frame carries a different device — should not flip source.
      captures[0].callbacks.onFrame(
        frameFor('edirol-ua-1000', 'engine', 1715731200.0),
      )
    })
    expect(result.current.source).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })

  it('flips isStale to true when captured_at crosses the threshold', async () => {
    const now = Date.now() / 1000
    const { result } = renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak',
        staleThresholdSeconds: 5,
      }),
    )
    act(() => {
      captures[0].callbacks.onFrame(
        frameFor('tascam-us144mkii', 'engine', now - 30),
      )
    })
    await waitFor(() => {
      expect(result.current.isStale).toBe(true)
    })
    expect(result.current.ageSeconds).not.toBeNull()
    expect(result.current.ageSeconds!).toBeGreaterThanOrEqual(30)
  })

  it('reports isError on socket error and clears it on the next frame', async () => {
    const now = Date.now() / 1000
    const { result } = renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak',
      }),
    )
    act(() => {
      captures[0].callbacks.onError?.('websocket error')
    })
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    act(() => {
      captures[0].callbacks.onFrame(
        frameFor('tascam-us144mkii', 'engine', now),
      )
    })
    await waitFor(() => {
      expect(result.current.isError).toBe(false)
    })
  })

  it('does not subscribe when enabled=false', () => {
    renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak',
        enabled: false,
      }),
    )
    expect(captures.length).toBe(0)
  })

  it('falls back to has_engine_source when the snapshot omits source', async () => {
    const frame = {
      type: 'device_peak_meters:registry',
      schema_version: 1,
      data: {
        devices: [
          {
            device_id: 'tascam-us144mkii',
            input_channels: 2,
            output_channels: 2,
            has_engine_source: false,
            snapshot: {
              input_peak_db: [-150],
              output_peak_db: [-150],
              // no source field
              captured_at: null,
            },
          },
        ],
      },
    }
    const { result } = renderHook(() =>
      useDeviceMeterSourceStream('tascam-us144mkii', {
        url: 'ws://test/peak',
      }),
    )
    act(() => {
      captures[0].callbacks.onFrame(frame)
    })
    await waitFor(() => {
      expect(result.current.source).toBe('placeholder')
    })
  })
})
