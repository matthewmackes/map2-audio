/**
 * T2521-7 cycle 35 — SonoBus interface-ID guards (frontend).
 *
 * Mirrors the backend `app/services/sonobus/interface_ids.py`
 * helpers (`SONOBUS_ID_PREFIX`, `make_sonobus_interface_id`,
 * `is_sonobus_interface_id`, `parse_sonobus_interface_id`,
 * `assert_not_sonobus_id`) so the frontend can identify SonoBus
 * IDs without round-tripping through the backend.
 *
 * The canonical shape is `sonobus:<peer>:<group>:<stream>`.
 */

/** Canonical prefix. Matches `SONOBUS_ID_PREFIX` in the backend module. */
export const SONOBUS_ID_PREFIX = 'sonobus:'

/**
 * `true` when `id` is a non-empty string and starts with the
 * SonoBus prefix. The parse helper validates the colon-delimited
 * shape more strictly.
 */
export function isSonoBusInterfaceId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(SONOBUS_ID_PREFIX) && id.length > SONOBUS_ID_PREFIX.length
}

export interface ParsedSonoBusInterfaceId {
  peer: string
  group: string
  stream: string
}

/**
 * Parse a `sonobus:<peer>:<group>:<stream>` string into its
 * components. Returns `null` for any input that doesn't match the
 * full 4-segment shape — empty fields are rejected per the backend
 * `make_sonobus_interface_id` contract.
 */
export function parseSonoBusInterfaceId(id: string): ParsedSonoBusInterfaceId | null {
  if (!isSonoBusInterfaceId(id)) return null
  const remainder = id.slice(SONOBUS_ID_PREFIX.length)
  const parts = remainder.split(':')
  if (parts.length !== 3) return null
  const [peer, group, stream] = parts
  if (!peer || !group || !stream) return null
  return { peer, group, stream }
}

/**
 * Build the canonical `sonobus:<peer>:<group>:<stream>` id.
 * Throws if any part is empty or contains a colon — matches the
 * backend's `make_sonobus_interface_id` reject path so the two
 * sides never disagree about ID validity.
 */
export function makeSonoBusInterfaceId(peer: string, group: string, stream: string): string {
  if (!peer || !group || !stream) {
    throw new Error('makeSonoBusInterfaceId: peer / group / stream must all be non-empty')
  }
  if (peer.includes(':') || group.includes(':') || stream.includes(':')) {
    throw new Error('makeSonoBusInterfaceId: parts cannot contain ":"')
  }
  return `${SONOBUS_ID_PREFIX}${peer}:${group}:${stream}`
}
