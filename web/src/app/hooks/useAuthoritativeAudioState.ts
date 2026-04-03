import { useQuery } from '@tanstack/react-query'

import { audioStateApi } from '../../map2/clients/audioState'
import type {
  AudioStateObservationListResponse,
  AuthoritativeAudioStateEnvelope,
  AudioStateRouteStatus,
  DesiredAudioStateEnvelope,
} from '../../map2/types'

export function useAudioStateAuthorityStatus(options: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const { enabled = true, refetchInterval = 10_000 } = options
  return useQuery<AudioStateRouteStatus>({
    queryKey: ['audio-state', 'status'],
    queryFn: () => audioStateApi.getStatus(),
    enabled,
    staleTime: 2_000,
    refetchInterval,
  })
}

export function useCommittedAudioState(options: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const { enabled = true, refetchInterval = 5_000 } = options
  return useQuery<AuthoritativeAudioStateEnvelope>({
    queryKey: ['audio-state', 'committed'],
    queryFn: () => audioStateApi.getCommitted(),
    enabled,
    staleTime: 1_000,
    refetchInterval,
  })
}

export function useDesiredAudioState(options: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const { enabled = true, refetchInterval = 5_000 } = options
  return useQuery<DesiredAudioStateEnvelope>({
    queryKey: ['audio-state', 'desired'],
    queryFn: () => audioStateApi.getDesired(),
    enabled,
    staleTime: 1_000,
    refetchInterval,
  })
}

export function useObservedAudioState(
  stateVersion?: number | null,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { enabled = true, refetchInterval = 5_000 } = options
  return useQuery<AudioStateObservationListResponse>({
    queryKey: ['audio-state', 'observed', stateVersion ?? 'all'],
    queryFn: () => audioStateApi.getObserved(typeof stateVersion === 'number' ? stateVersion : undefined),
    enabled: enabled && (stateVersion == null || Number.isFinite(stateVersion)),
    staleTime: 1_000,
    refetchInterval,
  })
}
