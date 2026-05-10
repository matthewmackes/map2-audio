/**
 * Maschine MK1 frontend Configurator pack descriptor.
 *
 * Phase 2.1 of the T2499 mega-epic (2026-05-09): the descriptor
 * surfaces the existing daemon-side state via the generic
 * Configurator routes (`/api/devices/configurator/maschine_mk1/...`).
 * The full bespoke surface (LCD profile selector, calibration,
 * onboarding tour) lands in Phases 2.2–2.7 — this descriptor is
 * the entry point that gets the MK1 tile to appear in the picker
 * and routes the operator into the bespoke flow.
 */
import { fetchJson } from '../../../../map2/http'
import { API_BASE } from '../../../../map2/transport'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from '../types'

const BACKEND_PACK_ID = 'maschine_mk1'

interface MaschineDaemonStatusEnvelope {
  pack_id: string
  presence: DevicePresence
  transport: string
  serial?: string | null
  raw?: Record<string, unknown>
}

/**
 * Fetch the live Maschine MK1 detection status.
 *
 * Calls the framework's per-pack detector endpoint when it lands
 * (T2499-A G1+); for now we fall back to translating the daemon's
 * `/api/maschine/status` response into the canonical shape. Either
 * source produces a ``DeviceDetectionStatus`` the framework can
 * render unmodified.
 */
async function fetchMaschineStatus(): Promise<DeviceDetectionStatus> {
  try {
    const detector = await fetchJson<MaschineDaemonStatusEnvelope>(
      `${API_BASE}/devices/configurator/${BACKEND_PACK_ID}/detector`,
      { cache: 'no-store' },
    )
    return {
      pack_id: detector.pack_id,
      presence: detector.presence,
      transport: detector.transport,
      serial: detector.serial ?? null,
      raw: detector.raw ?? {},
    }
  } catch {
    // Detector endpoint not yet wired (G1+). Translate the existing
    // daemon status into the same canonical shape so the picker
    // tile + status card still render correctly today.
    return adaptDaemonStatus(await fetchDaemonStatus())
  }
}

interface MaschineDaemonState {
  connected: boolean
  status: string
  daemon_version: string | null
  websocket_connected: boolean
  virtual_port_name: string
  hid_device: Record<string, unknown>
  transport: Record<string, unknown>
  firmware_info: Record<string, unknown>
  capabilities: Record<string, unknown>
  registered_at: string | null
  heartbeat_at: string | null
}

async function fetchDaemonStatus(): Promise<MaschineDaemonState> {
  return fetchJson<MaschineDaemonState>(`${API_BASE}/maschine/status`, {
    cache: 'no-store',
  })
}

function adaptDaemonStatus(state: MaschineDaemonState): DeviceDetectionStatus {
  if (!state.connected) {
    return {
      pack_id: BACKEND_PACK_ID,
      presence: 'not_present',
      transport: 'hid',
      serial: null,
      raw: { detail: state.status || 'disconnected' },
    }
  }
  const hid = state.hid_device ?? {}
  const vendorId = numericId(hid.vendor_id)
  const productId = numericId(hid.product_id)
  const isMk1 = vendorId === 0x17cc && productId === 0x0808
  return {
    pack_id: BACKEND_PACK_ID,
    presence: isMk1 ? 'present_stock' : 'present_unknown',
    transport: stringValue(state.transport?.kind ?? '') || 'hid',
    serial: stringValue(hid.serial_number) || null,
    raw: {
      daemon_version: state.daemon_version ?? '',
      vendor_id: hexId(vendorId),
      product_id: hexId(productId),
      virtual_port_name: state.virtual_port_name,
      firmware_version: stringValue(state.firmware_info?.version),
      websocket_connected: state.websocket_connected,
      status: state.status,
      registered_at: state.registered_at ?? '',
      heartbeat_at: state.heartbeat_at ?? '',
    },
  }
}

function numericId(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (!text) return null
    const parsed = text.startsWith('0x') ? parseInt(text, 16) : parseInt(text, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function hexId(value: number | null): string {
  if (value === null) return ''
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const maschineMk1Pack: ConfiguratorPackDescriptor = {
  packId: 'maschine_mk1',
  displayName: 'Native Instruments Maschine MK1',
  vendorName: 'Native Instruments',
  summary:
    'Headless Maschine MK1 console — pad calibration, pressure curves, ' +
    '25-profile LCD catalog, LED choreography, per-installation HID + MIDI bindings.',
  supportedPrimitives: ['detection', 'discovery', 'override'],
  fetchStatus: fetchMaschineStatus,
  // Phases 2.2–2.7 land the full bespoke flow on the dedicated
  // route. Until then the descriptor's `bespoke_route` directs the
  // operator into the daemon console, which already exposes
  // operational state (HID traffic, encoder map, hardware test).
  tabs: [],
  metadata: {
    bespoke_route: '/midi/devices/configurator/maschine',
    docs_url:
      'https://github.com/matthewmackes/map2-audio/blob/master/docs/PROJECT_WORKLIST.md',
    vendor_id: '0x17CC',
    product_id: '0x0808',
  },
}

export { adaptDaemonStatus }
