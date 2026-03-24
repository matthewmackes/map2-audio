import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { drumsApi } from '@/map2/api'
import type {
  DrumBusMixerUpdate,
  DrumCcLearnStatus,
  DrumCcMapping,
  DrumKitInstrumentPatch,
  DrumMachineStateUpdate,
  DrumMasterFxState,
  DrumMidiMapping,
  DrumMidiOutputConfig,
  DrumMidiZones,
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

export function useDrumPosition() {
  return useQuery({
    queryKey: ['drums', 'position'],
    queryFn: drumsApi.getPosition,
    refetchInterval: 250,
    staleTime: 100,
  })
}

export function useDrumSong() {
  return useQuery({
    queryKey: ['drums', 'song'],
    queryFn: drumsApi.getSong,
  })
}

export function useDrumSongTransport() {
  return useQuery({
    queryKey: ['drums', 'song', 'transport'],
    queryFn: drumsApi.getSongTransport,
    refetchInterval: (query) => (query.state.data?.is_playing ? 250 : 1_000),
    staleTime: 100,
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

export function useDrumMasterFx() {
  return useQuery({
    queryKey: ['drums', 'master-fx'],
    queryFn: drumsApi.getMasterFx,
  })
}

export function useDrumSynthParams(padId: number) {
  return useQuery({
    queryKey: ['drums', 'state', 'pad-synth-params', padId],
    queryFn: async () => {
      const state = await drumsApi.getState()
      return state.pad_synth_params[padId]
    },
    enabled: Number.isFinite(padId) && padId >= 0,
    staleTime: 5_000,
  })
}

export function useDrumPadFilter(padId: number) {
  return useQuery({
    queryKey: ['drums', 'state', 'pad-filter', padId],
    queryFn: async () => {
      const state = await drumsApi.getState()
      return state.pad_filters[padId]
    },
    enabled: Number.isFinite(padId) && padId >= 0,
    staleTime: 5_000,
  })
}

export function useDrumSampleEditor(padId: number, points = 256) {
  const queryClient = useQueryClient()

  const waveform = useQuery({
    queryKey: ['drums', 'sample-editor', padId, points],
    queryFn: () => drumsApi.getPadSampleWaveform(padId, points),
    enabled: Number.isFinite(padId) && padId >= 0,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['drums', 'sample-editor', padId] })
    void queryClient.invalidateQueries({ queryKey: ['drums', 'kits', 'active'] })
    void queryClient.invalidateQueries({ queryKey: ['drums', 'kits'] })
  }

  const upload = useMutation({
    mutationFn: ({ padId: nextPadId, file }: { padId: number; file: File }) => drumsApi.uploadPadSample(nextPadId, file),
    onSuccess: invalidate,
  })

  const startRecording = useMutation({
    mutationFn: (nextPadId: number) => drumsApi.startPadRecording(nextPadId),
  })

  const stopRecording = useMutation({
    mutationFn: (nextPadId: number) => drumsApi.stopPadRecording(nextPadId),
    onSuccess: invalidate,
  })

  const trim = useMutation({
    mutationFn: ({ padId: nextPadId, startSample, endSample }: { padId: number; startSample: number; endSample: number }) =>
      drumsApi.trimPadSample(nextPadId, startSample, endSample),
    onSuccess: invalidate,
  })

  const normalize = useMutation({
    mutationFn: ({ padId: nextPadId, targetPeak }: { padId: number; targetPeak?: number }) =>
      drumsApi.normalizePadSample(nextPadId, targetPeak),
    onSuccess: invalidate,
  })

  const reverse = useMutation({
    mutationFn: (nextPadId: number) => drumsApi.reversePadSample(nextPadId),
    onSuccess: invalidate,
  })

  const fade = useMutation({
    mutationFn: ({ padId: nextPadId, fadeInMs, fadeOutMs }: { padId: number; fadeInMs: number; fadeOutMs: number }) =>
      drumsApi.fadePadSample(nextPadId, fadeInMs, fadeOutMs),
    onSuccess: invalidate,
  })

  return {
    waveform,
    upload,
    startRecording,
    stopRecording,
    trim,
    normalize,
    reverse,
    fade,
  }
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
  const mapping = useQuery({
    queryKey: ['drums', 'midi', 'mapping'],
    queryFn: drumsApi.getMidiMapping,
  })

  const velocityCurves = useQuery({
    queryKey: ['drums', 'midi', 'velocity-curves'],
    queryFn: drumsApi.getVelocityCurves,
  })

  const zones = useQuery({
    queryKey: ['drums', 'midi', 'zones'],
    queryFn: drumsApi.getMidiZones,
  })

  return { mapping, velocityCurves, zones }
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

export function useDrumCcMapping() {
  const mappings = useDrumCcMappings()

  const learn = useQuery({
    queryKey: ['drums', 'midi', 'cc-learn'],
    queryFn: drumsApi.getCcLearnStatus,
    refetchInterval: (query) => (query.state.data?.active ? 500 : false),
    staleTime: 250,
  })

  return { mappings, learn }
}

export function useDrumCcMappings() {
  return useQuery({
    queryKey: ['drums', 'midi', 'cc-mappings'],
    queryFn: drumsApi.getCcMappings,
  })
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

export function useSetDrumPadSoundSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, source }: { padId: number; source: Parameters<typeof drumsApi.setPadSoundSource>[1] }) =>
      drumsApi.setPadSoundSource(padId, source),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumPadSynthParams() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, params }: { padId: number; params: Parameters<typeof drumsApi.setPadSynthParams>[1] }) =>
      drumsApi.setPadSynthParams(padId, params),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumPadFilter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, filter }: { padId: number; filter: Parameters<typeof drumsApi.setPadFilter>[1] }) =>
      drumsApi.setPadFilter(padId, filter),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumPadCvGateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ padId, config }: { padId: number; config: Parameters<typeof drumsApi.setPadCvGateConfig>[1] }) =>
      drumsApi.setPadCvGateConfig(padId, config),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumMidiOutputConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumMidiOutputConfig) => drumsApi.setMidiOutputConfig(payload),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumCcMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumCcMapping) => drumsApi.setCcMappings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'cc-mappings'] })
    },
  })
}

export function useStartDrumCcLearn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slot, timeoutSeconds = 10 }: { slot: number; timeoutSeconds?: number }) =>
      drumsApi.startCcLearn(slot, timeoutSeconds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'cc-learn'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'cc-mappings'] })
    },
  })
}

export function useStopDrumCcLearn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (): Promise<DrumCcLearnStatus> => drumsApi.stopCcLearn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'cc-learn'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'cc-mappings'] })
    },
  })
}

export function useSetDrumTrackSwing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ instrument, swing }: { instrument: number; swing: number }) => drumsApi.setTrackSwing(instrument, swing),
    onSuccess: () => {
      invalidateDrumState(queryClient)
    },
  })
}

export function useSetDrumTrackLength() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ patternId, instrument, length }: { patternId: number; instrument: number; length: number }) =>
      drumsApi.setTrackLength(patternId, instrument, length),
    onSuccess: (_pattern, variables) => {
      invalidateDrumPattern(queryClient, variables.patternId)
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
    mutationFn: (variables: {
      patternId: number
      instrument: number
      step: number
      velocity: number
      accent?: boolean
      micro_timing?: number
      probability?: number
      ratchet_count?: number
      ratchet_decay?: number
      lock_pitch?: number | null
      lock_filter_cutoff?: number | null
      lock_decay?: number | null
      lock_pan?: number | null
      lock_volume?: number | null
    }) =>
      drumsApi.setStep(
        variables.patternId,
        variables.instrument,
        variables.step,
        variables.velocity,
        variables.accent ?? false,
        {
          micro_timing: variables.micro_timing,
          probability: variables.probability,
          ratchet_count: variables.ratchet_count,
          ratchet_decay: variables.ratchet_decay,
          lock_pitch: variables.lock_pitch,
          lock_filter_cutoff: variables.lock_filter_cutoff,
          lock_decay: variables.lock_decay,
          lock_pan: variables.lock_pan,
          lock_volume: variables.lock_volume,
        },
      ),
    onSuccess: (_pattern, variables) => {
      invalidateDrumPattern(queryClient, variables.patternId)
    },
  })
}

export function useTriggerDrumFill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => drumsApi.triggerFill(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'position'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
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

export function usePlayDrumSongTransport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => drumsApi.playSongTransport(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'song', 'transport'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'position'] })
      invalidateDrumState(queryClient)
    },
  })
}

export function useStopDrumSongTransport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => drumsApi.stopSongTransport(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'song', 'transport'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'position'] })
      invalidateDrumState(queryClient)
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

export function usePatchDrumKitInstrument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ kitId, padId, patch }: { kitId: string; padId: number; patch: DrumKitInstrumentPatch }) =>
      drumsApi.patchKitInstrument(kitId, padId, patch),
    onSuccess: (_kit, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'kits'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'kits', 'active'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'mixer', 'pads'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'kits', variables.kitId] })
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

export function useSetDrumMasterFx() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: DrumMasterFxState) => drumsApi.setMasterFx(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'master-fx'] })
    },
  })
}

export function useSetDrumMidiMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mapping: DrumMidiMapping) => drumsApi.setMidiMapping(mapping),
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
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'velocity-curves'] })
    },
  })
}

export function useSetDrumMidiZones() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (zones: DrumMidiZones) => drumsApi.setMidiZones(zones),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'zones'] })
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
    mutationFn: (presetName: string) => drumsApi.loadMidiPreset(presetName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'mapping'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'midi', 'zones'] })
    },
  })
}
