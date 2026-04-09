import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import { usePushConfirmation } from './usePushConfirmation'

const mockTopicHandlers = new Map<string, (data: unknown, message: { type?: string }) => void>()

jest.mock('../../map2/clients/pushSurface', () => ({
  pushSurfaceApi: {
    getPendingConfirmation: jest.fn(),
  },
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketTopic: (topic: string, handler: (data: unknown, message: { type?: string }) => void) => {
    mockTopicHandlers.set(topic, handler)
  },
}))

const { pushSurfaceApi } = jest.requireMock('../../map2/clients/pushSurface') as {
  pushSurfaceApi: {
    getPendingConfirmation: jest.Mock
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('usePushConfirmation', () => {
  beforeEach(() => {
    mockTopicHandlers.clear()
    pushSurfaceApi.getPendingConfirmation.mockReset()
  })

  it('hydrates pending confirmation from REST', async () => {
    pushSurfaceApi.getPendingConfirmation.mockResolvedValue({
      status: 'ok',
      pending_confirmation: {
        action_id: 'push-confirm-1',
        action_type: 'instance_switch',
        reason: 'remote_instance',
        device_fingerprint: 'push-stage-left',
        device_identity: 'push-stage-left',
        target_instance_id: 'inst-1',
        target_display_name: 'Remote / Drums',
        target_node_id: 'node-b',
        target_node_label: 'Node B',
        created_at: 1000,
        expires_at: 1015,
        timeout_ms: 15000,
        accept_command: 'accept_pending_confirmation',
        reject_command: 'reject_pending_confirmation',
      },
      pending_count: 1,
    })

    const { result } = renderHook(
      () => usePushConfirmation(undefined, { refetchInterval: false }),
      { wrapper: makeWrapper(makeQueryClient()) },
    )

    await waitFor(() => expect(result.current.data?.pending_confirmation?.device_identity).toBe('push-stage-left'))
  })

  it('updates the cached summary from websocket events', async () => {
    pushSurfaceApi.getPendingConfirmation.mockResolvedValue({
      status: 'ok',
      pending_confirmation: null,
      pending_count: 0,
    })

    const { result } = renderHook(
      () => usePushConfirmation(undefined, { refetchInterval: false }),
      { wrapper: makeWrapper(makeQueryClient()) },
    )

    await waitFor(() => expect(result.current.data?.pending_confirmation).toBeNull())

    act(() => {
      mockTopicHandlers.get('push_surface:pending_confirmation')?.(
        {
          pending_confirmation: {
            action_id: 'push-confirm-2',
            action_type: 'instance_switch',
            reason: 'replace_live_instance',
            device_fingerprint: 'push-stage-right',
            device_identity: 'push-stage-right',
            target_instance_id: 'inst-9',
            target_display_name: 'Node C / Arena Drums',
            target_node_id: 'node-c',
            target_node_label: 'Node C',
            created_at: 2000,
            expires_at: 2015,
            timeout_ms: 15000,
            accept_command: 'accept_pending_confirmation',
            reject_command: 'reject_pending_confirmation',
          },
          pending_count: 1,
        },
        { type: 'push_surface_pending_confirmation' },
      )
    })

    await waitFor(() => expect(result.current.data?.pending_confirmation?.device_identity).toBe('push-stage-right'))
    expect(result.current.data?.pending_count).toBe(1)
  })
})
