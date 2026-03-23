export type HubPort = {
  port_id: string
  name: string
  direction: string
  kind: string
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
    }
  })
}
