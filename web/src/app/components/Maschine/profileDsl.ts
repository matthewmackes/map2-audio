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
] as const
