/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 *
 * Type definitions for the Expression pedal control surface. Re-
 * exported from pages/ExpressionPage.tsx so existing consumers
 * (ExpressionOverlay) keep their import paths working.
 */

export interface CurvePoint {
  x: number
  y: number
}

export type Curve = 'linear' | 'log' | 'exp' | 'scurve' | 'custom'

export interface Assignment {
  id: string
  cc: number
  channel: number
  cc_min: number
  cc_max: number
  param_id: string
  param_label: string
  out_min: number
  out_max: number
  curve: Curve
  custom_curve?: CurvePoint[]
  active: boolean
  source: string
}

export interface EngineParam {
  id: string
  label: string
  unit: string
  min: number
  max: number
}

export interface LiveStateItem {
  cc: number
  channel: number
  raw_value: number
  normalized: number
  curved: number
  mapped_value: number
  param_id: string
  param_label: string
  updated_at_ns: number
}

export type LiveState = Record<string, LiveStateItem>

export interface ListenResult {
  listener_id: string
  cc: number | null
  channel: number | null
  min_observed: number
  max_observed: number
  status: 'detected' | 'timeout' | 'cancelled'
}

export interface RetimeStats {
  mean_ms: number
  p95_ms: number
  max_ms: number
  sample_count: number
  status: string
  gate: string
}

export interface CcChannelPair {
  cc: number
  channel: number
}

export interface ExpressionViewProps {
  highlightedCcPairs?: CcChannelPair[]
  initialCc?: number | null
  initialChannel?: number | null
  onAssignmentMutated?: () => void
  constrainedWidth?: boolean
}
