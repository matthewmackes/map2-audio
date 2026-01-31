export interface NAMStatus {
  available: boolean
  activeModel: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  availableModels: string[]
}

export interface CabinetStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  frequencyResponse: Array<{ freq: number; magnitude: number }>
  availableIRs: Array<{ name: string; size: string; length: number }>
  currentIRSize: string
}

export interface ReverbStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  decayTail: Array<{ time: number; amplitude: number }>
  availableIRs: Array<{ name: string; type: string; decay: number }>
  currentDecay: number
  preDelay: number
}

export interface CocoaDelayStatus {
  available: boolean
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // Core delay parameters
  delayTime: number       // ms (0-2000)
  feedback: number        // % (0-100)
  // Cocoa Delay special features
  drift: number           // Delay time drift/wow-flutter (0-100)
  ducking: number         // Wet level ducking amount (0-100)
  panMode: 'static' | 'pingpong' | 'circular'
  pan: number             // Stereo pan position (-100 to 100)
  // Drive section
  driveEnabled: boolean
  driveAmount: number     // (0-100)
  // Filter
  lowCut: number          // Hz (20-2000)
  highCut: number         // Hz (1000-20000)
  // Tempo sync
  tempoSync: boolean
  syncDivision: string    // "1/4", "1/8", etc.
}

export interface ZitaAT1Status {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // Pitch detection
  pitchError: number          // Current pitch error in cents (-100 to 100)
  detectedNote: string | null // Current detected note (e.g., "A4", "C#3")
  detectedFrequency: number   // Detected frequency in Hz
  // Main controls
  tuning: number              // Reference frequency for A (typically 440 Hz, range 430-450)
  bias: number                // Preference for current note (0-1)
  filter: number              // Smoothing amount (0-1)
  correction: number          // How much pitch error gets corrected (0-1, 0=none, 1=full)
  offset: number              // Pitch offset in cents (-200 to 200, i.e., +/- 2 semitones)
  // Note selection (which notes are valid targets)
  enabledNotes: boolean[]     // 12 booleans for C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  // MIDI control
  midiEnabled: boolean
  midiChannel: number         // 0 = Omni, 1-16 = specific channel
  // Mode
  lowLatencyMode: boolean     // Reduces latency from ~21ms to ~10.5ms
}

// TripleSpread - Airwindows stereo width effect
// Spreads frequencies across the stereo field in three bands
export interface TripleSpreadStatus {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // TripleSpread parameters
  spread: number              // Stereo spread amount (0-100)
  mix: number                 // Wet/dry mix (0-100)
}

// Valentine - Tote Bag Labs compressor/saturator
// Aggressive compression and saturation inspired by the Justice sound
// Signal path: Crush -> Compress -> Saturate -> Soft Clip -> Output -> Mix
export interface ValentineStatus {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  gainReduction: number       // Current gain reduction in dB
  // Valentine parameters
  crush: boolean              // Bit crushing/downsampling to 27.5kHz
  compress: number            // Gain before compression (0-100)
  saturate: number            // Pre-waveshaper gain (0-100)
  ratio: number               // Compression ratio (1-1000, 1000 = infinity)
  attack: number              // Attack time (0-100)
  release: number             // Release time (0-100)
  output: number              // Wet signal output gain (0-100)
  mix: number                 // Wet/dry mix (0-100)
  clipOutput: boolean         // Enable output clipping
}

// ZLEqualizer - ZL-Audio dynamic parametric equalizer
// 24-band dynamic EQ with multiple filter types, stereo modes, and side-chain
// Filter structures available
export type ZLFilterStructure = 'minimum_phase' | 'state_variable' | 'parallel' | 'matched_phase' | 'mixed_phase' | 'zero_phase'
export type ZLFilterType = 'peak' | 'low_shelf' | 'low_pass' | 'high_shelf' | 'high_pass' | 'notch' | 'band_pass' | 'tilt_shelf'
export type ZLStereoMode = 'stereo' | 'left' | 'right' | 'mid' | 'side'
export type ZLSideChainFilterType = 'band_pass' | 'low_pass' | 'high_pass'

export interface ZLEqualizerBandStatus {
  enabled: boolean
  solo: boolean               // Solo this band
  freq: number                // Frequency in Hz (20-20000)
  gain: number                // Base gain in dB (-30 to 30)
  q: number                   // Q factor (0.1-20)
  filterType: ZLFilterType
  slope: number               // dB/oct (6, 12, 24, 36, 48, 72, 96)
  stereoMode: ZLStereoMode
  // Dynamic EQ parameters
  dynamicEnabled: boolean
  targetGain: number          // Target gain for dynamic EQ (-30 to 30 dB)
  threshold: number           // Threshold in dB (-60 to 0)
  knee: number                // Knee in dB (0-30)
  attack: number              // Attack in ms (0-500)
  release: number             // Release in ms (0-5000)
  // Side-chain parameters per band
  sideChainFilterType: ZLSideChainFilterType
  sideChainSlope: number      // Side-chain filter slope (6-96 dB/oct)
  sideChainFreq: number       // Side-chain filter frequency
  sideChainQ: number          // Side-chain filter Q
  bandLink: boolean           // Link band to side-chain
  externalSideChain: boolean  // Use external side-chain input
}

export interface ZLEqualizerAnalyzerSettings {
  showPre: boolean            // Show pre-EQ spectrum
  showPost: boolean           // Show post-EQ spectrum
  showSide: boolean           // Show side-chain spectrum
  decaySpeed: number          // Analyzer decay speed (0-100)
  fftSlope: number            // FFT tilt slope (0, 3, 4.5 dB/oct)
  collisionDetection: boolean // Enable collision detection
  collisionStrength: number   // Collision detection strength (0-100)
}

export interface ZLEqualizerStatus {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // Global parameters
  filterStructure: ZLFilterStructure  // Global filter structure
  outputGain: number          // Output gain in dB (-24 to 24)
  scale: number               // Scale multiplier for all gains (0-2)
  lookahead: number           // Lookahead in ms (0-20)
  phaseFlip: boolean          // Invert output phase
  autoGain: boolean           // Auto gain compensation (AGC)
  staticGainComp: boolean     // Static gain compensation (SGC)
  dynamicLearn: boolean       // Dynamic threshold/knee learning
  dynamicRelative: boolean    // Dynamic relative mode (volume sensitivity)
  mix: number                 // Wet/dry mix (0-100)
  // Band data
  numBands: number            // Total bands (24)
  activeBands: number         // Number of enabled bands
  bands: ZLEqualizerBandStatus[]
  // Analyzer settings
  analyzer: ZLEqualizerAnalyzerSettings
  // Analyzer data for visualization
  frequencyResponse: Array<{ freq: number; magnitude: number }>
  preSpectrum: Array<{ freq: number; magnitude: number }>
  postSpectrum: Array<{ freq: number; magnitude: number }>
  sideSpectrum: Array<{ freq: number; magnitude: number }>
}

// dm-Whammy - Pitch shifting effect inspired by DigiTech Whammy
// Mono pitch shifter with ±24 semitone range
export interface WhammyStatus {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // Whammy parameters
  pitch: number                 // Pitch shift in semitones (-24 to +24, default 12)
  dry: number                   // Dry level in dB (-70 to 6, default -70)
  wet: number                   // Wet level in dB (-70 to 6, default 0)
}

// Freeverb3 - GNU algorithmic reverb library
// High-quality reverb algorithms with SIMD optimization
export type Freeverb3ReverbType = 'freeverb' | 'strev' | 'nrev' | 'progenitor' | 'zrev' | 'earlyref'

export interface Freeverb3Status {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  // Reverb type selection
  reverbType: Freeverb3ReverbType
  // Common reverb parameters
  roomSize: number            // Room size (0-100)
  damping: number             // High frequency damping (0-100)
  width: number               // Stereo width (0-100)
  predelay: number            // Pre-delay in ms (0-200)
  decay: number               // Decay time (0-100)
  // Tone controls
  lowCut: number              // Low cut frequency Hz (20-500)
  highCut: number             // High cut frequency Hz (1000-20000)
  // Modulation
  modulation: number          // Modulation depth (0-100)
  modFreq: number             // Modulation frequency Hz (0.1-10)
  // Early reflections
  earlyMix: number            // Early reflections mix (0-100)
  earlySize: number           // Early reflections size (0-100)
  // Output
  mix: number                 // Wet/dry mix (0-100)
  outputGain: number          // Output gain in dB (-24 to 24)
  // Diffusion
  diffusion: number           // Diffusion amount (0-100)
  // Spin/wander (for certain algorithms)
  spin: number                // Spin amount (0-100)
  wander: number              // Wander amount (0-100)
}

// Dragonfly Reverb - Michael Willis' algorithmic reverb suite
// 4 variants: Hall, Room, Plate, and Early Reflections
export type DragonflyReverbVariant = 'hall' | 'room' | 'plate' | 'early'
export type DragonflyPlateAlgorithm = 'simple' | 'nested' | 'tank'

export interface DragonflyPreset {
  name: string
  bank: string
  variant: DragonflyReverbVariant
}

export interface DragonflyStatus {
  available: boolean
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number

  // Variant selection
  variant: DragonflyReverbVariant

  // Common parameters (all variants)
  dryLevel: number            // dB (-80 to 0)
  wetLevel: number            // dB (-80 to 0)
  width: number               // % (50-150)
  predelay: number            // ms (0-100)
  decay: number               // seconds (0.1-10)
  lowCut: number              // Hz (0-200)
  highCut: number             // Hz (1000-16000)

  // Hall-specific parameters
  size: number                // meters (10-60 Hall, 8-32 Room, 10-60 Early)
  diffuse: number             // % (0-100)
  earlyLevel: number          // dB (-80 to 0)
  earlySend: number           // % (0-100)
  lateLevel: number           // dB (-80 to 0)
  lowXover: number            // Hz (50-1000)
  highXover: number           // Hz (1000-16000)
  lowMult: number             // multiplier (0.5-2.5)
  highMult: number            // multiplier (0.2-1.2)
  spin: number                // Hz (0-5 Room, 0-10 Hall)
  wander: number              // % (0-100)
  modulation: number          // % (0-100) - Hall only

  // Plate-specific parameters
  algorithm: DragonflyPlateAlgorithm
  dampen: number              // % (0-100)

  // Room-specific parameters
  bassBoost: number           // % (0-100)
  boostFreq: number           // Hz (50-1050)
  earlyDamp: number           // Hz (1000-16000)
  lateDamp: number            // Hz (1000-16000)

  // Early Reflections-specific
  program: number             // Program index (0-7)

  // Preset info
  currentPreset: string | null
  currentBank: string | null
  availablePresets: DragonflyPreset[]
  earlyPrograms: string[]
}
