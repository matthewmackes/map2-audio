/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 *
 * Pure utility functions used by the sub-components. apiFetch is a
 * tiny no-cache JSON wrapper kept here so each sub-component doesn't
 * duplicate the boilerplate.
 */

import { API_BASE } from './expressionConstants'
import type { Curve, CurvePoint } from './expressionTypes'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${path}`)
  }
  return response.json() as Promise<T>
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function applyCurve(value: number, curve: Curve): number {
  const t = clamp01(value)
  if (curve === 'log') return t * t
  if (curve === 'exp') return t ** 0.5
  if (curve === 'scurve') return t * t * (3 - 2 * t)
  return t
}

export function sampleCustomCurve(t: number, p1: CurvePoint, p2: CurvePoint): number {
  const u = 1 - t
  const p0y = 0
  const p3y = 1
  return (
    u ** 3 * p0y +
    3 * u ** 2 * t * p1.y +
    3 * u * t ** 2 * p2.y +
    t ** 3 * p3y
  )
}

export function curvePath(
  curve: Curve,
  customCurve: CurvePoint[],
  width: number,
  height: number,
): string {
  const pts: string[] = []
  const p1 = customCurve[0] || { x: 0.3, y: 0.3 }
  const p2 = customCurve[1] || { x: 0.7, y: 0.7 }
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40
    const y = curve === 'custom' ? sampleCustomCurve(t, p1, p2) : applyCurve(t, curve)
    const xPx = t * width
    const yPx = (1 - clamp01(y)) * height
    pts.push(`${xPx.toFixed(2)},${yPx.toFixed(2)}`)
  }
  return `M ${pts.join(' L ')}`
}
