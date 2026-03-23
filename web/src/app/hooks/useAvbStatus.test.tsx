import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/map2/api', () => ({
  API_BASE: '/api',
}))

import { useAvbRealtimeSync } from './useAvbStatus'

const mockTopicHandlers = new Map<string, (data: unknown, message: unknown) => void>()

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: null,
    isConnected: true,
  }),
  useWebSocketTopic: (topic: string, handler: (data: unknown, message: unknown) => void) => {
    mockTopicHandlers.set(topic, handler)
  },
}))

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useAvbRealtimeSync', () => {
  beforeEach(() => {
    mockTopicHandlers.clear()
  })

  it('invalidates the expected AVB query groups for websocket topics', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined)

    renderHook(() => useAvbRealtimeSync(true), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      mockTopicHandlers.get('avb:streams')?.({}, { type: 'avb_streams_updated' })
      mockTopicHandlers.get('avb:ptp')?.({}, { type: 'avb_ptp_updated' })
      mockTopicHandlers.get('avb:avdecc')?.({}, { type: 'avb_avdecc_entities_updated' })
    })

    expect(invalidateSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [{ queryKey: ['avb', 'streams'] }],
        [{ queryKey: ['avb', 'status'] }],
        [{ queryKey: ['avb', 'devices'] }],
        [{ queryKey: ['avb', 'avdecc'] }],
        [{ queryKey: ['avb', 'topology'] }],
        [{ queryKey: ['avb', 'ptp'] }],
      ]),
    )
  })

  it('does not invalidate queries when the realtime sync is disabled', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined)

    renderHook(() => useAvbRealtimeSync(false), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      mockTopicHandlers.get('avb:streams')?.({}, { type: 'avb_streams_updated' })
      mockTopicHandlers.get('avb:ptp')?.({}, { type: 'avb_ptp_updated' })
      mockTopicHandlers.get('avb:avdecc')?.({}, { type: 'avb_avdecc_entities_updated' })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
