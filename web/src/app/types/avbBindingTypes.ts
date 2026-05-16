// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-14c cycle 5 — hand-mirrored types for the AVB binding authority.
// Closes the follow-on filed in the 2026-05-16 snapshot codegen drift
// audit: the AVB binding consumer_type / source_type / target_type enums
// were only present in the generated snapshots.ts (T2455) — no
// frontend-facing hand-mirrored equivalent. This module supplies them
// so future AVB UI flows can narrow the enum without scraping the
// 125k-line generated file.
//
// Pydantic source of truth:
//   app/services/avb/binding_schemas.py
//
// Convention: when the Pydantic source adds an enum variant, append it
// here too. The snapshot codegen will also pick it up but this module
// is the one application code imports.

/** Mirrors AvbBindingConsumerType in app/services/avb/binding_schemas.py. */
export type AvbBindingConsumerType =
  | 'avdecc_stream'
  | 'tesira_preset'
  | 'tesira_block'
  | 'cluster_route'
  | 'srp_reservation'

/** Mirrors AvbBindingSourceType. */
export type AvbBindingSourceType =
  | 'avdecc_talker'
  | 'avdecc_listener'
  | 'tesira_subscription'
  | 'engine_signal'

/** Mirrors AvbBindingTargetType. */
export type AvbBindingTargetType =
  | 'avdecc_listener'
  | 'tesira_apply'
  | 'engine_sink'
  | 'cluster_listener'

/** Mirrors AvbBindingScope. */
export type AvbBindingScope = 'global' | 'snapshot' | 'node' | 'cluster'

/** Mirrors AvbSrpClass. */
export type AvbSrpClass = 'A' | 'B'

// ---------------------------------------------------------------------------
// Sets — useful for code that needs to iterate every valid value
// (e.g. dropdown rendering, filter chips). Tests in
// tests/test_avb_binding_types_codegen_pin.py verify these sets stay
// in lockstep with the Pydantic Literal members.
// ---------------------------------------------------------------------------

export const AVB_BINDING_CONSUMER_TYPES: readonly AvbBindingConsumerType[] = [
  'avdecc_stream',
  'tesira_preset',
  'tesira_block',
  'cluster_route',
  'srp_reservation',
] as const

export const AVB_BINDING_SOURCE_TYPES: readonly AvbBindingSourceType[] = [
  'avdecc_talker',
  'avdecc_listener',
  'tesira_subscription',
  'engine_signal',
] as const

export const AVB_BINDING_TARGET_TYPES: readonly AvbBindingTargetType[] = [
  'avdecc_listener',
  'tesira_apply',
  'engine_sink',
  'cluster_listener',
] as const

export const AVB_BINDING_SCOPES: readonly AvbBindingScope[] = [
  'global',
  'snapshot',
  'node',
  'cluster',
] as const

// ---------------------------------------------------------------------------
// Type guards — useful at runtime when reading untyped JSON from the API
// ---------------------------------------------------------------------------

export function isAvbBindingConsumerType(v: unknown): v is AvbBindingConsumerType {
  return (
    typeof v === 'string' &&
    (AVB_BINDING_CONSUMER_TYPES as readonly string[]).includes(v)
  )
}

export function isAvbBindingSourceType(v: unknown): v is AvbBindingSourceType {
  return (
    typeof v === 'string' &&
    (AVB_BINDING_SOURCE_TYPES as readonly string[]).includes(v)
  )
}

export function isAvbBindingTargetType(v: unknown): v is AvbBindingTargetType {
  return (
    typeof v === 'string' &&
    (AVB_BINDING_TARGET_TYPES as readonly string[]).includes(v)
  )
}

export function isAvbBindingScope(v: unknown): v is AvbBindingScope {
  return (
    typeof v === 'string' &&
    (AVB_BINDING_SCOPES as readonly string[]).includes(v)
  )
}
