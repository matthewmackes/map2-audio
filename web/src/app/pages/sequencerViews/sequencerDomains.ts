// T2527 — Sequencer task-domain IA.
//
// The Sequencer page historically rendered a flat row of 14 section tabs.
// T2526 audited that surface and the operator locked a 5-domain regroup
// (confirmed 2026-06-02). This module is the single source of truth for that
// mapping: each primary domain owns an ordered list of the existing
// `SectionId`s. The section -> body render in SequencerPage stays intact; the
// domains are a grouping layer ABOVE the section tabs.
//
// LOCKED MAPPING (operator-confirmed — do not reshuffle without a new lock):
//   Perform      : performance, perform, split, inputs
//   Sound/Parts  : layers, library
//   Sequence     : step, sequence
//   Mix/Route    : console, routing
//   Media/Setup  : setup, session_media, practice_coach, diagnostics
//
// Invariant (pinned by a test): the union of every domain's `sections` equals
// SECTION_IDS exactly — every section is reachable through exactly one domain,
// with no duplicates and no orphans.

import {
  Catalog,
  Flow,
  PlayFilled,
  Router,
  Settings,
} from '@carbon/icons-react'

import type { SectionId } from './sequencerSectionIds'

export type PrimaryDomainId =
  | 'perform'
  | 'sound_parts'
  | 'sequence'
  | 'mix_route'
  | 'media_setup'

export interface PrimaryDomainMeta {
  /** Operator-facing label for the primary mode selector. */
  label: string
  /** Short mono caption rendered under the label. */
  sub: string
  /** Carbon icon for the domain pill. */
  Icon: typeof PlayFilled
  /** Ordered member sections; first entry is the domain's landing section. */
  sections: readonly SectionId[]
}

export const PRIMARY_DOMAIN_IDS: readonly PrimaryDomainId[] = [
  'perform',
  'sound_parts',
  'sequence',
  'mix_route',
  'media_setup',
] as const

export const DOMAIN_MODEL: Record<PrimaryDomainId, PrimaryDomainMeta> = {
  perform: {
    label: 'Perform',
    sub: 'Live · Splits · Inputs',
    Icon: PlayFilled,
    sections: ['performance', 'perform', 'split', 'inputs'],
  },
  sound_parts: {
    label: 'Sound / Parts',
    sub: 'Layers · Library',
    Icon: Catalog,
    sections: ['layers', 'library'],
  },
  sequence: {
    label: 'Sequence',
    sub: 'Steps · Patterns',
    Icon: Flow,
    sections: ['step', 'sequence'],
  },
  mix_route: {
    label: 'Mix / Route',
    sub: 'Console · Routing',
    Icon: Router,
    sections: ['console', 'routing'],
  },
  media_setup: {
    label: 'Media / Setup',
    sub: 'Setup · Media · Diagnostics',
    Icon: Settings,
    sections: ['setup', 'session_media', 'practice_coach', 'diagnostics'],
  },
}

/**
 * Reverse index: section id -> owning domain id. Built once from DOMAIN_MODEL
 * so the active domain can be derived from the active section in O(1).
 */
export const SECTION_TO_DOMAIN: Record<SectionId, PrimaryDomainId> = (() => {
  const index = {} as Record<SectionId, PrimaryDomainId>
  for (const domainId of PRIMARY_DOMAIN_IDS) {
    for (const sectionId of DOMAIN_MODEL[domainId].sections) {
      index[sectionId] = domainId
    }
  }
  return index
})()

/** The domain that owns the given section (every section maps to exactly one). */
export function domainForSection(sectionId: SectionId): PrimaryDomainId {
  return SECTION_TO_DOMAIN[sectionId]
}

/** The landing (first) section of a domain — used when switching domains. */
export function firstSectionOfDomain(domainId: PrimaryDomainId): SectionId {
  return DOMAIN_MODEL[domainId].sections[0]
}
