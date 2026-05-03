export type HubPort = {
  port_id: string
  name: string
  direction: string
  kind: string
  // T2492-2 — USB descriptor + resolved device-profile id for the
  // /midi/connections "Unknown device" Tag entry point. All optional;
  // undefined means the backend did not surface that signal for this
  // port (typical for virtual / network / DIN ports).
  vendor_id?: string
  product_id?: string
  profile_id?: string
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readPorts(raw: unknown): HubPort[] {
  if (!Array.isArray(raw)) return []

  return raw.map((row, index) => {
    const record = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    return {
      port_id: String(record.port_id ?? `port-${index}`),
      name: String(record.name ?? record.port_id ?? `Port ${index + 1}`),
      direction: String(record.direction ?? 'duplex'),
      kind: String(record.kind ?? 'virtual'),
      vendor_id: readOptionalString(record, 'vendor_id'),
      product_id: readOptionalString(record, 'product_id'),
      profile_id: readOptionalString(record, 'profile_id'),
    }
  })
}

/**
 * T2492-2 — a port is "unknown" (no curated device-pack) when:
 *   1. It's an ALSA/USB port (kind === 'alsa' — virtual/network/DIN
 *      ports never need a USB device-pack).
 *   2. The backend resolved a USB VID/PID for it.
 *   3. The device-registry fell through to the `generic_controller`
 *      catch-all (or returned no profile at all).
 *
 * The Carbon Tag rendered by `MidiHubConnectedDevicesReport` opens
 * `DevicePackGeneratorModal` pre-populated with the port's VID/PID
 * + ALSA name as the seed for the auto-generator wizard.
 */
export function isUnknownDevicePort(port: HubPort): boolean {
  if (port.kind !== 'alsa') return false
  if (!port.vendor_id || !port.product_id) return false
  if (!port.profile_id) return true
  return port.profile_id === 'generic_controller'
}
