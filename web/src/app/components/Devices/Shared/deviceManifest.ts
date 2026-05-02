/**
 * T2485-1 — per-device manifest schema.
 *
 * Each MIDI-controlling device that gets unified under
 * /midi/devices/:profileKey/* exports a `deviceManifest` object whose
 * shape is defined here. The manifest is the source of truth for:
 *   - the human-readable title on the device's landing view
 *   - the 3-line purpose description (rendered on the landing view only,
 *     per the Q4 decision recorded in PROJECT_WORKLIST.md T2485 entry)
 *   - the list of view IDs the device exposes under the unified shell
 *   - the canonical profile key the manifest binds to (used to look the
 *     manifest up from the route param)
 *
 * The manifest is hard-coded per-device (no backend round-trip) per the
 * Q3 decision (Option A): reviewer-readable, version-controlled, fast.
 */

export interface DeviceManifestView {
  /** Path segment under /midi/devices/:profileKey/. */
  id: string
  /** Sidebar / tab label. */
  label: string
  /**
   * Marks this view as the device's "landing" view — the only place the
   * 3-line purpose description renders. Exactly one view per manifest
   * MUST be marked landing=true. Subsequent views render without the
   * description block (operator already knows what device they're on).
   */
  landing?: boolean
}

export interface DeviceManifest {
  /** Canonical device-pack profile key (e.g. "lexicon/mpx-1.midi"). */
  profileKey: string
  /** Display title used in the device shell header. */
  title: string
  /**
   * Three short sentences describing the device's purpose. Rendered on
   * the landing view only. Exactly three lines required by the schema
   * to keep visual rhythm consistent across devices.
   */
  purposeLines: [string, string, string]
  /** Views the device exposes. The first view marked landing=true is the index target. */
  views: DeviceManifestView[]
}

export class DeviceManifestSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeviceManifestSchemaError'
  }
}

/**
 * Validates a device manifest at module load time. Throws
 * DeviceManifestSchemaError on any structural problem so the failure
 * surfaces during build/test rather than at runtime when an operator
 * happens to land on the affected page.
 */
export function validateDeviceManifest(manifest: DeviceManifest): void {
  if (!manifest.profileKey) {
    throw new DeviceManifestSchemaError('profileKey is required')
  }
  if (!manifest.title) {
    throw new DeviceManifestSchemaError(`title is required (profileKey=${manifest.profileKey})`)
  }
  if (!Array.isArray(manifest.purposeLines) || manifest.purposeLines.length !== 3) {
    throw new DeviceManifestSchemaError(
      `purposeLines must contain exactly 3 entries (profileKey=${manifest.profileKey})`
    )
  }
  for (const line of manifest.purposeLines) {
    if (typeof line !== 'string' || line.trim().length === 0) {
      throw new DeviceManifestSchemaError(
        `purposeLines entries must be non-empty strings (profileKey=${manifest.profileKey})`
      )
    }
  }
  if (!Array.isArray(manifest.views) || manifest.views.length === 0) {
    throw new DeviceManifestSchemaError(
      `views must contain at least one entry (profileKey=${manifest.profileKey})`
    )
  }
  const ids = new Set<string>()
  let landingCount = 0
  for (const view of manifest.views) {
    if (!view.id || !view.label) {
      throw new DeviceManifestSchemaError(
        `view.id and view.label are required (profileKey=${manifest.profileKey})`
      )
    }
    if (ids.has(view.id)) {
      throw new DeviceManifestSchemaError(
        `view.id "${view.id}" is duplicated (profileKey=${manifest.profileKey})`
      )
    }
    ids.add(view.id)
    if (view.landing) landingCount += 1
  }
  if (landingCount !== 1) {
    throw new DeviceManifestSchemaError(
      `exactly one view must be marked landing=true (got ${landingCount}, profileKey=${manifest.profileKey})`
    )
  }
}

/**
 * Returns the landing view for a manifest. Assumes the manifest has
 * already been validated (caller responsibility — usually at module
 * load via validateDeviceManifest).
 */
export function getLandingViewId(manifest: DeviceManifest): string {
  const landing = manifest.views.find((v) => v.landing)
  if (!landing) {
    throw new DeviceManifestSchemaError(
      `no landing view found (profileKey=${manifest.profileKey}); call validateDeviceManifest at module load`
    )
  }
  return landing.id
}
