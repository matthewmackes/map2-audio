import type {
  SnapshotDetail,
  SnapshotExpressionCurve,
  SnapshotExpressionMapping,
  SnapshotExpressionTarget,
} from '../../map2/types'

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function clampFloat(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCurve(value: unknown): SnapshotExpressionCurve {
  const normalized = String(value ?? 'linear').trim().toLowerCase()
  if (normalized === 'log' || normalized === 'logarithmic') return 'logarithmic'
  if (normalized === 'exp' || normalized === 'exponential') return 'exponential'
  if (normalized === 'scurve' || normalized === 's_curve') return 's_curve'
  if (normalized === 'custom') return 'custom'
  return 'linear'
}

function normalizeTarget(
  mappingId: string,
  entry: Record<string, unknown>,
  targetIndex: number,
): SnapshotExpressionTarget | null {
  const paramId = String(entry.param_id ?? '').trim()
  if (!paramId) {
    return null
  }
  return {
    id: String(entry.id ?? `${mappingId}-target-${targetIndex + 1}`),
    param_id: paramId,
    param_label: String(entry.param_label ?? paramId),
    target_plugin_uri: typeof entry.target_plugin_uri === 'string' ? entry.target_plugin_uri : null,
    target_plugin_position: typeof entry.target_plugin_position === 'number' && Number.isFinite(entry.target_plugin_position)
      ? Math.trunc(entry.target_plugin_position)
      : null,
    param_index: typeof entry.param_index === 'number' && Number.isFinite(entry.param_index)
      ? Math.trunc(entry.param_index)
      : null,
    parameter_symbol: typeof entry.parameter_symbol === 'string' ? entry.parameter_symbol : null,
    out_min: clampFloat(entry.out_min, 0),
    out_max: clampFloat(entry.out_max, 1),
    curve: normalizeCurve(entry.curve),
    custom_curve: Array.isArray(entry.custom_curve)
      ? entry.custom_curve
        .filter((point): point is { x?: unknown; y?: unknown } => typeof point === 'object' && point !== null)
        .slice(0, 2)
        .map((point) => ({
          x: Math.max(0, Math.min(1, clampFloat(point.x, 0))),
          y: Math.max(0, Math.min(1, clampFloat(point.y, 0))),
        }))
      : [],
    active: entry.active !== false,
  }
}

export function normalizeSnapshotExpressionMappings(value: unknown): SnapshotExpressionMapping[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item, index) => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const entry = item as Record<string, unknown>
    const mappingId = String(entry.id ?? `snapshot-expression-${index + 1}`)
    const rawTargets = Array.isArray(entry.targets) ? entry.targets : [entry]
    const targets = rawTargets.flatMap((target, targetIndex) => {
      if (typeof target !== 'object' || target === null) {
        return []
      }
      const normalized = normalizeTarget(mappingId, target as Record<string, unknown>, targetIndex)
      return normalized ? [normalized] : []
    })
    if (targets.length === 0) {
      return []
    }
    return [{
      id: mappingId,
      label: String(entry.label ?? entry.name ?? `Expression ${index + 1}`),
      cc: clampInt(entry.cc, 0, 0, 127),
      channel: clampInt(entry.channel, 0, 0, 16),
      cc_min: clampInt(entry.cc_min, 0, 0, 127),
      cc_max: clampInt(entry.cc_max, 127, 0, 127),
      active: entry.active !== false,
      targets,
    }]
  })
}

export function createDefaultSnapshotExpressionMapping(
  index: number,
  defaultTarget?: { id: string; label: string; min: number; max: number },
): SnapshotExpressionMapping {
  return {
    id: `snapshot-expression-${index + 1}`,
    label: `Expression ${index + 1}`,
    cc: 11,
    channel: 0,
    cc_min: 0,
    cc_max: 127,
    active: true,
    targets: [{
      id: `snapshot-expression-${index + 1}-target-1`,
      param_id: defaultTarget?.id ?? 'engine.reverb_mix',
      param_label: defaultTarget?.label ?? 'Reverb Mix',
      out_min: defaultTarget?.min ?? 0,
      out_max: defaultTarget?.max ?? 1,
      curve: 'linear',
      custom_curve: [],
      active: true,
    }],
  }
}

export function normalizeSnapshotExpressionMappingsSnapshot(
  snapshot: SnapshotDetail,
  mappings: SnapshotExpressionMapping[],
): SnapshotDetail {
  return {
    ...snapshot,
    controls: {
      ...snapshot.controls,
      expression_mappings: normalizeSnapshotExpressionMappings(mappings),
    },
  }
}
