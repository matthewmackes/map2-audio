import type { ReactNode } from 'react'

import type {
  BrainControllerQualification,
  BrainDiagnostics,
  BrainLayer,
  BrainMixerState,
  BrainSequence,
  BrainSlot,
  BrainState,
  BrainTransportState,
  BrainInputsState,
} from '@/map2/api'

export type BrainViewId = 'performance' | 'console' | 'step' | 'split'

export const BRAIN_VIEW_IDS: readonly BrainViewId[] = ['performance', 'console', 'step', 'split'] as const

export interface BrainOverviewSharedProps {
  state: BrainState
  transport: BrainTransportState
  slots: BrainSlot[]
  layers: BrainLayer[]
  sequence: BrainSequence
  mixer: BrainMixerState
  inputs: BrainInputsState
  diagnostics: BrainDiagnostics
  onTransportPatch: (patch: Partial<BrainTransportState>) => void
  onSlotSelect: (slotId: number) => void
  onSlotUpdate: (slotId: number, patch: Partial<BrainSlot>) => void
}

export function computeWarnCount(diagnostics: BrainDiagnostics): number {
  return (diagnostics.controller_qualification.issues.length ?? 0) + (diagnostics.warnings.length ?? 0)
}

export function qualificationReadyCount(qualification: BrainControllerQualification): number {
  return qualification.ready_surface_count
}

export const SLOT_COLOR_ORDER = [
  '#3b82f6',
  '#22d3ee',
  '#a78bfa',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
  '#d946ef',
  '#f43f5e',
  '#84cc16',
  '#14b8a6',
  '#8b5cf6',
  '#e2e8f0',
]

// Color is derived from slot index, not slot identity — the slot argument
// is kept for API symmetry / future-proofing only. Marked optional so
// callers can safely pass undefined for missing-lane fallbacks.
export function slotColor(_slot: BrainSlot | undefined, index: number): string {
  return SLOT_COLOR_ORDER[index % SLOT_COLOR_ORDER.length]
}

export function gridClassForCount(n: number): 'bo-pads__grid--4' | 'bo-pads__grid--6' | 'bo-pads__grid--8' {
  if (n <= 8) return 'bo-pads__grid--4'
  if (n <= 12) return 'bo-pads__grid--6'
  return 'bo-pads__grid--8'
}

export function formatMs(value: number): string {
  return value.toFixed(1)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatPosition(transport: BrainTransportState): string {
  const bar = String(transport.bar + 1).padStart(3, '0')
  const beat = String(transport.beat + 1).padStart(2, '0')
  const step = String(transport.step).padStart(3, '0')
  return `${bar}.${beat}.${step}`
}

export function BoTag({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent'
}) {
  return <span className={`bo-tag${tone !== 'default' ? ` bo-tag--${tone}` : ''}`}>{children}</span>
}

export function BoKV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bo-kv">
      <div className="bo-kv__label">{label}</div>
      <div className="bo-kv__value">{value}</div>
    </div>
  )
}
