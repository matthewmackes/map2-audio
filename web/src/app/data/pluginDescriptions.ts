/**
 * LV2 Plugin Descriptions
 * Curated descriptions for common LV2 plugins based on official documentation
 */

// Pattern-based descriptions (matches plugin name patterns)
export const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  // Neural Amp Modeler
  'Neural Amp Modeler': 'AI-powered guitar amp modeling using deep learning. Captures the exact tone and dynamics of real amplifiers.',
  'NeuralAmpModeler': 'AI-powered guitar amp modeling using deep learning. Captures the exact tone and dynamics of real amplifiers.',
  'NAM': 'Neural Amp Modeler - AI-powered guitar amp modeling that captures real amplifier characteristics.',

  // Calf Studio Gear - Dynamics
  'Calf Compressor': 'Smooth sounding dynamic compressor with versatile settings for transparent gain control.',
  'Calf Sidechain Compressor': 'Compressor with external sidechain input for ducking and pumping effects.',
  'Calf Multiband Compressor': 'Four-band dynamics processor for precise frequency-dependent compression.',
  'Calf Mono Compressor': 'Single-channel compressor optimized for mono sources.',
  'Calf Limiter': 'Brick-wall limiter for preventing clipping and maximizing loudness.',
  'Calf Multiband Limiter': 'Frequency-selective limiting for mastering and loudness control.',
  'Calf Gate': 'Noise gate for eliminating unwanted background noise and bleed.',
  'Calf Sidechain Gate': 'Gate with external trigger input for creative gating effects.',
  'Calf Multiband Gate': 'Frequency-selective gating for precise noise control.',
  'Calf Deesser': 'Specialized compressor for reducing harsh sibilance in vocals.',
  'Calf Transient Designer': 'Shapes attack and sustain characteristics of percussive sounds.',

  // Calf Studio Gear - EQ & Filters
  'Calf Equalizer 5 Band': 'Five-band parametric EQ with high/low shelves and analyzer.',
  'Calf Equalizer 8 Band': 'Eight-band parametric EQ with shelves, pass filters, and four peak bands.',
  'Calf Equalizer 12 Band': 'Twelve-band parametric EQ for detailed frequency shaping.',
  'Calf Equalizer 30 Band': 'Thirty-band graphic equalizer for precise tonal adjustment.',
  'Calf Filter': 'Versatile filter with multiple modes including lowpass, highpass, and bandpass.',
  'Calf Filterclavier': 'Keyboard-controlled filter for expressive sound design.',
  'Calf Envelope Filter': 'Auto-wah filter that responds to input dynamics.',
  'Calf Vocoder': 'Classic vocoder effect for robotic voice and synthesizer effects.',
  'Calf Emphasis': 'Pre-emphasis and de-emphasis filter for noise reduction systems.',

  // Calf Studio Gear - Reverb & Delay
  'Calf Reverb': 'Natural sounding reverb with smooth decay, ideal for vocals and instruments.',
  'Calf Vintage Delay': 'Analog-style delay with tape-like warmth and modulation.',
  'Calf Reverberator': 'Lush algorithmic reverb for ambient and spatial effects.',
  'Calf Multi Chorus': 'Rich chorus effect with multiple voices for thick ensemble sounds.',
  'Calf Phaser': 'Classic phaser effect with sweeping notch filters.',
  'Calf Flanger': 'Jet-like flanging effect with adjustable feedback and depth.',
  'Calf Rotary Speaker': 'Leslie speaker simulation for organ and guitar tones.',

  // Calf Studio Gear - Distortion
  'Calf Bass Enhancer': 'Adds harmonic bass content for fuller low-end presence.',
  'Calf Exciter': 'Harmonic exciter for adding presence and air to recordings.',
  'Calf Saturator': 'Analog-style saturation for warmth and harmonic richness.',
  'Calf Tape Simulator': 'Tape machine emulation with compression and harmonic coloration.',
  'Calf Crusher': 'Bit crusher and sample rate reducer for lo-fi effects.',
  'Calf Vinyl': 'Vinyl record simulation with crackle, dust, and wow/flutter.',

  // Calf Studio Gear - Instruments
  'Calf Monosynth': 'Monophonic synthesizer with classic analog-style oscillators.',
  'Calf Organ': 'Drawbar organ with rotary speaker simulation.',
  'Calf Fluidsynth': 'SoundFont (SF2) sample player for realistic instrument sounds.',
  'Calf Wavetable': 'Wavetable synthesizer for evolving digital tones.',

  // Keyboard Sampler (Sfizz)
  'Keyboard Sampler': 'Professional keyboard sampler with integrated soundfont browser. Supports SFZ v1/v2 and SF2 formats with ARIA extensions.',
  'Sfizz': 'Professional keyboard sampler with integrated soundfont browser. Supports SFZ v1/v2 and SF2 formats with ARIA extensions.',
  'sfizz': 'Professional keyboard sampler with integrated soundfont browser. Supports SFZ v1/v2 and SF2 formats with ARIA extensions.',

  // REEV-R Reverb
  'REEV-R': 'Algorithmic reverb with smooth decay, rich modulation, and space presets inspired by FabFilter Pro-R.',
  'REEV R': 'Algorithmic reverb with smooth decay, rich modulation, and space presets inspired by FabFilter Pro-R.',

  // Outotune
  'Outotune': 'Real-time pitch correction with key/scale selection, piano roll note enable, and formant preservation.',
  'outotune': 'Real-time pitch correction with key/scale selection, piano roll note enable, and formant preservation.',

  // dm-Whammy
  'dm-Whammy': 'Expression-controlled pitch shifter with DigiTech Whammy-style modes including octave, harmony, and dive bomb.',
  'Whammy': 'Expression-controlled pitch shifter with classic Whammy modes and harmony intervals.',

  // Calf Studio Gear - Utilities
  'Calf Analyzer': 'Real-time spectrum analyzer for frequency visualization.',
  'Calf Stereo Tools': 'Mid/side processing and stereo width control.',
  'Calf Mono Input': 'Mono-to-stereo converter with panning.',
  'Calf X-Over 2 Band': 'Two-band crossover for splitting signals by frequency.',
  'Calf X-Over 3 Band': 'Three-band crossover for multiband processing.',
  'Calf X-Over 4 Band': 'Four-band crossover for detailed frequency splitting.',
  'Calf Pulsator': 'Tremolo and auto-panning effect with tempo sync.',
  'Calf Ring Modulator': 'Classic ring modulation for metallic and bell-like tones.',
  'Calf Haas Stereo Enhancer': 'Stereo widening using the Haas effect.',

  // LSP Plugins - Dynamics
  'LSP Compressor': 'Professional compressor with precise control and metering.',
  'LSP Multiband Compressor': 'Multi-band dynamics processor for mastering-grade compression.',
  'LSP Dynamic Processor': 'Advanced dynamics with upward/downward compression and expansion.',
  'LSP Expander': 'Downward expander for noise reduction and dynamics control.',
  'LSP Gate': 'Precision noise gate with adjustable attack, hold, and release.',
  'LSP Multiband Gate': 'Frequency-selective gating for complex noise control.',
  'LSP Limiter': 'Brick-wall limiter with true-peak detection for broadcast compliance.',
  'LSP Multiband Limiter': 'Multi-band limiting with true-peak modes for mastering.',
  'LSP GOTT Compressor': 'Grand Over-The-Top compressor for extreme dynamics control.',
  'LSP Clipper': 'Soft and hard clipping for controlled distortion and limiting.',
  'LSP Multiband Clipper': 'Frequency-selective clipping for transparent loudness.',

  // LSP Plugins - EQ
  'LSP Parametric Equalizer': 'High-precision parametric EQ with up to 32 bands.',
  'LSP Graphic Equalizer': 'Classic graphic EQ with multiple band configurations.',
  'LSP Filter': 'Versatile filter plugin with multiple topologies.',

  // LSP Plugins - Reverb & Delay
  'LSP Impulse Reverb': 'Convolution reverb for realistic acoustic spaces.',
  'LSP Room Builder': 'Room simulation with customizable geometry.',
  'LSP Artistic Delay': 'Creative delay with tempo sync and modulation.',
  'LSP Compensation Delay': 'Sample-accurate delay for time alignment.',
  'LSP Slap-back Delay': 'Short delay for doubling and slapback effects.',

  // LSP Plugins - Modulation
  'LSP Chorus': 'Lush chorus effect with multiple voices.',
  'LSP Flanger': 'Classic flanging with adjustable modulation.',

  // LSP Plugins - Utilities
  'LSP Spectrum Analyzer': 'High-resolution spectrum analysis and metering.',
  'LSP Oscilloscope': 'Real-time waveform visualization.',
  'LSP Phase Detector': 'Phase correlation analysis for stereo signals.',
  'LSP Crossover': 'Linear-phase crossover for multi-band processing.',
  'LSP Mixer': 'Utility mixer with gain and routing.',
  'LSP Latency Meter': 'Round-trip latency measurement tool.',
  'LSP Loudness Compensator': 'Volume-matched A/B comparison tool.',
  'LSP Noise Generator': 'White, pink, and brown noise generator.',
  'LSP Oscillator': 'Test tone generator with multiple waveforms.',
  'LSP Profiler': 'Impulse response capture tool.',
  'LSP Surge Filter': 'DC offset and subsonic rumble filter.',
  'LSP Automatic Gain Control': 'Auto-leveling for consistent volume.',
  'LSP A/B Test': 'Blind A/B comparison plugin.',
  'LSP Send': 'Auxiliary send for parallel processing.',
  'LSP Return': 'Auxiliary return for parallel processing.',
  'LSP Referencer': 'Reference track player for mixing.',

  // LSP Plugins - Samplers
  'LSP Sampler': 'Multi-sample drum and percussion player.',
  'LSP Multisampler': 'Advanced multi-sample instrument.',

  // Guitarix / GxPlugins
  'GxAmplifier': 'Virtual guitar amplifier with tube simulation.',
  'Gx': 'Guitarix effect - virtual guitar amp and effects.',
  'GxTuner': 'Chromatic tuner for guitar and bass.',
  'GxCabinet': 'Cabinet simulation with impulse responses.',
  'GxToneStack': 'Classic amp tone stack EQ modeling.',
  'GxOverdrive': 'Tube overdrive pedal simulation.',
  'GxDistortion': 'High-gain distortion effect.',
  'GxFuzz': 'Classic fuzz pedal emulation.',
  'GxCompressor': 'Guitar-focused compressor.',
  'GxChorus': 'Chorus effect for guitar.',
  'GxFlanger': 'Flanger effect for guitar.',
  'GxPhaser': 'Phaser effect for guitar.',
  'GxTremolo': 'Tremolo effect with multiple waveforms.',
  'GxReverb': 'Reverb optimized for guitar.',
  'GxDelay': 'Delay effect for guitar.',
  'GxWah': 'Wah pedal simulation.',
  'GxBooster': 'Clean boost for driving amp input.',

  // ZamAudio
  'ZaMaximX2': 'Stereo brickwall limiter and maximizer for mastering.',
  'ZamComp': 'Smooth compressor with vintage character.',
  'ZamCompX2': 'Stereo version of the ZamComp compressor.',
  'ZaMultiComp': 'Three-band compressor for multiband dynamics.',
  'ZaMultiCompX2': 'Stereo multiband compressor.',
  'ZamTube': 'Tube amplifier warmth and saturation.',
  'ZamEQ2': 'Two-band parametric equalizer.',
  'ZamGEQ31': 'Thirty-one band graphic equalizer.',
  'ZamGate': 'Noise gate with smooth operation.',
  'ZamGateX2': 'Stereo noise gate.',
  'ZamDelay': 'Tempo-synced delay with feedback.',
  'ZamAutoSat': 'Automatic saturation for consistent warmth.',
  'ZamDynamicEQ': 'Dynamic equalizer combining EQ and compression.',
  'ZamHeadX2': 'Binaural head simulation for headphone mixing.',
  'ZamPhono': 'RIAA phono preamp for vinyl playback.',
  'ZamSFZ': 'SFZ sample format player. (Consider using Sfizz for better SFZ support)',
  'ZamSynth': 'Subtractive synthesizer.',

  // x42 Plugins
  'x42-eq': 'Four-band parametric equalizer with analyzer.',
  'x42-compressor': 'Simple stereo compressor.',
  'x42-limiter': 'Look-ahead brickwall limiter.',
  'x42-meter': 'K-system meter with RMS and peak display.',
  'x42-phaserotate': 'All-pass filter for phase rotation.',
  'x42-tuner': 'Precision instrument tuner.',
  'x42-balance': 'Stereo balance control.',
  'x42-mixtri': 'Matrix mixer for mid/side and stereo.',
  'x42-scope': 'Stereo oscilloscope display.',
  'x42-spectr': 'Spectrum analyzer.',
  'x42-dpl': 'Digital peak limiter.',
  'x42-fil4': 'Four-band parametric filter.',

  // CAPS Plugins
  'CAPS AmpVTS': 'Valve amplifier simulation.',
  'CAPS Plate': 'Plate reverb algorithm.',
  'CAPS White': 'White noise generator.',
  'CAPS Click': 'Metronome click generator.',
  'CAPS AutoFilter': 'Envelope-following filter.',
  'CAPS Scape': 'Stereo delay with feedback.',
  'CAPS Saturate': 'Soft saturation effect.',
  'CAPS ToneStack': 'Guitar amp tone stack modeling.',

  // MDA Plugins
  'MDA Bandisto': 'Multi-band distortion effect.',
  'MDA BeatBox': 'Drum replacer and enhancer.',
  'MDA Combo': 'Amp and speaker simulation.',
  'MDA De-ess': 'Simple de-esser for sibilance control.',
  'MDA Degrade': 'Sample rate and bit depth reducer.',
  'MDA Delay': 'Simple stereo delay.',
  'MDA Detune': 'Simple pitch shifting for widening.',
  'MDA Dither': 'Dithering for bit depth reduction.',
  'MDA DubDelay': 'Delay with feedback filtering.',
  'MDA Dynamics': 'Compressor, limiter, and gate.',
  'MDA DX10': 'FM synthesizer.',
  'MDA ePiano': 'Electric piano synthesizer.',
  'MDA Image': 'Stereo image adjustment.',
  'MDA JX10': 'Analog-style synthesizer.',
  'MDA Leslie': 'Rotary speaker simulation.',
  'MDA Limiter': 'Soft-knee limiter.',
  'MDA Loudness': 'Equal loudness contour filter.',
  'MDA MultiBand': 'Three-band compressor.',
  'MDA Overdrive': 'Soft distortion effect.',
  'MDA Piano': 'Acoustic piano synthesizer.',
  'MDA RePsycho': 'Pitch-shifting gate.',
  'MDA RezFilter': 'Resonant filter with envelope.',
  'MDA RingMod': 'Ring modulator effect.',
  'MDA Round Panner': 'Surround panning.',
  'MDA Shepard': 'Shepard tone generator.',
  'MDA Splitter': 'Frequency-based signal splitter.',
  'MDA Stereo': 'Stereo width control.',
  'MDA SubSynth': 'Sub-bass synthesizer.',
  'MDA TalkBox': 'Vocoder-like talk box.',
  'MDA TestTone': 'Test signal generator.',
  'MDA Thru-Zero Flanger': 'Through-zero flanging effect.',
  'MDA Tracker': 'Pitch tracker for MIDI control.',
  'MDA Transient': 'Transient shaper.',
  'MDA VocInput': 'Vocoder carrier input.',
  'MDA Vocoder': 'Sixteen-band vocoder.',

  // Dragonfly Reverb
  'Dragonfly Hall Reverb': 'Large hall reverb with rich reflections.',
  'Dragonfly Room Reverb': 'Natural room ambience reverb.',
  'Dragonfly Plate Reverb': 'Classic plate reverb algorithm.',
  'Dragonfly Early Reflections': 'Early reflection processor.',

  // TAL Plugins
  'TAL-Reverb': 'High-quality algorithmic reverb.',
  'TAL-Reverb-2': 'Vintage plate reverb emulation.',
  'TAL-Reverb-3': 'Modulated reverb with chorus.',
  'TAL-NoiseMaker': 'Virtual analog synthesizer.',
  'TAL-Filter': 'Resonant filter with distortion.',
  'TAL-Chorus': 'Juno-60 style chorus effect.',
  'TAL-Dub': 'Vintage delay with filtering.',
  'TAL-Vocoder': 'Eleven-band vocoder.',

  // MAP2 Native Processors - Modulation
  'Stereo Chorus': 'Classic stereo chorus with adjustable depth, rate, and centre delay for rich modulation.',
  '6-Stage Phaser': 'Classic 6-stage phaser with modulated all-pass filters for sweeping notches.',
  'IntelliFX 8-Voice': 'Rocktron IntelliFX-style 8-voice multi-chorus with independent voice control and HUSH noise reduction.',

  // MAP2 Native Processors - Effects
  'Eventide H9': 'Professional multi-effect processor with 10 iconic algorithms: MicroPitch, UltraShift, SmartShift, Transpose, PitchFactor, ReverseDelays, ShimmerVerbs, MotionReverbs, Granular, and Crystallize. Features STFT pitch shifting, granular synthesis, and freeverb reverb architecture.',
  'Eventide H9 Multi-Effect': 'Professional multi-effect processor with 10 iconic algorithms: MicroPitch, UltraShift, SmartShift, Transpose, PitchFactor, ReverseDelays, ShimmerVerbs, MotionReverbs, Granular, and Crystallize. Features STFT pitch shifting, granular synthesis, and freeverb reverb architecture.',

  // GlitchShifter - Airwindows plugin ported to LV2 by Hannes Braun
  'GlitchShifter': 'Granular pitch shifter/harmonizer with intentional glitchy artifacts. Creates smooth or lo-fi pitch-shifted harmonies with adjustable grain tightness and feedback.',
  'Airwindows GlitchShifter': 'Granular pitch shifter/harmonizer with intentional glitchy artifacts. Creates smooth or lo-fi pitch-shifted harmonies with adjustable grain tightness and feedback.',

  // SWH Plugins
  'Modulatable delay': 'CV-controlled delay where delay time is modulated by an external audio signal. Connect an LFO or envelope to the Delay input for chorus, flanger, and vibrato effects.',
  'modDelay': 'CV-controlled delay where delay time is modulated by an external audio signal. Connect an LFO or envelope to the Delay input for chorus, flanger, and vibrato effects.',

  // General/Fallback patterns
  'Compressor': 'Dynamic range compressor for controlling audio levels.',
  'Limiter': 'Peak limiter to prevent clipping and control loudness.',
  'Gate': 'Noise gate for removing unwanted background noise.',
  'Reverb': 'Adds spatial ambience and room characteristics.',
  'Delay': 'Time-based effect creating echoes and repetitions.',
  'Chorus': 'Thickens sound by adding modulated copies.',
  'Flanger': 'Sweeping comb filter effect.',
  'Phaser': 'Phase-shifting effect with notch filters.',
  'Distortion': 'Adds harmonic saturation and overdrive.',
  'Overdrive': 'Soft clipping distortion for warmth.',
  'Fuzz': 'Heavy distortion with compressed sustain.',
  'EQ': 'Equalizer for frequency shaping.',
  'Equalizer': 'Tone shaping through frequency adjustment.',
  'Filter': 'Frequency-selective signal processor.',
  'Saturator': 'Adds harmonic warmth and color.',
  'Exciter': 'Enhances presence through harmonic generation.',
  'Tuner': 'Instrument tuning display.',
  'Analyzer': 'Spectrum and level analysis.',
  'Meter': 'Level metering and monitoring.',
  'Oscilloscope': 'Waveform visualization.',
  'Vocoder': 'Speech-controlled synthesizer effect.',
  'Tremolo': 'Amplitude modulation effect.',
  'Vibrato': 'Pitch modulation effect.',
  'Wah': 'Resonant filter sweep effect.',
  'Cabinet': 'Speaker cabinet impulse response.',
  'Amplifier': 'Amplifier modeling and simulation.',
  'Synth': 'Synthesizer instrument.',
  'Sampler': 'Sample playback instrument.',
}

/**
 * Get a description for a plugin by name
 * Tries exact match first, then partial matches
 */
export function getPluginDescription(pluginName: string): string | null {
  // Try exact match first
  if (PLUGIN_DESCRIPTIONS[pluginName]) {
    return PLUGIN_DESCRIPTIONS[pluginName]
  }

  // Try partial matches (plugin name contains key or key contains plugin name)
  const nameLower = pluginName.toLowerCase()
  for (const [key, description] of Object.entries(PLUGIN_DESCRIPTIONS)) {
    const keyLower = key.toLowerCase()
    if (nameLower.includes(keyLower) || keyLower.includes(nameLower)) {
      return description
    }
  }

  // Try matching individual words for generic plugins
  const words = pluginName.split(/[\s\-_]+/)
  for (const word of words) {
    if (word.length > 3) {
      const wordLower = word.toLowerCase()
      for (const [key, description] of Object.entries(PLUGIN_DESCRIPTIONS)) {
        if (key.toLowerCase() === wordLower) {
          return description
        }
      }
    }
  }

  return null
}
