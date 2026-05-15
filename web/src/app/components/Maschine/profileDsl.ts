// T2522-B cycle 12 — T700 Profile DSL framework.
//
// Per T700 Q6 (locked), each MK1 profile renders into the dual
// 255×64 LCDs using one of 5 templates. The DSL captures the
// profile metadata + template choice + block contents, plus the
// per-pad LED color map and encoder assignments. Cycle 12 ships
// the schema + a starter registry of 3 profiles; cycle 13 ships
// the layout engine that turns the DSL into pixel output; cycle
// 14 ships 8 total profiles end-to-end.
//
// The DSL is intentionally JSON-serializable so the Workbench
// editor can round-trip it through localStorage today and
// through a backend `profile_registry` block (similar to
// performance_patterns) tomorrow.

export const PROFILE_LCD_TEMPLATES = [
  'param-list', // CTRL, AUTO — one parameter per row, value column
  'big-value', // TUNER, MONITOR — single large readout
  'kit-grid', // KIT BROWSER, BRWS — 4×4 cell grid
  'signal-flow', // ECE (Effect Chain Editor), SMPL — left-to-right block diagram
  'console', // SYSTEM HEALTH, ADMIN — multi-line text dump
] as const

export type ProfileLcdTemplate = (typeof PROFILE_LCD_TEMPLATES)[number]

// All cabl-protocol LED colors. Mirrors MaschineLedColorName from
// the maschine client; duplicated here so the profile DSL doesn't
// pull in the maschine client.
export type ProfileLedColor =
  | 'empty'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'magenta'
  | 'white'

/** A single per-pad assignment within a profile. */
export interface ProfilePadAssignment {
  /** Free-text label rendered on the pad in the GUI mirror. */
  label: string
  idle_color: ProfileLedColor
  press_color: ProfileLedColor
  /** Optional caption shown beneath the LED color in the GUI. */
  caption?: string
}

/** A single encoder assignment within a profile. */
export interface ProfileEncoderAssignment {
  slot: 'enc1' | 'enc2' | 'enc3' | 'enc4' | 'enc5' | 'enc6' | 'enc7' | 'enc8' | 'vol' | 'tempo' | 'swing'
  label: string
  /** Optional unit ('%', 'dB', 'ms', 'Hz') rendered next to live value. */
  unit?: string
}

/** A single LCD block — one of three slots in the canonical layout
 * (top breadcrumb 12px / canvas 40px / bottom monitor strip 12px). */
export interface ProfileLcdBlock {
  /** Type discriminator: which renderer to invoke. */
  kind: 'breadcrumb' | 'monitor-strip' | 'canvas'
  /** Free-text content for breadcrumb / monitor; ignored for canvas
   * (which renders from the template + template-specific data). */
  text?: string
  /** Template-specific data block. The shape depends on the
   * template; cycle 13's layout engine validates per-template. */
  data?: Record<string, unknown>
}

export interface ProfileLcdSpec {
  /** One of the 5 canonical templates. */
  template: ProfileLcdTemplate
  /** Which LCD this spec applies to: left, right, or both. */
  side: 'left' | 'right' | 'both'
  /** The canonical 3-block layout: top 12px / canvas 40px /
   * bottom 12px. Each may be omitted. */
  blocks: {
    top?: ProfileLcdBlock
    canvas: ProfileLcdBlock
    bottom?: ProfileLcdBlock
  }
}

/** A single T700 profile. */
export interface MaschineProfile {
  /** T1..T25 per the locked T700 catalog. */
  id: string
  /** Short display label rendered as the breadcrumb default. */
  label: string
  /** Long-form name shown in the workbench picker. */
  name: string
  /** Author-facing description. */
  description: string
  /** Two LCD specs (one per side) — left and right. Both fields
   * may share a template; the layout engine renders each side
   * with its own data. */
  lcd_left: ProfileLcdSpec
  lcd_right: ProfileLcdSpec
  /** 16-pad LED + label assignment. */
  pads: ProfilePadAssignment[]
  /** 11-encoder assignment (enc1-8 + vol + tempo + swing). */
  encoders: ProfileEncoderAssignment[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class ProfileSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileSchemaError'
  }
}

const PROFILE_ID_PATTERN = /^T(?:[1-9]|1\d|2[0-5])$/

const VALID_LED_COLORS = new Set<ProfileLedColor>([
  'empty', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'white',
])

const VALID_ENCODER_SLOTS = new Set([
  'enc1', 'enc2', 'enc3', 'enc4', 'enc5', 'enc6', 'enc7', 'enc8', 'vol', 'tempo', 'swing',
])

function validateLcdSpec(spec: unknown, where: string): asserts spec is ProfileLcdSpec {
  if (!spec || typeof spec !== 'object') {
    throw new ProfileSchemaError(`${where} must be a mapping`)
  }
  const s = spec as Record<string, unknown>
  if (typeof s.template !== 'string' || !PROFILE_LCD_TEMPLATES.includes(s.template as ProfileLcdTemplate)) {
    throw new ProfileSchemaError(
      `${where}.template=${JSON.stringify(s.template)} must be one of ${PROFILE_LCD_TEMPLATES.join(', ')}`,
    )
  }
  if (s.side !== 'left' && s.side !== 'right' && s.side !== 'both') {
    throw new ProfileSchemaError(`${where}.side=${JSON.stringify(s.side)} must be 'left', 'right', or 'both'`)
  }
  if (!s.blocks || typeof s.blocks !== 'object') {
    throw new ProfileSchemaError(`${where}.blocks must be a mapping with at minimum a 'canvas' block`)
  }
  const blocks = s.blocks as { canvas?: unknown }
  if (!blocks.canvas) {
    throw new ProfileSchemaError(`${where}.blocks.canvas is required`)
  }
}

export function validateProfile(profile: unknown): asserts profile is MaschineProfile {
  if (!profile || typeof profile !== 'object') {
    throw new ProfileSchemaError('profile must be a mapping')
  }
  const p = profile as Record<string, unknown>
  if (typeof p.id !== 'string' || !PROFILE_ID_PATTERN.test(p.id)) {
    throw new ProfileSchemaError(
      `profile.id=${JSON.stringify(p.id)} must match T1..T25 (e.g. "T7")`,
    )
  }
  for (const field of ['label', 'name', 'description'] as const) {
    if (typeof p[field] !== 'string') {
      throw new ProfileSchemaError(`profile.${field} must be a string`)
    }
  }
  validateLcdSpec(p.lcd_left, 'profile.lcd_left')
  validateLcdSpec(p.lcd_right, 'profile.lcd_right')

  if (!Array.isArray(p.pads) || p.pads.length !== 16) {
    throw new ProfileSchemaError('profile.pads must be a 16-entry array')
  }
  for (let i = 0; i < 16; i += 1) {
    const pad = p.pads[i] as Record<string, unknown> | undefined
    if (!pad) throw new ProfileSchemaError(`profile.pads[${i}] missing`)
    if (typeof pad.label !== 'string') throw new ProfileSchemaError(`profile.pads[${i}].label must be string`)
    if (!VALID_LED_COLORS.has(pad.idle_color as ProfileLedColor)) {
      throw new ProfileSchemaError(`profile.pads[${i}].idle_color=${JSON.stringify(pad.idle_color)} invalid`)
    }
    if (!VALID_LED_COLORS.has(pad.press_color as ProfileLedColor)) {
      throw new ProfileSchemaError(`profile.pads[${i}].press_color=${JSON.stringify(pad.press_color)} invalid`)
    }
  }

  if (!Array.isArray(p.encoders)) {
    throw new ProfileSchemaError('profile.encoders must be an array')
  }
  for (let i = 0; i < (p.encoders as unknown[]).length; i += 1) {
    const enc = (p.encoders as unknown[])[i] as Record<string, unknown> | undefined
    if (!enc) throw new ProfileSchemaError(`profile.encoders[${i}] missing`)
    if (!VALID_ENCODER_SLOTS.has(enc.slot as string)) {
      throw new ProfileSchemaError(
        `profile.encoders[${i}].slot=${JSON.stringify(enc.slot)} invalid`,
      )
    }
    if (typeof enc.label !== 'string') {
      throw new ProfileSchemaError(`profile.encoders[${i}].label must be string`)
    }
  }
}

// ---------------------------------------------------------------------------
// Starter registry — 3 profiles seeded in cycle 12
// ---------------------------------------------------------------------------

const EMPTY_PADS: ProfilePadAssignment[] = Array.from({ length: 16 }, (_, i) => ({
  label: `Pad ${i + 1}`,
  idle_color: 'empty',
  press_color: 'white',
}))

export const STARTER_PROFILES: readonly MaschineProfile[] = [
  // T1 — CTRL: continuous-control profile (the default landing
  // profile per T700). Encoders 1-8 control the live snapshot's
  // first 8 macro slots; pads light up by chain category.
  {
    id: 'T1',
    label: 'CTRL',
    name: 'Continuous Control',
    description:
      'Default landing profile. Encoders 1-8 control the active snapshot\'s first 8 macro parameters. Pads light up by chain category and trigger block-focus on press.',
    lcd_left: {
      template: 'param-list',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'CTRL · macros 1-4' },
        canvas: { kind: 'canvas', data: { columns: 2, rows: 4 } },
        bottom: { kind: 'monitor-strip', text: '120 BPM · LIVE' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'macros 5-8' },
        canvas: { kind: 'canvas', data: { columns: 2, rows: 4 } },
        bottom: { kind: 'monitor-strip', text: 'master 0 dB' },
      },
    },
    pads: EMPTY_PADS,
    encoders: [
      { slot: 'enc1', label: 'Macro 1' },
      { slot: 'enc2', label: 'Macro 2' },
      { slot: 'enc3', label: 'Macro 3' },
      { slot: 'enc4', label: 'Macro 4' },
      { slot: 'enc5', label: 'Macro 5' },
      { slot: 'enc6', label: 'Macro 6' },
      { slot: 'enc7', label: 'Macro 7' },
      { slot: 'enc8', label: 'Macro 8' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
      { slot: 'tempo', label: 'Clock BPM', unit: 'BPM' },
      { slot: 'swing', label: 'Swing', unit: '%' },
    ],
  },
  // T5 — SNAP: snapshot recall. Pads = 16 snapshot slots; press
  // recalls. Encoder 1 = browse list.
  {
    id: 'T5',
    label: 'SNAP',
    name: 'Snapshot Recall',
    description:
      'Snapshot recall profile. The 16 pads map to the 16 most-recent snapshots; pressing a pad recalls. Encoder 1 scrolls through the full snapshot library; pressing it locks selection.',
    lcd_left: {
      template: 'kit-grid',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'SNAP · page 1 of 1' },
        canvas: { kind: 'canvas', data: { rows: 4, cols: 4 } },
        bottom: { kind: 'monitor-strip', text: 'active: Live Snapshot' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'inspector' },
        canvas: { kind: 'canvas', data: { columns: 1, rows: 4 } },
        bottom: { kind: 'monitor-strip', text: 'press to recall' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Snap ${i + 1}`,
      idle_color: i === 0 ? 'green' : 'cyan',
    })),
    encoders: [
      { slot: 'enc1', label: 'Browse' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
      { slot: 'tempo', label: 'Clock BPM', unit: 'BPM' },
    ],
  },
  // T11 — TUNER: chromatic tuner. The right LCD shows the big
  // pitch readout; the left LCD shows the deviation cents bar.
  // No pad bindings — tuner is a passive display.
  {
    id: 'T11',
    label: 'TUNER',
    name: 'Chromatic Tuner',
    description:
      'Chromatic tuner. Right LCD = big note + octave readout. Left LCD = horizontal deviation strip (-50 to +50 cents). Pads + encoders are unbound; press SHIFT+T-selector to exit.',
    lcd_left: {
      template: 'big-value',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'TUNER · cents' },
        canvas: { kind: 'canvas', data: { value: 0, range: [-50, 50] } },
      },
    },
    lcd_right: {
      template: 'big-value',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'TUNER · note' },
        canvas: { kind: 'canvas', data: { value: '—', size: 'huge' } },
      },
    },
    pads: EMPTY_PADS,
    encoders: [
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
      { slot: 'tempo', label: 'Clock BPM', unit: 'BPM' },
    ],
  },
  // T2 — STEP: step sequencer profile. The 16 pads = 16 steps of
  // the active pattern; group buttons swap which pad-row of the
  // pattern is being edited (per-pad rows). Encoders 1-4 = step
  // params (gate length, swing, shuffle, accent depth).
  {
    id: 'T2',
    label: 'STEP',
    name: 'Step Sequencer',
    description:
      'Live step sequencer profile. 16 pads = 16 steps of the active pattern; press cycles empty → on → accented. Group buttons A-H select which pad-row of the pattern is being edited. Encoders 1-4 control gate length, swing, shuffle, accent depth.',
    lcd_left: {
      template: 'kit-grid',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'STEP · pattern A · row 1' },
        canvas: { kind: 'canvas', data: { rows: 4, cols: 4 } },
        bottom: { kind: 'monitor-strip', text: '16 steps · 4/4' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'step params' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 2,
            rows: 2,
            entries: [
              { label: 'gate', value: '50%' },
              { label: 'swing', value: '0%' },
              { label: 'shuffle', value: 'off' },
              { label: 'accent', value: '0' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: '120 BPM · LIVE' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Step ${i + 1}`,
      idle_color: i % 4 === 0 ? 'cyan' : 'empty',
      press_color: 'white',
    })),
    encoders: [
      { slot: 'enc1', label: 'Gate length', unit: '%' },
      { slot: 'enc2', label: 'Swing', unit: '%' },
      { slot: 'enc3', label: 'Shuffle', unit: '%' },
      { slot: 'enc4', label: 'Accent depth' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
      { slot: 'tempo', label: 'Clock BPM', unit: 'BPM' },
    ],
  },
  // T3 — BRWS: kit / preset browser. Pads = 16 most-recently-used
  // kits, encoder 1 scrolls full library, encoder 2 toggles preview
  // mode. Right LCD shows the active selection's metadata.
  {
    id: 'T3',
    label: 'BRWS',
    name: 'Kit Browser',
    description:
      'Kit + preset browser. 16 pads = the 16 most recently used kits; press to load. Encoder 1 scrolls the full library; encoder 2 toggles preview-on-scroll. Right LCD surfaces the active selection\'s metadata (vendor, category, BPM hint).',
    lcd_left: {
      template: 'kit-grid',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'BRWS · recent kits' },
        canvas: { kind: 'canvas', data: { rows: 4, cols: 4 } },
        bottom: { kind: 'monitor-strip', text: 'enc1 = scroll' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'inspector' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 1,
            rows: 4,
            entries: [
              { label: 'vendor', value: '—' },
              { label: 'category', value: '—' },
              { label: 'bpm hint', value: '—' },
              { label: 'tags', value: '—' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'press to load' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Kit ${i + 1}`,
      idle_color: 'orange',
      press_color: 'white',
    })),
    encoders: [
      { slot: 'enc1', label: 'Browse library' },
      { slot: 'enc2', label: 'Preview mode' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
    ],
  },
  // T4 — SMPL: sampler profile. Single sample editor — pads play
  // mapped slices; encoders control start/end/loop/pitch/gain.
  {
    id: 'T4',
    label: 'SMPL',
    name: 'Sampler',
    description:
      'Single-sample editor. Pads play mapped slices (1-16). Encoders 1-5 control start, end, loop, pitch, gain. Encoder 6 = slice selector. Left LCD shows the sample waveform region; right LCD shows the parameter list.',
    lcd_left: {
      template: 'signal-flow',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'SMPL · sample.wav' },
        canvas: {
          kind: 'canvas',
          data: {
            blocks: [
              { label: 'IN' },
              { label: 'TRIM' },
              { label: 'PITCH' },
              { label: 'GAIN' },
              { label: 'OUT' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'slice 1 of 16' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'sample params' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 2,
            rows: 3,
            entries: [
              { label: 'start', value: '0.00s' },
              { label: 'end', value: '1.50s' },
              { label: 'loop', value: 'off' },
              { label: 'pitch', value: '0' },
              { label: 'gain', value: '0 dB' },
              { label: 'slice', value: '1' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: '48 kHz · stereo' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Slice ${i + 1}`,
      idle_color: 'magenta',
      press_color: 'white',
    })),
    encoders: [
      { slot: 'enc1', label: 'Start', unit: 's' },
      { slot: 'enc2', label: 'End', unit: 's' },
      { slot: 'enc3', label: 'Loop' },
      { slot: 'enc4', label: 'Pitch', unit: 'st' },
      { slot: 'enc5', label: 'Gain', unit: 'dB' },
      { slot: 'enc6', label: 'Slice' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
    ],
  },
  // T6 — AUTO: automation lane viewer. Encoders 1-8 mirror the
  // currently-armed automation targets; pads scrub the active lane.
  {
    id: 'T6',
    label: 'AUTO',
    name: 'Automation',
    description:
      'Automation lane viewer + recorder. Encoders 1-8 mirror the active snapshot\'s 8 automation targets. Pads 1-16 scrub the active lane (pad 1 = bar 1, pad 16 = bar 16). Press REC + turn an encoder to capture a gesture into the active lane.',
    lcd_left: {
      template: 'param-list',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'AUTO · lanes 1-4' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 2,
            rows: 2,
            entries: [
              { label: 'lane 1', value: '—' },
              { label: 'lane 2', value: '—' },
              { label: 'lane 3', value: '—' },
              { label: 'lane 4', value: '—' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'pads = scrub' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'lanes 5-8' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 2,
            rows: 2,
            entries: [
              { label: 'lane 5', value: '—' },
              { label: 'lane 6', value: '—' },
              { label: 'lane 7', value: '—' },
              { label: 'lane 8', value: '—' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'REC = arm' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Bar ${i + 1}`,
      idle_color: 'blue',
      press_color: 'white',
    })),
    encoders: [
      { slot: 'enc1', label: 'Lane 1' },
      { slot: 'enc2', label: 'Lane 2' },
      { slot: 'enc3', label: 'Lane 3' },
      { slot: 'enc4', label: 'Lane 4' },
      { slot: 'enc5', label: 'Lane 5' },
      { slot: 'enc6', label: 'Lane 6' },
      { slot: 'enc7', label: 'Lane 7' },
      { slot: 'enc8', label: 'Lane 8' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
    ],
  },
  // T9 — ECE: Effect Chain Editor. Live signal-flow view of the
  // active chain. Pads = focus a block; encoders = block-specific
  // parameters resolved from the focused block's top_parameters.
  {
    id: 'T9',
    label: 'ECE',
    name: 'Effect Chain Editor',
    description:
      'Effect Chain Editor. Left LCD shows the active chain as a left-to-right signal-flow diagram. Pads 1-16 focus blocks (page-paginated when chain length > 16). Encoders 1-8 expose the focused block\'s top 8 parameters.',
    lcd_left: {
      template: 'signal-flow',
      side: 'left',
      blocks: {
        top: { kind: 'breadcrumb', text: 'ECE · chain · page 1' },
        canvas: {
          kind: 'canvas',
          data: {
            blocks: [
              { label: 'NAM' },
              { label: 'EQ' },
              { label: 'COMP' },
              { label: 'CAB IR' },
              { label: 'REV' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'pad = focus block' },
      },
    },
    lcd_right: {
      template: 'param-list',
      side: 'right',
      blocks: {
        top: { kind: 'breadcrumb', text: 'focused: NAM' },
        canvas: {
          kind: 'canvas',
          data: {
            columns: 2,
            rows: 4,
            entries: [
              { label: 'gain', value: '+12 dB' },
              { label: 'master', value: '−6 dB' },
              { label: 'presence', value: '5' },
              { label: 'depth', value: '7' },
              { label: 'bass', value: '6' },
              { label: 'mid', value: '5' },
              { label: 'treble', value: '4' },
              { label: 'bypass', value: 'off' },
            ],
          },
        },
        bottom: { kind: 'monitor-strip', text: 'enc = param' },
      },
    },
    pads: EMPTY_PADS.map((pad, i) => ({
      ...pad,
      label: `Block ${i + 1}`,
      idle_color: i < 5 ? 'green' : 'empty',
      press_color: 'white',
    })),
    encoders: [
      { slot: 'enc1', label: 'gain', unit: 'dB' },
      { slot: 'enc2', label: 'master', unit: 'dB' },
      { slot: 'enc3', label: 'presence' },
      { slot: 'enc4', label: 'depth' },
      { slot: 'enc5', label: 'bass' },
      { slot: 'enc6', label: 'mid' },
      { slot: 'enc7', label: 'treble' },
      { slot: 'enc8', label: 'bypass' },
      { slot: 'vol', label: 'Master Gain', unit: 'dB' },
    ],
  },
] as const
