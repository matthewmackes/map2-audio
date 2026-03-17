/**
 * pluginChipMeta — Chip label abbreviations and Carbon Tag color types
 * for plugin categories displayed in the Chain Chooser cards.
 *
 * Carbon Tag types: 'blue' | 'cyan' | 'teal' | 'green' | 'purple'
 *                   | 'magenta' | 'red' | 'warm-gray' | 'cool-gray'
 *
 * Bypassed plugins always render as 'cool-gray' regardless of category.
 */

export type CarbonTagType =
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'purple'
  | 'magenta'
  | 'red'
  | 'warm-gray'
  | 'cool-gray'

interface ChipMeta {
  /** Short abbreviation shown on the Tag */
  label: string
  /** Carbon Tag type when the plugin is active (not bypassed) */
  tagType: CarbonTagType
}

/**
 * Maps lowercase, normalised category/class_label strings to chip metadata.
 * Keys must be lowercase — the lookup normalises the input before checking.
 */
const CATEGORY_CHIP_MAP: Record<string, ChipMeta> = {
  // ── Distortion / Drive ──────────────────────────────────────────────────
  distortion:        { label: 'Dist',  tagType: 'red'       },
  overdrive:         { label: 'OD',    tagType: 'red'       },
  fuzz:              { label: 'Fuzz',  tagType: 'red'       },
  waveshaper:        { label: 'Wave',  tagType: 'red'       },
  saturation:        { label: 'Sat',   tagType: 'red'       },

  // ── Amplifier ───────────────────────────────────────────────────────────
  amplifier:         { label: 'Amp',   tagType: 'red'       },
  amp:               { label: 'Amp',   tagType: 'red'       },
  'amp sim':         { label: 'Amp',   tagType: 'red'       },
  'amp simulator':   { label: 'Amp',   tagType: 'red'       },

  // ── Neural / ML ─────────────────────────────────────────────────────────
  nam:               { label: 'NAM',   tagType: 'purple'    },
  'neural amp':      { label: 'NAM',   tagType: 'purple'    },
  'neural amp modeler': { label: 'NAM', tagType: 'purple'   },
  ml:                { label: 'ML',    tagType: 'purple'    },
  'machine learning':{ label: 'ML',    tagType: 'purple'    },

  // ── EQ / Filter ─────────────────────────────────────────────────────────
  eq:                { label: 'EQ',    tagType: 'cyan'      },
  equaliser:         { label: 'EQ',    tagType: 'cyan'      },
  equalizer:         { label: 'EQ',    tagType: 'cyan'      },
  parametric:        { label: 'PEQ',   tagType: 'cyan'      },
  'parametric eq':   { label: 'PEQ',   tagType: 'cyan'      },
  multiband:         { label: 'MBand', tagType: 'cyan'      },
  filter:            { label: 'Filt',  tagType: 'cyan'      },
  highpass:          { label: 'HPF',   tagType: 'cyan'      },
  'high-pass':       { label: 'HPF',   tagType: 'cyan'      },
  lowpass:           { label: 'LPF',   tagType: 'cyan'      },
  'low-pass':        { label: 'LPF',   tagType: 'cyan'      },
  bandpass:          { label: 'BPF',   tagType: 'cyan'      },
  'band-pass':       { label: 'BPF',   tagType: 'cyan'      },
  allpass:           { label: 'APF',   tagType: 'cyan'      },
  'all-pass':        { label: 'APF',   tagType: 'cyan'      },
  notch:             { label: 'Notch', tagType: 'cyan'      },
  comb:              { label: 'Comb',  tagType: 'cyan'      },

  // ── Dynamics ────────────────────────────────────────────────────────────
  compressor:        { label: 'Comp',  tagType: 'magenta'   },
  dynamics:          { label: 'Dyn',   tagType: 'magenta'   },
  limiter:           { label: 'Lim',   tagType: 'magenta'   },
  gate:              { label: 'Gate',  tagType: 'magenta'   },
  'noise gate':      { label: 'Gate',  tagType: 'magenta'   },
  expander:          { label: 'Exp',   tagType: 'magenta'   },
  envelope:          { label: 'Env',   tagType: 'magenta'   },
  transient:         { label: 'Trans', tagType: 'magenta'   },

  // ── Time-based ──────────────────────────────────────────────────────────
  delay:             { label: 'Delay', tagType: 'blue'      },
  echo:              { label: 'Echo',  tagType: 'blue'      },
  reverb:            { label: 'Verb',  tagType: 'blue'      },
  convolution:       { label: 'Conv',  tagType: 'blue'      },
  room:              { label: 'Room',  tagType: 'blue'      },
  hall:              { label: 'Hall',  tagType: 'blue'      },
  plate:             { label: 'Plate', tagType: 'blue'      },
  spring:            { label: 'Spring',tagType: 'blue'      },
  spatial:           { label: 'Spat',  tagType: 'blue'      },

  // ── Modulation ──────────────────────────────────────────────────────────
  chorus:            { label: 'Chorus',tagType: 'teal'      },
  intellifx:         { label: 'IFX',   tagType: 'teal'      },
  flanger:           { label: 'Flang', tagType: 'teal'      },
  phaser:            { label: 'Phase', tagType: 'teal'      },
  modulator:         { label: 'Mod',   tagType: 'teal'      },
  modulation:        { label: 'Mod',   tagType: 'teal'      },
  tremolo:           { label: 'Trem',  tagType: 'teal'      },
  vibrato:           { label: 'Vib',   tagType: 'teal'      },
  rotary:            { label: 'Rot',   tagType: 'teal'      },
  leslie:            { label: 'Les',   tagType: 'teal'      },
  ringmod:           { label: 'Ring',  tagType: 'teal'      },
  'ring modulator':  { label: 'Ring',  tagType: 'teal'      },

  // ── Pitch ───────────────────────────────────────────────────────────────
  pitch:             { label: 'Pitch', tagType: 'purple'    },
  'pitch shifter':   { label: 'Pitch', tagType: 'purple'    },
  'pitch shift':     { label: 'Pitch', tagType: 'purple'    },
  harmonizer:        { label: 'Harm',  tagType: 'purple'    },
  vocoder:           { label: 'Voc',   tagType: 'purple'    },
  autotune:          { label: 'Tune',  tagType: 'purple'    },
  'auto-tune':       { label: 'Tune',  tagType: 'purple'    },

  // ── Simulator / Cabinet ─────────────────────────────────────────────────
  simulator:         { label: 'Sim',   tagType: 'warm-gray' },
  cabinet:           { label: 'Cab',   tagType: 'warm-gray' },
  cab:               { label: 'Cab',   tagType: 'warm-gray' },
  ir:                { label: 'IR',    tagType: 'warm-gray' },
  'impulse response':{ label: 'IR',    tagType: 'warm-gray' },

  // ── Hardware Effects ─────────────────────────────────────────────────────
  lexicon:           { label: 'Lex',   tagType: 'purple'    },
  'lexicon mpx-1':   { label: 'MPX-1', tagType: 'purple'    },
  'mpx-1':           { label: 'MPX-1', tagType: 'purple'    },
  mpx1:              { label: 'MPX-1', tagType: 'purple'    },
  hardware:          { label: 'HW',    tagType: 'purple'    },

  // ── Analysis / Metering ─────────────────────────────────────────────────
  analyser:          { label: 'Anlz',  tagType: 'green'     },
  analyzer:          { label: 'Anlz',  tagType: 'green'     },
  spectrum:          { label: 'Spec',  tagType: 'green'     },
  tuner:             { label: 'Tune',  tagType: 'green'     },
  meter:             { label: 'Meter', tagType: 'green'     },
  'level meter':     { label: 'Meter', tagType: 'green'     },
  oscilloscope:      { label: 'Scope', tagType: 'green'     },
  fft:               { label: 'FFT',   tagType: 'green'     },

  // ── Utility / Routing ───────────────────────────────────────────────────
  utility:           { label: 'Util',  tagType: 'cool-gray' },
  gain:              { label: 'Gain',  tagType: 'cool-gray' },
  volume:            { label: 'Vol',   tagType: 'cool-gray' },
  mixer:             { label: 'Mix',   tagType: 'cool-gray' },
  balance:           { label: 'Bal',   tagType: 'cool-gray' },
  pan:               { label: 'Pan',   tagType: 'cool-gray' },
  stereo:            { label: 'Ster',  tagType: 'cool-gray' },
  'mid/side':        { label: 'M/S',   tagType: 'cool-gray' },
  'mid-side':        { label: 'M/S',   tagType: 'cool-gray' },
  splitter:          { label: 'Split', tagType: 'cool-gray' },
  constant:          { label: 'Const', tagType: 'cool-gray' },

  // ── Instrument / Generator ──────────────────────────────────────────────
  instrument:        { label: 'Inst',  tagType: 'green'     },
  synth:             { label: 'Synth', tagType: 'green'     },
  synthesizer:       { label: 'Synth', tagType: 'green'     },
  generator:         { label: 'Gen',   tagType: 'green'     },
  oscillator:        { label: 'Osc',   tagType: 'green'     },

  // ── Generic fallback ────────────────────────────────────────────────────
  effect:            { label: 'FX',    tagType: 'cool-gray' },
  plugin:            { label: 'FX',    tagType: 'cool-gray' },
  unknown:           { label: 'FX',    tagType: 'cool-gray' },
  other:             { label: 'FX',    tagType: 'cool-gray' },
}

const BYPASSED_TYPE: CarbonTagType = 'cool-gray'
const FALLBACK: ChipMeta = { label: 'FX', tagType: 'cool-gray' }

/**
 * Resolve chip label and Carbon Tag type for a plugin.
 *
 * @param category  Plugin category or class_label (from metadata or plugin_display_type)
 * @param bypassed  Whether the plugin is currently bypassed
 */
export function getPluginChipMeta(
  category: string | undefined,
  bypassed: boolean,
): { label: string; tagType: CarbonTagType } {
  const resolved = resolveCategory(category)
  return {
    label: resolved.label,
    tagType: bypassed ? BYPASSED_TYPE : resolved.tagType,
  }
}

function resolveCategory(category: string | undefined): ChipMeta {
  if (!category) return FALLBACK

  const norm = category.toLowerCase().trim()

  // Exact match first
  if (norm in CATEGORY_CHIP_MAP) return CATEGORY_CHIP_MAP[norm]

  // Partial match — category contains key or key contains category
  for (const [key, meta] of Object.entries(CATEGORY_CHIP_MAP)) {
    if (norm.includes(key) || key.includes(norm)) return meta
  }

  return FALLBACK
}
