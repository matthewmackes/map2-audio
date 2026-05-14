// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersClusterStream hook tests. Subscribes through
// the shared wsSubscriptionStore; we mock the store's `subscribe`
// export so we can drive frames into the hook directly without
// involving the global WebSocket.

import { act, renderHook, waitFor } from '@testing-library/react'

import { useDevicesPeakMetersClusterStream } from './useDevicesPeakMetersClusterStream'

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

const FRAME = {
  type: 'device_peak_meters:cluster_registry',
  schema_version: 1,
  data: {
    local: {
      devices: [
        {
          device_id: 'edirol-ua-1000',
          input_channels: 10,
          output_channels: 10,
          has_engine_source: true,
        },
      ],
    },
    peers: [
      {
        node_id: 'peer-A',
        hostname: 'a.local',
        devices: [
          {
            device_id: 'tascam-us144mkii',
            input_channels: 4,
            output_channels: 4,
            has_engine_source: false,
          },
        ],
        health: 'ok',
      },
    ],
    errors: { 'peer-B': 'http 504' },
  },
}

describe('useDevicesPeakMetersClusterStream', () => {
  it('subscribes to the default URL', () => {
    renderHook(() => useDevicesPeakMetersClusterStream())
    expect(captures.length).toBe(1)
    expect(captures[0].url).toContain('/api/v1/devices/peak-meters/cluster/stream')
  })

  it('appends include_snapshot=true to the URL when requested', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({
        url: 'ws://test/cluster',
        includeSnapshot: true,
      }),
    )
    expect(captures[0].url).toBe('ws://test/cluster?include_snapshot=true')
  })

  it('does not append include_snapshot when not requested', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({ url: 'ws://test/cluster' }),
    )
    expect(captures[0].url).toBe('ws://test/cluster')
  })

  it('parses local + peers + errors from frames', async () => {
    const { result } = renderHook(() =>
      useDevicesPeakMetersClusterStream({ url: 'ws://test/cluster' }),
    )
    expect(result.current.hasFirstFrame).toBe(false)
    act(() => {
      captures[0].callbacks.onFrame(FRAME)
    })
    await waitFor(() => {
      expect(result.current.hasFirstFrame).toBe(true)
    })
    expect(result.current.local?.devices?.[0]?.device_id).toBe(
      'edirol-ua-1000',
    )
    expect(result.current.peers).toHaveLength(1)
    expect(result.current.peers[0].node_id).toBe('peer-A')
    expect(result.current.errors).toEqual({ 'peer-B': 'http 504' })
  })

  it('flips isConnected to true when state goes open', async () => {
    const { result } = renderHook(() =>
      useDevicesPeakMetersClusterStream({ url: 'ws://test/cluster' }),
    )
    act(() => {
      captures[0].callbacks.onStateChange?.('open')
    })
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })
  })

  it('records errors via onError without breaking later frames', async () => {
    const { result } = renderHook(() =>
      useDevicesPeakMetersClusterStream({ url: 'ws://test/cluster' }),
    )
    act(() => {
      captures[0].callbacks.onError?.('frame parse failed')
    })
    await waitFor(() => {
      expect(result.current.lastError).toBe('frame parse failed')
    })
    act(() => {
      captures[0].callbacks.onFrame(FRAME)
    })
    await waitFor(() => {
      expect(result.current.lastError).toBeNull()
    })
  })

  it('does not subscribe when enabled=false', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({
        url: 'ws://test/cluster',
        enabled: false,
      }),
    )
    expect(captures.length).toBe(0)
  })

  it('appends node_ids when nodeIds is provided', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({
        url: 'ws://test/cluster',
        nodeIds: ['peer-A', 'local'],
      }),
    )
    expect(captures[0].url).toBe(
      'ws://test/cluster?node_ids=local%2Cpeer-A',
    )
  })

  it('combines include_snapshot=true and node_ids in the URL', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({
        url: 'ws://test/cluster',
        includeSnapshot: true,
        nodeIds: ['peer-A'],
      }),
    )
    expect(captures[0].url).toBe(
      'ws://test/cluster?include_snapshot=true&node_ids=peer-A',
    )
  })

  it('does not append node_ids when the list is empty', () => {
    renderHook(() =>
      useDevicesPeakMetersClusterStream({
        url: 'ws://test/cluster',
        nodeIds: [],
      }),
    )
    expect(captures[0].url).toBe('ws://test/cluster')
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      useDevicesPeakMetersClusterStream({ url: 'ws://test/cluster' }),
    )
    expect(captures[0].unsubscribed).toBe(false)
    unmount()
    expect(captures[0].unsubscribed).toBe(true)
  })
})
