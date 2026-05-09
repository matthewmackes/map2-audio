/**
 * T2499-A slice 2 — Configurator framework types.
 *
 * Shape contract between the framework shell and per-device tab
 * implementations. Mirrors the Python protocols in
 * `app/services/devices/_shared/protocols.py` so the wire format is
 * stable across slices.
 */
import type * as React from 'react'

export type DevicePresence =
  | 'not_present'
  | 'present_stock'
  | 'present_custom'
  | 'present_bootloader'
  | 'present_unknown'

export interface DeviceDetectionStatus {
  pack_id: string
  presence: DevicePresence
  transport: string
  serial?: string | null
  raw?: Record<string, unknown>
}

export type ConfiguratorPrimitive =
  | 'detection'
  | 'discovery'
  | 'override'
  | 'install'
  | 'push'

/**
 * Per-device tab descriptor. Each device-pack contributes zero or
 * more tabs; the shell renders them in `priority` order (low →
 * high) under the status card.
 */
export interface ConfiguratorTabDescriptor {
  id: string
  label: string
  /**
   * Lower priority renders first. Default `100`.
   */
  priority?: number
  /**
   * Only render this tab when the detector reports one of these
   * presence states. If omitted, the tab is always rendered.
   */
  visibleFor?: DevicePresence[]
  /**
   * The tab body. Receives the latest detection status so it can
   * react to live presence changes without re-fetching.
   */
  render: (ctx: ConfiguratorTabContext) => React.ReactNode
}

export interface ConfiguratorTabContext {
  status: DeviceDetectionStatus | null
  /**
   * Pack-level metadata supplied at registration. Free-form so tabs
   * can read e.g. vendor URLs, support links, default SysEx ports.
   */
  metadata: Record<string, unknown>
  /**
   * Force a status re-fetch (e.g. after the operator finishes a
   * destructive action like a firmware flash).
   */
  refetchStatus: () => Promise<unknown>
}

/**
 * What a per-device-pack module exports to the framework.
 */
export interface ConfiguratorPackDescriptor {
  packId: string
  displayName: string
  vendorName?: string
  /**
   * One-line operator-facing summary. Renders under the title in
   * the status card. Keep short — Carbon `Tile` truncates.
   */
  summary?: string
  supportedPrimitives: ConfiguratorPrimitive[]
  /**
   * TanStack Query function that fetches the latest detection
   * status. The shell handles retry/polling/cache; the pack just
   * supplies the call.
   */
  fetchStatus: () => Promise<DeviceDetectionStatus>
  tabs: ConfiguratorTabDescriptor[]
  metadata?: Record<string, unknown>
}
