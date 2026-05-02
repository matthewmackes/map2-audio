/**
 * T2486-1 — useMidiClusterSettings — read/write cluster MIDI gates.
 *
 * Wraps the new GET/PATCH /api/midi/cluster/settings endpoints so the
 * UI doesn't have to manage TanStack Query plumbing inline.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { midiClusterApi } from '../../map2/clients/midiHub'

export interface MidiClusterSettings {
  enabled: boolean
  auto_connect: boolean
}

const QUERY_KEY = ['midi-cluster-settings'] as const

export function useMidiClusterSettings() {
  const queryClient = useQueryClient()

  const query = useQuery<MidiClusterSettings>({
    queryKey: QUERY_KEY,
    queryFn: () => midiClusterApi.getSettings(),
  })

  const mutation = useMutation({
    mutationFn: (payload: Partial<MidiClusterSettings>) =>
      midiClusterApi.updateSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data)
    },
  })

  return {
    settings: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    update: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  }
}
