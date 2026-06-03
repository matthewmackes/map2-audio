// T2527 — canonical Sequencer section ids.
//
// Extracted from SequencerPage so the domain model (sequencerDomains.ts) and
// the page can share the same `SectionId` union + `SECTION_IDS` array without a
// circular import. The section -> body render logic and per-section tab
// metadata still live in SequencerPage; this module is purely the id contract.
//
// T2442 history: Brain Overview tabs are first-class section ids. The legacy
// `overview` aggregate is gone; `performance` is the default landing tab.

export type SectionId =
  | 'performance'
  | 'console'
  | 'step'
  | 'split'
  | 'setup'
  | 'perform'
  | 'layers'
  | 'sequence'
  | 'routing'
  | 'inputs'
  | 'library'
  | 'session_media'
  | 'practice_coach'
  | 'diagnostics'

export const SECTION_IDS: readonly SectionId[] = [
  'performance',
  'console',
  'step',
  'split',
  'setup',
  'perform',
  'layers',
  'sequence',
  'routing',
  'inputs',
  'library',
  'session_media',
  'practice_coach',
  'diagnostics',
] as const

export function parseSectionSearchParam(value: string | null): SectionId | undefined {
  return SECTION_IDS.includes(value as SectionId) ? (value as SectionId) : undefined
}
