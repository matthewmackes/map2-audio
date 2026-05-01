// Pure helpers for the inline "name this device" onboarding step
// (T2480 Follow-up D, 2026-05-01) on the Detect phase.

const ALPHANUM_RUN = /[^a-z0-9]+/g

/** Convert an operator-supplied display name into a stable, registry-safe
 * profile_id. Lowercased, non-alphanumerics collapsed to underscores,
 * stripped at edges. Empty input → 'unnamed_device'. */
export function slugifyProfileId(name: string): string {
  const lowered = name.trim().toLowerCase()
  const slugged = lowered.replace(ALPHANUM_RUN, '_').replace(/^_+|_+$/g, '')
  return slugged || 'unnamed_device'
}

/** Strip the generic_controller prefix from a generic device_id so the
 * suggested profile_id doesn't carry it. e.g.
 *   "generic_controller:my_random_port" → "my_random_port" */
export function stripGenericPrefix(deviceId: string): string {
  const prefix = 'generic_controller:'
  return deviceId.startsWith(prefix) ? deviceId.slice(prefix.length) : deviceId
}

/** Validate a proposed display name. Returns null when valid, an
 * error message string when invalid. */
export function validateDeviceName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Name cannot be empty.'
  if (trimmed.length > 80) return 'Name is too long (80 characters max).'
  // Reserved prefix collision — operators shouldn't be able to write a
  // name that slug-collides with the generic-fallback profile_id.
  if (slugifyProfileId(trimmed) === 'generic_controller') {
    return 'That name is reserved.'
  }
  return null
}

/** Build a registry-safe match_pattern from the operator's display name +
 * the actual ALSA port name we observed. The registry's pattern matcher
 * is substring-based (case-insensitive); we feed it both signals so the
 * onboarding sticks even if the port name shifts on the next plug-in. */
export function buildMatchPatterns(displayName: string, portName: string): string[] {
  const display = displayName.trim()
  const port = portName.trim()
  const patterns = new Set<string>()
  if (display) patterns.add(display)
  if (port) patterns.add(port)
  return Array.from(patterns)
}
