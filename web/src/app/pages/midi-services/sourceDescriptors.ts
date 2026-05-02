/**
 * T2482 loop 12 / iter 112 — source descriptor metadata + helpers.
 *
 * Pure data + functions. NO React. Editors render against this shape
 * in iter 113. Per the iter-111 plan §1, descriptor shapes here are
 * extracted from `app/services/midi/projections/*.py` — paired backend
 * additions MUST update both files.
 *
 * Per the iter-111 plan D2: structured editors preserve unknown
 * descriptor keys via `extractKnownAndUnknown()` so round-trip edits
 * don't lose backend extensions.
 */

import type { BindingSourceType } from '../../../map2/clients/midiBindings'

export type SourceFieldKind = 'int' | 'float' | 'string' | 'enum'

export interface SourceFieldSpec {
  key: string  // descriptor dict key
  label: string
  kind: SourceFieldKind
  required?: boolean
  min?: number
  max?: number
  step?: number
  enumValues?: readonly string[]
  defaultValue?: number | string
  helperText?: string
}

export interface SourceTypeSpec {
  type: BindingSourceType
  label: string
  fields: readonly SourceFieldSpec[]
  /**
   * Citation comment so adding a new source_type leaves a paper-trail
   * back to the projection file the editor was modelled against.
   */
  citation: string
}

const CHANNEL: SourceFieldSpec = {
  key: 'channel',
  label: 'Channel',
  kind: 'int',
  min: 1,
  max: 16,
  step: 1,
  helperText: '1-16 (omit for any channel)',
}

const CURVE: SourceFieldSpec = {
  key: 'curve',
  label: 'Curve',
  kind: 'enum',
  enumValues: ['linear', 'log', 'exp', 's-curve'] as const,
  defaultValue: 'linear',
}

const RANGE_MIN: SourceFieldSpec = {
  key: 'min',
  label: 'Range min',
  kind: 'float',
  helperText: 'Lower bound of normalized output (0-1 typical)',
}

const RANGE_MAX: SourceFieldSpec = {
  key: 'max',
  label: 'Range max',
  kind: 'float',
  helperText: 'Upper bound of normalized output (0-1 typical)',
}

export const SOURCE_TYPE_SPECS: readonly SourceTypeSpec[] = [
  {
    type: 'midi_cc',
    label: 'MIDI CC',
    citation: 'app/services/midi/projections/global_param.py make_create_payload',
    fields: [
      CHANNEL,
      { key: 'cc', label: 'CC number', kind: 'int', min: 0, max: 127, step: 1, required: true },
      CURVE,
      RANGE_MIN,
      RANGE_MAX,
    ],
  },
  {
    type: 'midi_note',
    label: 'MIDI Note',
    citation: 'app/services/midi/projections/global_param.py make_create_payload',
    fields: [
      CHANNEL,
      { key: 'note', label: 'Note number', kind: 'int', min: 0, max: 127, step: 1, required: true },
      { key: 'velocity_min', label: 'Velocity min', kind: 'int', min: 0, max: 127, step: 1 },
      { key: 'velocity_max', label: 'Velocity max', kind: 'int', min: 0, max: 127, step: 1 },
    ],
  },
  {
    type: 'midi_pc',
    label: 'MIDI Program Change',
    citation: 'app/services/midi/projections/snapshot.py source_type heuristic',
    fields: [
      CHANNEL,
      { key: 'program_number', label: 'Program number', kind: 'int', min: 0, max: 127, step: 1, required: true },
    ],
  },
  {
    type: 'midi_nrpn',
    label: 'MIDI NRPN',
    citation: 'app/services/midi/projections/snapshot.py source_type heuristic',
    fields: [
      CHANNEL,
      { key: 'nrpn_msb', label: 'NRPN MSB', kind: 'int', min: 0, max: 127, step: 1, required: true },
      { key: 'nrpn_lsb', label: 'NRPN LSB', kind: 'int', min: 0, max: 127, step: 1, required: true },
      CURVE,
      RANGE_MIN,
      RANGE_MAX,
    ],
  },
  {
    type: 'midi_sysex',
    label: 'MIDI SysEx',
    citation: 'app/services/midi_sysex_bridge_base.py decode',
    fields: [
      { key: 'manufacturer_id', label: 'Manufacturer ID (hex)', kind: 'string', helperText: 'e.g. "06" for Lexicon' },
      { key: 'pattern_hex', label: 'Match pattern (hex)', kind: 'string', helperText: 'whitespace-separated bytes' },
      { key: 'match_mode', label: 'Match mode', kind: 'enum', enumValues: ['prefix', 'exact', 'regex'] as const, defaultValue: 'prefix' },
    ],
  },
  {
    type: 'midi_clock',
    label: 'MIDI Clock',
    citation: 'app/services/midi/midi_transport.py clock receive path',
    fields: [
      { key: 'clock_type', label: 'Clock event', kind: 'enum', enumValues: ['tick', 'start', 'stop', 'continue'] as const, required: true },
    ],
  },
  {
    type: 'midi_aftertouch',
    label: 'MIDI Polyphonic Aftertouch',
    citation: 'libremidi aftertouch event shape',
    fields: [
      CHANNEL,
      { key: 'note', label: 'Note number (omit for all)', kind: 'int', min: 0, max: 127, step: 1 },
    ],
  },
  {
    type: 'midi_pitchbend',
    label: 'MIDI Pitch Bend',
    citation: 'libremidi pitchbend event shape',
    fields: [
      CHANNEL,
      { key: 'min', label: 'Output min', kind: 'float' },
      { key: 'max', label: 'Output max', kind: 'float' },
    ],
  },
  {
    type: 'midi_channel_pressure',
    label: 'MIDI Channel Pressure',
    citation: 'libremidi channel pressure event shape',
    fields: [CHANNEL, RANGE_MIN, RANGE_MAX],
  },
  {
    type: 'ttp_subscription',
    label: 'Tesira TTP Subscription',
    citation: 'app/services/midi_hub/tesira_client.py subscription shape',
    fields: [
      { key: 'device_id', label: 'Device ID', kind: 'string', required: true },
      { key: 'attribute_path', label: 'Attribute path', kind: 'string', required: true, helperText: 'e.g. "Mixer1.input.1.level"' },
      { key: 'feedback_attribute', label: 'Feedback attribute (optional)', kind: 'string' },
    ],
  },
  {
    type: 'gpio_input',
    label: 'GPIO Input',
    citation: 'app/services/midi_hub/virtual_gpio.py pin shape',
    fields: [
      { key: 'pin_id', label: 'Pin ID', kind: 'string', required: true },
      { key: 'active_state', label: 'Active state', kind: 'enum', enumValues: ['high', 'low'] as const, defaultValue: 'high' },
    ],
  },
  {
    type: 'string_command',
    label: 'String Command',
    citation: 'app/services/midi_hub/string_interface.py match shape',
    fields: [
      { key: 'match_pattern', label: 'Match pattern', kind: 'string', required: true },
      { key: 'match_mode', label: 'Match mode', kind: 'enum', enumValues: ['literal', 'regex', 'prefix'] as const, defaultValue: 'literal' },
    ],
  },
] as const

const SPECS_BY_TYPE = new Map<BindingSourceType, SourceTypeSpec>(
  SOURCE_TYPE_SPECS.map((s) => [s.type, s]),
)

export function getSourceSpec(type: BindingSourceType): SourceTypeSpec | undefined {
  return SPECS_BY_TYPE.get(type)
}

export function defaultDescriptorFor(type: BindingSourceType): Record<string, unknown> {
  const spec = getSourceSpec(type)
  if (!spec) return {}
  const out: Record<string, unknown> = {}
  for (const field of spec.fields) {
    if (field.defaultValue !== undefined) {
      out[field.key] = field.defaultValue
    }
  }
  return out
}

/**
 * Split a descriptor into known fields (per the spec for the given
 * source_type) and unknown extras. Used by the editor to round-trip
 * edits without losing backend extensions (per the iter-111 plan D2).
 */
export interface KnownAndUnknown {
  known: Record<string, unknown>
  unknown: Record<string, unknown>
}

export function extractKnownAndUnknown(
  descriptor: Record<string, unknown>,
  type: BindingSourceType,
): KnownAndUnknown {
  const spec = getSourceSpec(type)
  if (!spec) {
    return { known: {}, unknown: { ...descriptor } }
  }
  const knownKeys = new Set(spec.fields.map((f) => f.key))
  const known: Record<string, unknown> = {}
  const unknown: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(descriptor)) {
    if (knownKeys.has(k)) {
      known[k] = v
    } else {
      unknown[k] = v
    }
  }
  return { known, unknown }
}

/**
 * Merge a structured-editor's emitted dict back with the unknown extras
 * captured by extractKnownAndUnknown. This is what gets PATCHed.
 */
export function mergeForSave(
  editorOutput: Record<string, unknown>,
  unknown: Record<string, unknown>,
): Record<string, unknown> {
  return { ...unknown, ...editorOutput }
}
