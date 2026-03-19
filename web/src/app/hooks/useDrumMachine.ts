import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { drumsApi } from '@/map2/api'
import type {
  DrumBusMixerUpdate,
  DrumMachineStateUpdate,
  DrumMidiMapping,
  DrumSong,
  DrumSongEntry,
  DrumTransportUpdate,
  DrumVelocityCurve,
} from '@/map2/types'

function invalidateDrumState(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
  void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
}

function invalidateDrumPattern(queryClient: ReturnType<typeof useQueryClient>, patternId?: number) {
  if (typeof patternId === 'number') {
    void queryClient.invalidateQueries({ queryKey: ['drums', 'pattern', patternId] })
    return
  }
  void queryClient.invalidateQueries({ queryKey: ['drums', 'pattern'] })
}

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

export function useDrumPattern(patternId: number) {
  return useQuery({
    queryKey: ['drums', 'pattern', patternId],
    queryFn: () => drumsApi.getPattern(patternId),
    enabled: Number.isFinite(patternId),
  })
}

export function useDrumSong() {
  return useQuery({
    queryKey: ['drums', 'song'],
    queryFn: drumsApi.getSong,
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

export function useDrumKits() {
  return useQuery({
    queryKey: ['drums', 'kits'],
    queryFn: drumsApi.getKits,
    staleTime: 60_000,
  })
}

export function useDrumActiveKit() {
  return useQuery({
    queryKey: ['drums', 'kits', 'active'],
    queryFn: drumsApi.getActiveKit,
  })
}

export function useDrumMixer() {
  const pads = useQuery({
    queryKey: ['drums', 'mixer', 'pads'],
    queryFn: drumsApi.getPadControls,
    refetchInterval: 1_000,
    staleTime: 500,
  })

  const buses = useQuery({
    queryKey: ['drums', 'mixer', 'buses'],
    queryFn: drumsApi.getBusMixer,
    refetchInterval: 1_000,
    staleTime: 500,
  })

  const master = useQuery({
    queryKey: ['drums', 'mixer', 'master'],
    queryFn: drumsApi.getMasterVolume,
    refetchInterval: 1_000,
    staleTime: 500,
  })

  return { pads, buses, master }
}

export function useDrumMetering() {
  return useQuery({
    queryKey: ['drums', 'metering'],
    queryFn: drumsApi.getMetering,
    refetchInterval: 1_000,
    staleTime: 500,
  })
}

export function useDrumMidiMapping() {
  return useQuery({
    queryKey: ['drums', 'midi', 'mapping'],
    queryFn: drumsApi.getMidiMapping,
  })
}

export function useDrumMidiLearn() {
  const status = useQuery({
    queryKey: ['drums', 'midi', 'learn'],
    queryFn: drumsApi.getMidiLearnStatus,
    refetchInterval: (query) => (query.state.data?.active ? 500 : false),
    staleTime: 250,
  })

  const presets = useQuery({
    queryKey: ['drums', 'midi', 'presets'],
    queryFn: drumsApi.getMidiPresets,
    staleTime: 60_000,
  })

  return { status, presets }
}

export function useUpdateDrumMachineState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumMachineStateUpdate) => drumsApi.updateState(payload),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useUpdateDrumTransport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumTransportUpdate) => drumsApi.setTransport(payload),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumPattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ patternId, pattern }: { patternId: number; pattern: Parameters<typeof drumsApi.setPattern>[1] }) =>
      drumsApi.setPattern(patternId, pattern),
    onSuccess: (_pattern, variables) => {
      invalidateDrumPattern(queryClient, variables.patternId)
    },
  })
}

export function useSetDrumStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: { patternId: number; instrument: number; step: number; velocity: number; accent?: boolean }) =>
      drumsApi.setStep(
        variables.patternId,
        variables.instrument,
        variables.step,
        variables.velocity,
        variables.accent ?? false,
      ),
    onSuccess: (_pattern, variables) => {
      invalidateDrumPattern(queryClient, variables.patternId)
    },
  })
}

export function useClearDrumPattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patternId: number) => drumsApi.clearPattern(patternId),
    onSuccess: (_pattern, patternId) => {
      invalidateDrumPattern(queryClient, patternId)
    },
  })
}

export function useCopyDrumPattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sourcePatternId, destinationPatternId }: { sourcePatternId: number; destinationPatternId: number }) =>
      drumsApi.copyPattern(sourcePatternId, destinationPatternId),
    onSuccess: (_pattern, variables) => {
      invalidateDrumPattern(queryClient, variables.sourcePatternId)
      invalidateDrumPattern(queryClient, variables.destinationPatternId)
    },
  })
}

export function useSetDrumSong() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (song: DrumSong) => drumsApi.setSong(song),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'song'] })
    },
  })
}

export function useAddDrumSongEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entry: DrumSongEntry) => drumsApi.addSongEntry(entry),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'song'] })
    },
  })
}

export function useRemoveDrumSongEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (position: number) => drumsApi.removeSongEntry(position),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'song'] })
    },
  })
}

export function useLoadDrumKit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (kitId: string) => drumsApi.loadKit(kitId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'kits'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'kits', 'active'] })
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumPadControl() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, params }: { padId: number; params: NonNullable<Parameters<typeof drumsApi.setPadControl>[1]> }) =>
      drumsApi.setPadControl(padId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'mixer', 'pads'] })
    },
  })
}

export function useSetDrumBusMixer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ busId, params }: { busId: number; params: DrumBusMixerUpdate }) =>
      drumsApi.setBusMixer(busId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'mixer', 'buses'] })
    },
  })
}

export function useSetDrumMasterVolume() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (volume: number) => drumsApi.setMasterVolume(volume),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'mixer', 'master'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
    },
  })
}

export function useSetDrumMidiMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mapping: DrumMidiMapping[]) => drumsApi.setMidiMapping(mapping),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'mapping'] })
    },
  })
}

export function useSetDrumVelocityCurve() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, curve }: { padId: number; curve: DrumVelocityCurve }) =>
      drumsApi.setVelocityCurve(padId, curve),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'mapping'] })
    },
  })
}

export function useStartDrumMidiLearn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (padId?: number) => drumsApi.startMidiLearn(padId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'learn'] })
    },
  })
}

export function useStopDrumMidiLearn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => drumsApi.stopMidiLearn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'learn'] })
    },
  })
}

export function useLoadDrumMidiPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (presetId: string) => drumsApi.loadMidiPreset(presetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'mapping'] })
    },
  })
}
