/**
 * Plugin Descriptions Database
 * Comprehensive descriptions and technical information for LV2 plugins
 * Used to enhance plugin cards with detailed information
 */

export const PLUGIN_DESCRIPTIONS: Record<string, { description: string; category: string; function: string; tips?: string }> = {
  // Spectrum Analyzers
  '1/3 Octave Spectrum Display Mono': {
    description: 'Real-time frequency spectrum analyzer in mono',
    category: 'Metering',
    function: 'Displays audio frequency content in 1/3 octave bands for frequency analysis',
    tips: 'Use to identify problematic frequencies before applying EQ',
  },
  '1/3 Octave Spectrum Display Stereo': {
    description: 'Real-time frequency spectrum analyzer in stereo',
    category: 'Metering',
    function: 'Shows frequency response for stereo signals with separate L/R channels',
    tips: 'Useful for identifying phase issues between channels',
  },

  // EQ
  '3 Band EQ': {
    description: 'Simple 3-band parametric equalizer',
    category: 'EQ',
    function: 'Basic tone shaping with Low, Mid, and High frequency controls',
    tips: 'Perfect for quick tonal adjustments in guitar pedalboards',
  },

  // Gates
  abGate: {
    description: 'Gate/Noise gate for dynamic signal control',
    category: 'Dynamics',
    function: 'Silences audio when signal falls below threshold, eliminating noise and hum',
    tips: 'Place after guitar input to eliminate buzz; adjust threshold to prevent signal loss',
  },

  // Amplitude
  'Amplitude Imposer': {
    description: 'Dynamic range control via envelope following',
    category: 'Dynamics',
    function: 'Modulates signal amplitude based on envelope detection',
    tips: 'Advanced dynamics processing for punchy, controlled sounds',
  },

  'Audio Gain (Mono)': {
    description: 'Simple mono gain/level control',
    category: 'Utility',
    function: 'Adjusts signal level with optional makeup gain and clipping prevention',
    tips: 'Use for level matching between different signal sources',
  },

  'Audio Gain (Stereo)': {
    description: 'Stereo gain/level control with linked or independent channels',
    category: 'Utility',
    function: 'Adjusts stereo signal level with independent L/R control option',
    tips: 'Essential for balancing stereo effects in chains',
  },

  // Bass Enhancement
  BassUp: {
    description: 'Bass enhancement and low-end boost',
    category: 'EQ',
    function: 'Enhances bass frequencies without muddiness through harmonic saturation',
    tips: 'Great for adding warmth and presence to thin-sounding rigs',
  },

  // Metering
  'BBC M-6': {
    description: 'BBC broadcast-standard metering (Mono)',
    category: 'Metering',
    function: 'Professional audio metering with BBC standards compliance',
    tips: 'Use for accurate level monitoring in pro setups',
  },

  'BBC Meter (Mono)': {
    description: 'BBC standard audio level meter for mono signals',
    category: 'Metering',
    function: 'Displays VU-style metering with BBC broadcast standards',
    tips: 'Better than VU meters for precision audio level monitoring',
  },

  'BBC Meter (Stereo)': {
    description: 'BBC standard metering for stereo signals',
    category: 'Metering',
    function: 'Shows left and right channel levels with BBC standard scales',
    tips: 'Essential for monitoring stereo pedalboard output',
  },

  'Bit Meter': {
    description: 'Bit depth and resolution analyzer',
    category: 'Metering',
    function: 'Displays bit depth information and digital signal statistics',
    tips: 'Debug digital audio issues and confirm bit depth',
  },

  // Calf Plugins
  'Calf Analyzer': {
    description: 'High-resolution audio spectrum analyzer',
    category: 'Metering',
    function: 'Detailed frequency analysis with multiple display modes and zoom',
    tips: 'Professional-grade analysis for detailed frequency work',
  },

  'Calf Bass Enhancer': {
    description: 'Subharmonic bass enhancement synthesizer',
    category: 'EQ',
    function: 'Adds synthesized bass harmonics to enhance low-end presence',
    tips: 'Great for beefing up thin bass or adding punch to kick drums',
  },

  'Calf Compensation Delay Line': {
    description: 'Precise delay for phase alignment',
    category: 'Timing',
    function: 'Delays signal to align phase relationships between multiple signals',
    tips: 'Use when combining close-miked and far-field recordings',
  },

  // Compressors & Dynamics
  'Calf Compressor': {
    description: 'VCA-style compressor with transparent control',
    category: 'Dynamics',
    function: 'Controls dynamic range with attack, release, ratio, and threshold',
    tips: 'Perfect for controlling peak levels and adding punch',
  },

  'Calf Stereo Compressor': {
    description: 'Stereo compressor with linked or independent channel control',
    category: 'Dynamics',
    function: 'Compresses stereo signals while maintaining stereo image',
    tips: 'Use for controlling stereo effects chains without phase issues',
  },

  'Calf Multiband Compressor': {
    description: 'Frequency-aware compression across multiple bands',
    category: 'Dynamics',
    function: 'Compresses different frequency ranges independently',
    tips: 'Advanced tool for surgical dynamic control',
  },

  // Distortion & Saturation
  'Calf Distortion': {
    description: 'Saturation and distortion with multiple modes',
    category: 'Distortion',
    function: 'Adds harmonic saturation from subtle to extreme distortion',
    tips: 'Stack multiple stages for progressive saturation',
  },

  'Calf Tape Saturation': {
    description: 'Tape machine emulation saturation',
    category: 'Distortion',
    function: 'Models magnetic tape saturation for warm, natural overdrive',
    tips: 'Adds cohesion to digital recordings with analog character',
  },

  // EQ Plugins
  'Calf EQ': {
    description: 'Parametric EQ with unlimited bands',
    category: 'EQ',
    function: 'Fully parametric equalizer with Q control, gain, and multiple filter types',
    tips: 'Swiss army knife for tone shaping and surgical EQ',
  },

  'Calf EQ 12 Band': {
    description: '12-band graphical EQ',
    category: 'EQ',
    function: 'Graphic equalizer with 12 fixed-frequency bands for quick tonal shaping',
    tips: 'Intuitive visual interface for rapid EQ adjustments',
  },

  'Calf Equalizer (Stereo)': {
    description: 'Stereo parametric equalizer',
    category: 'EQ',
    function: 'Independent EQ for left and right channels with full parametric control',
    tips: 'Create unique stereo tone shaping effects',
  },

  // Filters
  'Calf Filter': {
    description: 'Multi-mode analog filter emulation',
    category: 'Filter',
    function: 'Switchable lowpass, highpass, bandpass filters with resonance',
    tips: 'Essential for subtractive synthesis and frequency sculpting',
  },

  'Calf Filter Stereo': {
    description: 'Stereo multi-mode filter with independent channels',
    category: 'Filter',
    function: 'Applies different filter settings to left and right channels',
    tips: 'Create stereo sweeps and dynamic filtering effects',
  },

  // Reverb & Delay
  'Calf Reverb': {
    description: 'High-quality algorithmic reverb',
    category: 'Reverb',
    function: 'Realistic room and space simulation with decay and diffusion controls',
    tips: 'Use for ambience; balance dry/wet carefully to avoid mud',
  },

  'Calf Hall': {
    description: 'Concert hall reverb simulation',
    category: 'Reverb',
    function: 'Models large acoustic spaces like concert halls',
    tips: 'Great for creating space in recording; use 10-30% wet',
  },

  // Modulation
  'Calf Flanger': {
    description: 'Classic flanger modulation effect',
    category: 'Modulation',
    function: 'Sweeping jet-plane effect created by time-modulated delay',
    tips: 'Adjust speed and depth for subtle to extreme effects',
  },

  'Calf Chorus': {
    description: 'Lush chorus effect',
    category: 'Modulation',
    function: 'Creates widening effect by layering delayed, pitch-shifted copies',
    tips: 'Perfect for adding width to thin guitar tones',
  },

  // Phase
  'Calf Phaser': {
    description: 'Classic phaser effect',
    category: 'Modulation',
    function: 'Peaks and notches sweep across frequency spectrum',
    tips: 'Creates whooshing, psychoacoustic effects; use sparingly',
  },

  // Metering Advanced
  'Calf Loudness Meter': {
    description: 'Perceived loudness analyzer (LUFS)',
    category: 'Metering',
    function: 'Measures perceived loudness using ITU-R BS.1770 standard',
    tips: 'Essential for streaming/broadcast compliance (target -14 LUFS)',
  },

  'Calf Spectrum Meter': {
    description: 'Real-time spectrum analyzer with multiple modes',
    category: 'Metering',
    function: 'Displays frequency spectrum with waterfall, peak hold, and average modes',
    tips: 'Professional tool for detailed frequency analysis',
  },

  'Calf VU Meter': {
    description: 'VU meter display with oversampling',
    category: 'Metering',
    function: 'Classic VU meter emulation for visual level monitoring',
    tips: 'Good for spotting peaks before they cause problems',
  },

  // Synths & Generators
  'Calf Organ': {
    description: 'Polyphonic electronic organ emulation',
    category: 'Instrument',
    function: 'Models vintage electronic organs with drawbars',
    tips: 'Use MIDI for polyphonic organ sounds; great for pad textures',
  },

  // Routing & Utilities
  'Calf Split Stereo': {
    description: 'Splits stereo into separate mono feeds',
    category: 'Utility',
    function: 'Route left and right channels to different effect chains',
    tips: 'Advanced routing for parallel compression and effects',
  },

  'Calf Stereo Spread': {
    description: 'Stereo width control',
    category: 'Utility',
    function: 'Adjusts stereo width from mono to extreme stereo spread',
    tips: 'Push over 100% for inverted stereo; great for creative effects',
  },

  // Cabinet Simulators
  'Calf Cabinet': {
    description: 'Guitar/bass cabinet impulse response simulator',
    category: 'Amp',
    function: 'Models speaker cabinet resonance and frequency response',
    tips: 'Essential for recording amp modeling; adds realism',
  },

  'Cabinets': {
    description: 'Multi-speaker cabinet impulse responses',
    category: 'Amp',
    function: 'Collection of realistic cabinet IR models from different amp setups',
    tips: 'Compare different cabinet models for ideal tone',
  },

  // Amp Modeling
  'Calf Amplifier': {
    description: 'Guitar amplifier emulation',
    category: 'Amp',
    function: 'Models tube amp response with tone stack controls',
    tips: 'Use before cabinet for complete amp modeling chain',
  },

  'Calf Phasor': {
    description: 'Phasor effect (phase shifter)',
    category: 'Modulation',
    function: 'Creates rotating notch filters for swirling effects',
    tips: 'Pair with modulation LFO for classic 70s sound',
  },

  // Mastering
  'Calf Limiter': {
    description: 'Hard limiter for peak protection',
    category: 'Dynamics',
    function: 'Prevents peaks above threshold from passing (brick wall limiting)',
    tips: 'Essential mastering tool; set threshold below max output level',
  },

  'Calf Gate': {
    description: 'Expander/gate for noise reduction',
    category: 'Dynamics',
    function: 'Reduces audio when below threshold; useful for noise removal',
    tips: 'Adjust range carefully to avoid artifacts',
  },

  // Convolver (for IRs)
  'Calf Convolver': {
    description: 'Convolution reverb (loads IR files)',
    category: 'Reverb',
    function: 'Applies impulse response from recorded spaces or hardware',
    tips: 'Perfect for realistic room simulation; download quality IRs',
  },

  // Vintage Emulations
  'Calf Vintage Limiter': {
    description: 'Vintage FET limiter emulation',
    category: 'Dynamics',
    function: 'Models classic solid-state limiter with fast attack',
    tips: 'Great for controlling peaks while adding subtle saturation',
  },

  // Others
  'Calf Delay': {
    description: 'Simple delay/echo effect',
    category: 'Delay',
    function: 'Time-based delay with feedback and stereo options',
    tips: 'Use tap tempo for rhythmic delays',
  },

  'Calf Mono Synth': {
    description: 'Monophonic synthesizer',
    category: 'Instrument',
    function: 'Subtractive synth for bass and lead sounds; one note at a time',
    tips: 'Great for fat bass; use MIDI for control',
  },

  // Default catch-all for unmapped plugins
};

/**
 * Get description for a plugin
 * Falls back to generating a description from plugin type if not found
 */
export function getPluginDescription(
  pluginName: string,
  pluginType?: string,
  category?: string
): { description: string; category: string; function: string; tips?: string } {
  // Try exact match first
  if (PLUGIN_DESCRIPTIONS[pluginName]) {
    return PLUGIN_DESCRIPTIONS[pluginName];
  }

  // Try partial match
  for (const [key, value] of Object.entries(PLUGIN_DESCRIPTIONS)) {
    if (pluginName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(pluginName.toLowerCase())) {
      return value;
    }
  }

  // Generate from type
  const typeDescriptions: Record<string, string> = {
    Compressor: 'Controls dynamic range with threshold, ratio, attack, and release parameters',
    Distortion: 'Adds harmonic saturation from subtle warmth to extreme distortion',
    EQ: 'Shapes tone by boosting or cutting specific frequency ranges',
    Filter: 'Removes or emphasizes frequency content with cutoff and resonance control',
    Reverb: 'Adds spatial ambience simulating room or hall reflections',
    Delay: 'Creates time-based echo effects with feedback and modulation',
    Flanger: 'Sweeping jet-plane effect via modulated delay',
    Phaser: 'Moving notch filters creating swirling psychoacoustic effects',
    Chorus: 'Widening effect from layered delayed, detuned copies',
    Amp: 'Models guitar amplifier tone stack and saturation characteristics',
    Cabinet: 'Simulates speaker cabinet frequency response and resonance',
    'Noise Gate': 'Silences signal below threshold to eliminate noise and hum',
    Limiter: 'Hard ceiling preventing peaks above threshold from passing',
  };

  const description = Object.entries(typeDescriptions).find(
    ([key]) => pluginType?.includes(key) || category?.includes(key)
  )?.[1] || 'Audio processing plugin';

  return {
    description,
    category: category || pluginType || 'Processing',
    function: 'Processes audio signal with effect or processing parameters',
  };
}
