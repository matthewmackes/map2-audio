// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// overrideLoader behavior under Jest (no Vite, no import.meta.glob).
// T2459-C2.

import { findOverride, _registrySnapshotForTest } from './overrideLoader'

describe('overrideLoader — T2459-C2', () => {
  it('falls back to an empty registry when import.meta.glob is unavailable', () => {
    // Under Jest, the loader's eval-based check yields null and the
    // registry stays empty. This is the legitimate behaviour for a
    // CommonJS test runner; Vite resolves the globs at build time.
    expect(_registrySnapshotForTest()).toEqual([])
  })

  it('returns null for any pack/model when registry is empty', () => {
    expect(findOverride('edirol-ua', 'ua-1000')).toBeNull()
    expect(findOverride('hotone', 'jogg')).toBeNull()
    expect(findOverride('whatever', 'whatever')).toBeNull()
  })
})
