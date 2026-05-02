/**
 * T2488 — extracted pure helpers from
 * web/src/app/pages/GroundControlProPage.tsx.
 *
 * Path A (file-level decomposition, single-view migration). The
 * page's 5-tab UI is already cleanly tabbed via Carbon Tabs but
 * the tabs share so much state (GroundControlModel, validation
 * reports, ports, job, session, …) that extracting the tab bodies
 * into separate files would require ~25-prop pass-throughs each.
 * This iter ships the highest-value piece: extract pure helpers
 * + migrate to the unified shell. Tab-body extraction queued as a
 * separate follow-up if the maintenance burden actually demands it.
 */

import { Tag } from '@carbon/react'
import type {
  GroundControlModel,
  GroundControlValidationReport,
} from '../../../../map2/groundControlProApi'

/** Bank 11, slot 0 marker — Voodoo Lab GCP Pro convention. */
export const PRESET_AREA_OFFSET = 166

export function cloneModel(model: GroundControlModel): GroundControlModel {
  return JSON.parse(JSON.stringify(model)) as GroundControlModel
}

export function validationIsClean(
  validation: GroundControlValidationReport | null,
): boolean {
  if (!validation) return false
  return (
    validation.errors.length === 0 &&
    validation.exact_size_ok &&
    validation.preamble_ok &&
    validation.terminator_ok &&
    validation.offsets_ok &&
    validation.field_ranges_ok &&
    validation.unknown_bytes_preserved &&
    validation.round_trip_identity
  )
}

export function confidenceTagType(
  confidence: string,
): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  if (confidence === 'confirmed') return 'green'
  if (confidence === 'unknown_reserved') return 'red'
  return 'warm-gray'
}

export function boolToByte(value: boolean): number {
  return value ? 1 : 0
}

export function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function renderConfidenceTag(confidence: string) {
  return (
    <Tag type={confidenceTagType(confidence)} size="sm">
      {confidence}
    </Tag>
  )
}
