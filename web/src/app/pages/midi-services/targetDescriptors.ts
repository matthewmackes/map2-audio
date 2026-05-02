/**
 * T2482 loop 12 / iter 114 — target descriptor metadata + helpers.
 *
 * Sister to sourceDescriptors.ts (iter 112). Same shape, same
 * helpers, but per target_type. Citations point at backend
 * projection or service files where each target is consumed.
 */

import type { BindingTargetType } from '../../../map2/clients/midiBindings'

export type TargetFieldKind = 'int' | 'float' | 'string' | 'enum' | 'json'

export interface TargetFieldSpec {
  key: string
  label: string
  kind: TargetFieldKind
  required?: boolean
  min?: number
  max?: number
  step?: number
  enumValues?: readonly string[]
  defaultValue?: number | string
  helperText?: string
}

export interface TargetTypeSpec {
  type: BindingTargetType
  label: string
  fields: readonly TargetFieldSpec[]
  citation: string
}

export const TARGET_TYPE_SPECS: readonly TargetTypeSpec[] = [
  {
    type: 'engine_param',
    label: 'Engine plugin parameter',
    citation: 'app/services/midi/projections/global_param.py + plugin_param.py target_descriptor',
    fields: [
      { key: 'plugin_uri', label: 'Plugin URI', kind: 'string', required: true, helperText: 'e.g. "lv2:nam.cabinet"' },
      { key: 'param_index', label: 'Param index', kind: 'int', min: 0, step: 1, required: true },
      { key: 'param_label', label: 'Param label (display)', kind: 'string' },
      { key: 'feedback_cc', label: 'Feedback CC (0-127)', kind: 'int', min: 0, max: 127, step: 1 },
    ],
  },
  {
    type: 'engine_command',
    label: 'Engine RPC command',
    citation: 'app/services/juce_engine_service.py command dispatch',
    fields: [
      { key: 'command_path', label: 'Command path', kind: 'string', required: true, helperText: 'e.g. "audio.set_buffer_size"' },
      { key: 'args', label: 'Args (JSON object)', kind: 'json', helperText: 'positional/named args for the RPC' },
    ],
  },
  {
    type: 'snapshot_action',
    label: 'Snapshot action',
    citation: 'app/services/midi/projections/snapshot.py target_descriptor',
    fields: [
      {
        key: 'action',
        label: 'Action',
        kind: 'enum',
        enumValues: ['recall', 'store', 'next', 'previous', 'select'] as const,
        required: true,
      },
      { key: 'snapshot_id', label: 'Snapshot ID', kind: 'string', helperText: 'omit for relative actions' },
    ],
  },
  {
    type: 'brain_slot',
    label: 'Brain slot',
    citation: 'app/services/midi/projections/brain.py target_descriptor',
    fields: [
      { key: 'slot_id', label: 'Slot ID', kind: 'string', required: true },
      {
        key: 'mode',
        label: 'Mode',
        kind: 'enum',
        enumValues: ['momentary', 'latching', 'toggle'] as const,
        defaultValue: 'momentary',
      },
    ],
  },
  {
    type: 'device_command',
    label: 'Per-device RPC command',
    citation: 'app/services/midi_hub/* per-device command dispatch',
    fields: [
      { key: 'device_id', label: 'Device ID', kind: 'string', required: true },
      { key: 'command', label: 'Command', kind: 'string', required: true },
      { key: 'args', label: 'Args (JSON object)', kind: 'json' },
    ],
  },
  {
    type: 'macro',
    label: 'Macro',
    citation: 'app/services/midi/macro_service.py macro dispatch',
    fields: [
      { key: 'macro_id', label: 'Macro ID', kind: 'string', required: true },
      { key: 'args', label: 'Args (JSON object)', kind: 'json' },
    ],
  },
  {
    type: 'gpio_output',
    label: 'GPIO output',
    citation: 'app/services/midi_hub/virtual_gpio.py output dispatch',
    fields: [
      { key: 'pin_id', label: 'Pin ID', kind: 'string', required: true },
      {
        key: 'mode',
        label: 'Output mode',
        kind: 'enum',
        enumValues: ['high', 'low', 'pulse', 'toggle'] as const,
        defaultValue: 'pulse',
      },
      { key: 'pulse_ms', label: 'Pulse width (ms)', kind: 'int', min: 1, max: 60000, step: 1 },
    ],
  },
] as const

const SPECS_BY_TYPE = new Map<BindingTargetType, TargetTypeSpec>(
  TARGET_TYPE_SPECS.map((s) => [s.type, s]),
)

export function getTargetSpec(type: BindingTargetType): TargetTypeSpec | undefined {
  return SPECS_BY_TYPE.get(type)
}

export function defaultTargetDescriptorFor(type: BindingTargetType): Record<string, unknown> {
  const spec = getTargetSpec(type)
  if (!spec) return {}
  const out: Record<string, unknown> = {}
  for (const field of spec.fields) {
    if (field.defaultValue !== undefined) {
      out[field.key] = field.defaultValue
    }
  }
  return out
}

export interface TargetKnownAndUnknown {
  known: Record<string, unknown>
  unknown: Record<string, unknown>
}

export function extractTargetKnownAndUnknown(
  descriptor: Record<string, unknown>,
  type: BindingTargetType,
): TargetKnownAndUnknown {
  const spec = getTargetSpec(type)
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

export function mergeTargetForSave(
  editorOutput: Record<string, unknown>,
  unknown: Record<string, unknown>,
): Record<string, unknown> {
  return { ...unknown, ...editorOutput }
}
