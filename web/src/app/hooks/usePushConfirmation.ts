import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  pushSurfaceApi,
  type PushSurfacePendingConfirmationResponse,
} from '../../map2/clients/pushSurface'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'

function pendingConfirmationKey(nodeId?: string | null) {
  return ['push-surface', 'pending-confirmation', nodeId ?? 'local'] as const
}

interface PushConfirmationEventPayload {
  pending_confirmation?: PushSurfacePendingConfirmationResponse['pending_confirmation']
  pending_count?: number
}

export function usePushConfirmation(
  nodeId?: string | null,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { enabled = true, refetchInterval = 10_000 } = options
  const queryClient = useQueryClient()
  const queryKey = pendingConfirmationKey(nodeId)

  useWebSocketTopic<PushConfirmationEventPayload>('push_surface:pending_confirmation', (data, message) => {
    if (message.type !== 'push_surface_pending_confirmation' || !enabled) {
      return
    }

    queryClient.setQueryData<PushSurfacePendingConfirmationResponse>(queryKey, {
      status: 'ok',
      pending_confirmation: data?.pending_confirmation ?? null,
      pending_count: typeof data?.pending_count === 'number' ? data.pending_count : 0,
    })
  })

  return useQuery<PushSurfacePendingConfirmationResponse>({
    queryKey,
    queryFn: () => pushSurfaceApi.getPendingConfirmation(nodeId),
    enabled,
    staleTime: 1_000,
    refetchInterval,
  })
}
