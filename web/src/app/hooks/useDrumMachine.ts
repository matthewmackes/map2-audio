import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { drumsApi } from '@/map2/api'
import type {
  DrumMachineStateUpdate,
  DrumTransportUpdate,
} from '@/map2/types'

export function useDrumMachineState() {
  return useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    staleTime: 5_000,
  })
}

export function useDrumTransport() {
  return useQuery({
    queryKey: ['drums', 'transport'],
    queryFn: drumsApi.getTransport,
    refetchInterval: 500,
    staleTime: 250,
  })
}

export function useDrumPacks() {
  const factory = useQuery({
    queryKey: ['drums', 'factory-packs'],
    queryFn: drumsApi.getFactoryPacks,
    staleTime: 60_000,
  })

  const generated = useQuery({
    queryKey: ['drums', 'generated-packs'],
    queryFn: drumsApi.getGeneratedPacks,
    staleTime: 30_000,
  })

  return { factory, generated }
}

export function useDrumMetering() {
  return useQuery({
    queryKey: ['drums', 'metering'],
    queryFn: drumsApi.getMetering,
    refetchInterval: 1_000,
    staleTime: 500,
  })
}

export function useUpdateDrumMachineState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumMachineStateUpdate) => drumsApi.updateState(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
    },
  })
}

export function useUpdateDrumTransport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumTransportUpdate) => drumsApi.setTransport(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
    },
  })
}
