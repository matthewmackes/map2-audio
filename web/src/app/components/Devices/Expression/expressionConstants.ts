/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 */

import type { Curve } from './expressionTypes'

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

export const CURVES: Array<{ id: Curve; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'log', label: 'Logarithmic' },
  { id: 'exp', label: 'Exponential' },
  { id: 'scurve', label: 'S-Curve' },
  { id: 'custom', label: 'Custom' },
]
