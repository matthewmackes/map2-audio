import { useQuery } from '@tanstack/react-query'

import { getNodeHealth, getNodeIdentity, getNodeTopology } from '../../map2/api'

export const NODE_POLL_INTERVAL_MS = 5000

export function useNodeTopology() {
  return useQuery({
    queryKey: ['nodeTopology'],
    queryFn: getNodeTopology,
    refetchInterval: NODE_POLL_INTERVAL_MS,
    staleTime: NODE_POLL_INTERVAL_MS,
  })
}

export function useNodeHealth() {
  return useQuery({
    queryKey: ['nodeHealth'],
    queryFn: getNodeHealth,
    refetchInterval: NODE_POLL_INTERVAL_MS,
    staleTime: NODE_POLL_INTERVAL_MS,
  })
}

export function useNodeIdentity() {
  return useQuery({
    queryKey: ['nodeIdentity'],
    queryFn: getNodeIdentity,
    staleTime: 30_000,
  })
}
