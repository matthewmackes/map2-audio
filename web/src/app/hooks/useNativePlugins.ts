import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { NAMStatus, CabinetStatus, ReverbStatus, CocoaDelayStatus, ZitaAT1Status, TripleSpreadStatus, ValentineStatus, ZLEqualizerStatus, ZLEqualizerBandStatus, Freeverb3Status, Freeverb3ReverbType } from '../../map2/types/native-plugins'

const DEFAULT_NAM: NAMStatus = {
  available: false,
  activeModel: null,
  mix: 100,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  availableModels: []
}

const DEFAULT_CABINET: CabinetStatus = {
  loaded: null,
  mix: 100,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  frequencyResponse: [],
  availableIRs: [],
  currentIRSize: '0 KB'
}

const DEFAULT_REVERB: ReverbStatus = {
  loaded: null,
  mix: 30,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  decayTail: [],
  availableIRs: [],
  currentDecay: 0,
  preDelay: 0
}

const DEFAULT_COCOA_DELAY: CocoaDelayStatus = {
  available: false,
  mix: 50,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  delayTime: 375,
  feedback: 40,
  drift: 0,
  ducking: 0,
  panMode: 'static',
  pan: 0,
  driveEnabled: false,
  driveAmount: 0,
  lowCut: 80,
  highCut: 12000,
  tempoSync: false,
  syncDivision: '1/4'
}

const DEFAULT_ZITA_AT1: ZitaAT1Status = {
  available: false,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 21,
  pitchError: 0,
  detectedNote: null,
  detectedFrequency: 0,
  tuning: 440,
  bias: 0.5,
  filter: 0.5,
  correction: 1.0,
  offset: 0,
  enabledNotes: [true, true, true, true, true, true, true, true, true, true, true, true],
  midiEnabled: false,
  midiChannel: 0,
  lowLatencyMode: false
}

const DEFAULT_TRIPLE_SPREAD: TripleSpreadStatus = {
  available: false,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  spread: 50,
  mix: 100
}

const DEFAULT_VALENTINE: ValentineStatus = {
  available: false,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  gainReduction: 0,
  crush: false,
  compress: 50,
  saturate: 30,
  ratio: 4,
  attack: 20,
  release: 50,
  output: 70,
  mix: 100,
  clipOutput: false
}

const DEFAULT_ZLEQUALIZER: ZLEqualizerStatus = {
  available: false,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  filterStructure: 'minimum_phase',
  outputGain: 0,
  scale: 1,
  lookahead: 0,
  phaseFlip: false,
  autoGain: false,
  staticGainComp: false,
  dynamicLearn: false,
  dynamicRelative: false,
  mix: 100,
  numBands: 24,
  activeBands: 0,
  bands: Array(24).fill(null).map((_, i) => ({
    enabled: false,
    solo: false,
    freq: 20 * Math.pow(20000 / 20, i / 23),  // Logarithmic spacing
    gain: 0,
    q: 0.707,
    filterType: 'peak' as const,
    slope: 12,
    stereoMode: 'stereo' as const,
    dynamicEnabled: false,
    targetGain: 0,
    threshold: -20,
    knee: 6,
    attack: 20,
    release: 200,
    sideChainFilterType: 'band_pass' as const,
    sideChainSlope: 12,
    sideChainFreq: 1000,
    sideChainQ: 0.707,
    bandLink: false,
    externalSideChain: false
  })),
  analyzer: {
    showPre: false,
    showPost: true,
    showSide: false,
    decaySpeed: 50,
    fftSlope: 3,
    collisionDetection: false,
    collisionStrength: 50
  },
  frequencyResponse: [],
  preSpectrum: [],
  postSpectrum: [],
  sideSpectrum: []
}

const DEFAULT_FREEVERB3: Freeverb3Status = {
  available: false,
  bypass: false,
  inputLevel: -60,
  outputLevel: -60,
  peakInput: -60,
  peakOutput: -60,
  latency: 0,
  reverbType: 'freeverb',
  roomSize: 50,
  damping: 50,
  width: 100,
  predelay: 0,
  decay: 50,
  lowCut: 20,
  highCut: 20000,
  modulation: 0,
  modFreq: 1.0,
  earlyMix: 30,
  earlySize: 50,
  mix: 30,
  outputGain: 0,
  diffusion: 70,
  spin: 50,
  wander: 50
}

export function useNativePlugins() {
  const queryClient = useQueryClient()

  const namQuery = useQuery<NAMStatus>({
    queryKey: ['native-plugins', 'nam'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/nam/status')
        if (!res.ok) throw new Error('Failed to fetch NAM status')
        return res.json()
      } catch (e) {
        console.error('NAM fetch error:', e)
        return DEFAULT_NAM
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const cabinetQuery = useQuery<CabinetStatus>({
    queryKey: ['native-plugins', 'cabinet'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/ir/status?type=cabinet')
        if (!res.ok) throw new Error('Failed to fetch cabinet status')
        return res.json()
      } catch (e) {
        console.error('Cabinet fetch error:', e)
        return DEFAULT_CABINET
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const reverbQuery = useQuery<ReverbStatus>({
    queryKey: ['native-plugins', 'reverb'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/ir/status?type=reverb')
        if (!res.ok) throw new Error('Failed to fetch reverb status')
        return res.json()
      } catch (e) {
        console.error('Reverb fetch error:', e)
        return DEFAULT_REVERB
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const cocoaDelayQuery = useQuery<CocoaDelayStatus>({
    queryKey: ['native-plugins', 'cocoa-delay'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/delay/status')
        if (!res.ok) throw new Error('Failed to fetch Cocoa Delay status')
        return res.json()
      } catch (e) {
        console.error('Cocoa Delay fetch error:', e)
        return DEFAULT_COCOA_DELAY
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const zitaAT1Query = useQuery<ZitaAT1Status>({
    queryKey: ['native-plugins', 'zita-at1'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/autotune/status')
        if (!res.ok) throw new Error('Failed to fetch Zita AT1 status')
        return res.json()
      } catch (e) {
        console.error('Zita AT1 fetch error:', e)
        return DEFAULT_ZITA_AT1
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const tripleSpreadQuery = useQuery<TripleSpreadStatus>({
    queryKey: ['native-plugins', 'triplespread'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/triplespread/status')
        if (!res.ok) throw new Error('Failed to fetch TripleSpread status')
        return res.json()
      } catch (e) {
        console.error('TripleSpread fetch error:', e)
        return DEFAULT_TRIPLE_SPREAD
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const valentineQuery = useQuery<ValentineStatus>({
    queryKey: ['native-plugins', 'valentine'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/valentine/status')
        if (!res.ok) throw new Error('Failed to fetch Valentine status')
        return res.json()
      } catch (e) {
        console.error('Valentine fetch error:', e)
        return DEFAULT_VALENTINE
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const zlEqualizerQuery = useQuery<ZLEqualizerStatus>({
    queryKey: ['native-plugins', 'zlequalizer'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/zlequalizer/status')
        if (!res.ok) throw new Error('Failed to fetch ZLEqualizer status')
        return res.json()
      } catch (e) {
        console.error('ZLEqualizer fetch error:', e)
        return DEFAULT_ZLEQUALIZER
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const freeverb3Query = useQuery<Freeverb3Status>({
    queryKey: ['native-plugins', 'freeverb3'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/freeverb3/status')
        if (!res.ok) throw new Error('Failed to fetch Freeverb3 status')
        return res.json()
      } catch (e) {
        console.error('Freeverb3 fetch error:', e)
        return DEFAULT_FREEVERB3
      }
    },
    refetchInterval: 100,
    staleTime: 0
  })

  const updateNAMModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const res = await fetch(`/api/nam/set-model/${modelName}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set NAM model')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'nam'] })
    }
  })

  const updateNAMMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/nam/set-mix/${mix}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set NAM mix')
      return res.json()
    }
  })

  const updateCabinetIRMutation = useMutation({
    mutationFn: async (irName: string) => {
      const res = await fetch(`/api/ir/set-cabinet/${irName}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set cabinet IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'cabinet'] })
    }
  })

  const updateCabinetMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/ir/set-cabinet-mix/${mix}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set cabinet mix')
      return res.json()
    }
  })

  const updateReverbIRMutation = useMutation({
    mutationFn: async (irName: string) => {
      const res = await fetch(`/api/ir/set-reverb/${irName}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set reverb IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'reverb'] })
    }
  })

  const updateReverbMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/ir/set-reverb-mix/${mix}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set reverb mix')
      return res.json()
    }
  })

  const updateCabinetBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/ir/set-cabinet-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set cabinet bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'cabinet'] })
    }
  })

  const updateReverbBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/ir/set-reverb-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set reverb bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'reverb'] })
    }
  })

  const updateNAMBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/nam/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set NAM bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'nam'] })
    }
  })

  // Navigate to next/previous IR
  const navigateCabinetIRMutation = useMutation({
    mutationFn: async (direction: 'next' | 'prev') => {
      const res = await fetch(`/api/ir/navigate-cabinet/${direction}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to navigate cabinet IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'cabinet'] })
    }
  })

  // Cocoa Delay mutations
  const updateCocoaDelayMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/delay/set-mix/${mix}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set Cocoa Delay mix')
      return res.json()
    }
  })

  const updateCocoaDelayTimeMutation = useMutation({
    mutationFn: async (time: number) => {
      const res = await fetch(`/api/delay/set-time/${time}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set delay time')
      return res.json()
    }
  })

  const updateCocoaDelayFeedbackMutation = useMutation({
    mutationFn: async (feedback: number) => {
      const res = await fetch(`/api/delay/set-feedback/${feedback}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set delay feedback')
      return res.json()
    }
  })

  const updateCocoaDelayDriftMutation = useMutation({
    mutationFn: async (drift: number) => {
      const res = await fetch(`/api/delay/set-drift/${drift}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set delay drift')
      return res.json()
    }
  })

  const updateCocoaDelayDuckingMutation = useMutation({
    mutationFn: async (ducking: number) => {
      const res = await fetch(`/api/delay/set-ducking/${ducking}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set delay ducking')
      return res.json()
    }
  })

  const updateCocoaDelayPanModeMutation = useMutation({
    mutationFn: async (mode: 'static' | 'pingpong' | 'circular') => {
      const res = await fetch(`/api/delay/set-pan-mode/${mode}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set pan mode')
      return res.json()
    }
  })

  const updateCocoaDelayDriveMutation = useMutation({
    mutationFn: async (params: { enabled: boolean; amount: number }) => {
      const res = await fetch('/api/delay/set-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error('Failed to set drive')
      return res.json()
    }
  })

  const updateCocoaDelayBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/delay/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set Cocoa Delay bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'cocoa-delay'] })
    }
  })

  // Zita AT1 mutations
  const updateZitaAT1TuningMutation = useMutation({
    mutationFn: async (tuning: number) => {
      const res = await fetch(`/api/autotune/set-tuning/${tuning}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set tuning')
      return res.json()
    }
  })

  const updateZitaAT1BiasMutation = useMutation({
    mutationFn: async (bias: number) => {
      const res = await fetch(`/api/autotune/set-bias/${bias}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set bias')
      return res.json()
    }
  })

  const updateZitaAT1FilterMutation = useMutation({
    mutationFn: async (filter: number) => {
      const res = await fetch(`/api/autotune/set-filter/${filter}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set filter')
      return res.json()
    }
  })

  const updateZitaAT1CorrectionMutation = useMutation({
    mutationFn: async (correction: number) => {
      const res = await fetch(`/api/autotune/set-correction/${correction}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set correction')
      return res.json()
    }
  })

  const updateZitaAT1OffsetMutation = useMutation({
    mutationFn: async (offset: number) => {
      const res = await fetch(`/api/autotune/set-offset/${offset}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set offset')
      return res.json()
    }
  })

  const updateZitaAT1NotesMutation = useMutation({
    mutationFn: async (notes: boolean[]) => {
      const res = await fetch('/api/autotune/set-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      if (!res.ok) throw new Error('Failed to set enabled notes')
      return res.json()
    }
  })

  const updateZitaAT1MidiMutation = useMutation({
    mutationFn: async (params: { enabled: boolean; channel: number }) => {
      const res = await fetch('/api/autotune/set-midi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error('Failed to set MIDI settings')
      return res.json()
    }
  })

  const updateZitaAT1LowLatencyMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/autotune/set-low-latency/${enabled}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set low latency mode')
      return res.json()
    }
  })

  const updateZitaAT1BypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/autotune/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set Zita AT1 bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'zita-at1'] })
    }
  })

  // TripleSpread mutations
  const updateTripleSpreadSpreadMutation = useMutation({
    mutationFn: async (spread: number) => {
      const res = await fetch(`/api/triplespread/set-spread/${spread}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set spread')
      return res.json()
    }
  })

  const updateTripleSpreadMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/triplespread/set-mix/${mix}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set mix')
      return res.json()
    }
  })

  const updateTripleSpreadBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/triplespread/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'triplespread'] })
    }
  })

  // Valentine mutations
  const updateValentineCrushMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/valentine/set-crush/${enabled}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set crush')
      return res.json()
    }
  })

  const updateValentineCompressMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-compress/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set compress')
      return res.json()
    }
  })

  const updateValentineSaturateMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-saturate/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set saturate')
      return res.json()
    }
  })

  const updateValentineRatioMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-ratio/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set ratio')
      return res.json()
    }
  })

  const updateValentineAttackMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-attack/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set attack')
      return res.json()
    }
  })

  const updateValentineReleaseMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-release/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set release')
      return res.json()
    }
  })

  const updateValentineOutputMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-output/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set output')
      return res.json()
    }
  })

  const updateValentineMixMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/valentine/set-mix/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set mix')
      return res.json()
    }
  })

  const updateValentineClipOutputMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/valentine/set-clip-output/${enabled}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set clip output')
      return res.json()
    }
  })

  const updateValentineBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/valentine/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'valentine'] })
    }
  })

  // ZLEqualizer mutations
  const updateZLEqualizerOutputGainMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/zlequalizer/set-output-gain/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set output gain')
      return res.json()
    }
  })

  const updateZLEqualizerScaleMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/zlequalizer/set-scale/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set scale')
      return res.json()
    }
  })

  const updateZLEqualizerMixMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/zlequalizer/set-mix/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set mix')
      return res.json()
    }
  })

  const updateZLEqualizerBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/zlequalizer/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'zlequalizer'] })
    }
  })

  const updateZLEqualizerAutoGainMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/zlequalizer/set-auto-gain/${enabled}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set auto gain')
      return res.json()
    }
  })

  const updateZLEqualizerBandMutation = useMutation({
    mutationFn: async (params: { bandIndex: number; settings: Partial<ZLEqualizerBandStatus> }) => {
      const res = await fetch('/api/zlequalizer/set-band', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error('Failed to set band')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'zlequalizer'] })
    }
  })

  // Freeverb3 mutations
  const updateFreeverb3ReverbTypeMutation = useMutation({
    mutationFn: async (type: Freeverb3ReverbType) => {
      const res = await fetch(`/api/freeverb3/set-reverb-type/${type}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set reverb type')
      return res.json()
    }
  })

  const updateFreeverb3RoomSizeMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-room-size/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set room size')
      return res.json()
    }
  })

  const updateFreeverb3DampingMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-damping/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set damping')
      return res.json()
    }
  })

  const updateFreeverb3WidthMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-width/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set width')
      return res.json()
    }
  })

  const updateFreeverb3PredelayMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-predelay/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set predelay')
      return res.json()
    }
  })

  const updateFreeverb3DecayMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-decay/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set decay')
      return res.json()
    }
  })

  const updateFreeverb3LowCutMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-low-cut/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set low cut')
      return res.json()
    }
  })

  const updateFreeverb3HighCutMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-high-cut/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set high cut')
      return res.json()
    }
  })

  const updateFreeverb3ModulationMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-modulation/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set modulation')
      return res.json()
    }
  })

  const updateFreeverb3ModFreqMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-mod-freq/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set mod freq')
      return res.json()
    }
  })

  const updateFreeverb3EarlyMixMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-early-mix/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set early mix')
      return res.json()
    }
  })

  const updateFreeverb3EarlySizeMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-early-size/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set early size')
      return res.json()
    }
  })

  const updateFreeverb3MixMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-mix/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set mix')
      return res.json()
    }
  })

  const updateFreeverb3OutputGainMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-output-gain/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set output gain')
      return res.json()
    }
  })

  const updateFreeverb3DiffusionMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-diffusion/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set diffusion')
      return res.json()
    }
  })

  const updateFreeverb3SpinMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-spin/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set spin')
      return res.json()
    }
  })

  const updateFreeverb3WanderMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/freeverb3/set-wander/${value}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set wander')
      return res.json()
    }
  })

  const updateFreeverb3BypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const res = await fetch(`/api/freeverb3/set-bypass/${bypass}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-plugins', 'freeverb3'] })
    }
  })

  return {
    nam: namQuery.data || DEFAULT_NAM,
    cabinet: cabinetQuery.data || DEFAULT_CABINET,
    reverb: reverbQuery.data || DEFAULT_REVERB,
    cocoaDelay: cocoaDelayQuery.data || DEFAULT_COCOA_DELAY,
    zitaAT1: zitaAT1Query.data || DEFAULT_ZITA_AT1,
    tripleSpread: tripleSpreadQuery.data || DEFAULT_TRIPLE_SPREAD,
    valentine: valentineQuery.data || DEFAULT_VALENTINE,
    zlEqualizer: zlEqualizerQuery.data || DEFAULT_ZLEQUALIZER,
    freeverb3: freeverb3Query.data || DEFAULT_FREEVERB3,
    isLoading: namQuery.isLoading || cabinetQuery.isLoading || reverbQuery.isLoading || cocoaDelayQuery.isLoading || zitaAT1Query.isLoading || tripleSpreadQuery.isLoading || valentineQuery.isLoading || zlEqualizerQuery.isLoading || freeverb3Query.isLoading,
    isError: namQuery.isError || cabinetQuery.isError || reverbQuery.isError || cocoaDelayQuery.isError || zitaAT1Query.isError || tripleSpreadQuery.isError || valentineQuery.isError || zlEqualizerQuery.isError || freeverb3Query.isError,
    updateNAMModel: updateNAMModelMutation.mutateAsync,
    updateNAMMix: updateNAMMixMutation.mutateAsync,
    updateCabinetIR: updateCabinetIRMutation.mutateAsync,
    updateCabinetMix: updateCabinetMixMutation.mutateAsync,
    updateCabinetBypass: updateCabinetBypassMutation.mutateAsync,
    updateReverbIR: updateReverbIRMutation.mutateAsync,
    updateReverbMix: updateReverbMixMutation.mutateAsync,
    updateReverbBypass: updateReverbBypassMutation.mutateAsync,
    updateNAMBypass: updateNAMBypassMutation.mutateAsync,
    navigateCabinetIR: navigateCabinetIRMutation.mutateAsync,
    // Cocoa Delay
    updateCocoaDelayMix: updateCocoaDelayMixMutation.mutateAsync,
    updateCocoaDelayTime: updateCocoaDelayTimeMutation.mutateAsync,
    updateCocoaDelayFeedback: updateCocoaDelayFeedbackMutation.mutateAsync,
    updateCocoaDelayDrift: updateCocoaDelayDriftMutation.mutateAsync,
    updateCocoaDelayDucking: updateCocoaDelayDuckingMutation.mutateAsync,
    updateCocoaDelayPanMode: updateCocoaDelayPanModeMutation.mutateAsync,
    updateCocoaDelayDrive: updateCocoaDelayDriveMutation.mutateAsync,
    updateCocoaDelayBypass: updateCocoaDelayBypassMutation.mutateAsync,
    // Zita AT1
    updateZitaAT1Tuning: updateZitaAT1TuningMutation.mutateAsync,
    updateZitaAT1Bias: updateZitaAT1BiasMutation.mutateAsync,
    updateZitaAT1Filter: updateZitaAT1FilterMutation.mutateAsync,
    updateZitaAT1Correction: updateZitaAT1CorrectionMutation.mutateAsync,
    updateZitaAT1Offset: updateZitaAT1OffsetMutation.mutateAsync,
    updateZitaAT1Notes: updateZitaAT1NotesMutation.mutateAsync,
    updateZitaAT1Midi: updateZitaAT1MidiMutation.mutateAsync,
    updateZitaAT1LowLatency: updateZitaAT1LowLatencyMutation.mutateAsync,
    updateZitaAT1Bypass: updateZitaAT1BypassMutation.mutateAsync,
    // TripleSpread
    updateTripleSpreadSpread: updateTripleSpreadSpreadMutation.mutateAsync,
    updateTripleSpreadMix: updateTripleSpreadMixMutation.mutateAsync,
    updateTripleSpreadBypass: updateTripleSpreadBypassMutation.mutateAsync,
    // Valentine
    updateValentineCrush: updateValentineCrushMutation.mutateAsync,
    updateValentineCompress: updateValentineCompressMutation.mutateAsync,
    updateValentineSaturate: updateValentineSaturateMutation.mutateAsync,
    updateValentineRatio: updateValentineRatioMutation.mutateAsync,
    updateValentineAttack: updateValentineAttackMutation.mutateAsync,
    updateValentineRelease: updateValentineReleaseMutation.mutateAsync,
    updateValentineOutput: updateValentineOutputMutation.mutateAsync,
    updateValentineMix: updateValentineMixMutation.mutateAsync,
    updateValentineClipOutput: updateValentineClipOutputMutation.mutateAsync,
    updateValentineBypass: updateValentineBypassMutation.mutateAsync,
    // ZLEqualizer
    updateZLEqualizerOutputGain: updateZLEqualizerOutputGainMutation.mutateAsync,
    updateZLEqualizerScale: updateZLEqualizerScaleMutation.mutateAsync,
    updateZLEqualizerMix: updateZLEqualizerMixMutation.mutateAsync,
    updateZLEqualizerBypass: updateZLEqualizerBypassMutation.mutateAsync,
    updateZLEqualizerAutoGain: updateZLEqualizerAutoGainMutation.mutateAsync,
    updateZLEqualizerBand: updateZLEqualizerBandMutation.mutateAsync,
    // Freeverb3
    updateFreeverb3ReverbType: updateFreeverb3ReverbTypeMutation.mutateAsync,
    updateFreeverb3RoomSize: updateFreeverb3RoomSizeMutation.mutateAsync,
    updateFreeverb3Damping: updateFreeverb3DampingMutation.mutateAsync,
    updateFreeverb3Width: updateFreeverb3WidthMutation.mutateAsync,
    updateFreeverb3Predelay: updateFreeverb3PredelayMutation.mutateAsync,
    updateFreeverb3Decay: updateFreeverb3DecayMutation.mutateAsync,
    updateFreeverb3LowCut: updateFreeverb3LowCutMutation.mutateAsync,
    updateFreeverb3HighCut: updateFreeverb3HighCutMutation.mutateAsync,
    updateFreeverb3Modulation: updateFreeverb3ModulationMutation.mutateAsync,
    updateFreeverb3ModFreq: updateFreeverb3ModFreqMutation.mutateAsync,
    updateFreeverb3EarlyMix: updateFreeverb3EarlyMixMutation.mutateAsync,
    updateFreeverb3EarlySize: updateFreeverb3EarlySizeMutation.mutateAsync,
    updateFreeverb3Mix: updateFreeverb3MixMutation.mutateAsync,
    updateFreeverb3OutputGain: updateFreeverb3OutputGainMutation.mutateAsync,
    updateFreeverb3Diffusion: updateFreeverb3DiffusionMutation.mutateAsync,
    updateFreeverb3Spin: updateFreeverb3SpinMutation.mutateAsync,
    updateFreeverb3Wander: updateFreeverb3WanderMutation.mutateAsync,
    updateFreeverb3Bypass: updateFreeverb3BypassMutation.mutateAsync
  }
}
