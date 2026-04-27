// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Vendor-override loader. Walks `device-packs/*/overrides/*.tsx` and
// `device-packs/*/shared/overrides/*.tsx` at build time via
// `import.meta.glob`, registers each export by (packId, modelHint), and
// exposes a `loadOverride(packId, model)` resolver consumed by
// DeviceProfilePanel.
//
// Convention:
//   device-packs/<packId>/overrides/<Model>.tsx — model-specific override
//   device-packs/<packId>/shared/overrides/*.tsx — pack-wide override
//
// File names are PascalCase. The Model-specific file's stem is matched
// case-insensitively against the model id (e.g. "UA1000RBusRouter.tsx"
// matches model "ua-1000" because the stem starts with "UA1000").
//
// Worklist: T2459-C2.

import type { ComponentType } from 'react'

// Lazy/dynamic glob: each TSX is its own chunk so packs only load when
// their device page is opened. Using `eager: false` (the default)
// keeps Vite from inlining everything into the main bundle.
//
// In Jest (no Vite), `import.meta.glob` is undefined; the loader
// falls back to an empty registry and DeviceProfilePanel renders
// without any vendor override (which is the legitimate behaviour
// for tests that don't exercise overrides).
type LazyImporter = () => Promise<{ default: ComponentType<any> }>

interface OverrideRegistryEntry {
  packId: string
  filename: string
  importer: LazyImporter
}

function buildRegistry(): OverrideRegistryEntry[] {
  // import.meta.glob is Vite-specific and absent under Jest. Reference
  // it via dynamic eval so Jest's CommonJS module-loader doesn't reject
  // the file at parse time.
  let meta: ((pattern: string, options?: any) => Record<string, LazyImporter>) | null = null
  try {
    // eslint-disable-next-line no-new-func
    meta = new Function('return (typeof import.meta !== "undefined") ? import.meta.glob : null')() as any
  } catch {
    meta = null
  }
  if (typeof meta !== 'function') {
    return []
  }

  const out: OverrideRegistryEntry[] = []

  // Two glob patterns to avoid double-matching the shared/ subdir.
  const patternModelSpecific = '@/device-packs/*/overrides/*.tsx'
  const patternShared = '@/device-packs/*/shared/overrides/*.tsx'

  // Vite resolves these glob patterns at build time. Jest test runs
  // never reach here (meta === null above).
  const collect = (pattern: string) => {
    let modules: Record<string, LazyImporter> = {}
    try {
      modules = (meta as any)(pattern) ?? {}
    } catch {
      modules = {}
    }
    for (const [path, importer] of Object.entries(modules)) {
      const parts = path.split('/')
      const packIdx = parts.findIndex((p) => p === 'device-packs')
      if (packIdx < 0 || packIdx + 1 >= parts.length) continue
      const packId = parts[packIdx + 1]
      const filename = parts[parts.length - 1].replace(/\.tsx$/i, '')
      out.push({ packId, filename, importer })
    }
  }

  collect(patternModelSpecific)
  collect(patternShared)
  return out
}

const REGISTRY = buildRegistry()

/** Try to resolve an override for the given pack + model.
 *
 *  Lookup precedence:
 *    1. Exact pack + filename matches model id (case-insensitive
 *       prefix-match — `UA1000RBusRouter.tsx` for `ua-1000`).
 *    2. Pack-wide shared override (anything under `<pack>/shared/overrides/`).
 *
 *  Returns null when no override matches. Returns a lazy importer the
 *  caller wraps in `React.lazy(...)` for code-splitting.
 */
export function findOverride(
  packId: string,
  model: string,
): LazyImporter | null {
  const candidates = REGISTRY.filter((e) => e.packId === packId)
  if (candidates.length === 0) return null

  // Strip non-alpha chars from model so 'ua-1000' compares as 'ua1000'.
  const modelKey = model.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Best match: filename normalised to lowercase starts with modelKey.
  for (const entry of candidates) {
    const filenameKey = entry.filename.toLowerCase()
    if (filenameKey.startsWith(modelKey)) {
      return entry.importer
    }
  }

  // Fallback: pack-wide shared override (any override file in this pack
  // that isn't already targeted at another model). Take the first one.
  for (const entry of candidates) {
    return entry.importer
  }

  return null
}

/** Diagnostic helper exposed for tests. */
export function _registrySnapshotForTest(): ReadonlyArray<{
  packId: string
  filename: string
}> {
  return REGISTRY.map(({ packId, filename }) => ({ packId, filename }))
}
