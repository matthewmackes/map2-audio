/**
 * T2499-B — Maschine MK1 onboarding orchestrator client.
 *
 * Drives the per-unit onboarding state machine exposed at
 * /api/maschine/onboarding/*. The wizard walks the operator through the
 * Q50 first-connection flow (tour → pad sensitivity → pressure curves →
 * LCD calibration → profile selection → ready); a unit that already has a
 * calibration file hot-loads straight to ready (Q4).
 */
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export type OnboardingState =
  | 'idle'
  | 'deciding'
  | 'hot_load'
  | 'tour'
  | 'pad_sensitivity'
  | 'pressure_curves'
  | 'lcd_calibration'
  | 'profile_selection'
  | 'ready'
  | 'disconnected'

export type OnboardingPhase =
  | 'pad_sensitivity'
  | 'pressure_curves'
  | 'lcd_calibration'
  | 'profile_selection'

export interface OnboardingEvent {
  timestamp: string
  usb_serial: string | null
  previous_state: OnboardingState
  new_state: OnboardingState
  reason: string
  payload: Record<string, unknown>
}

export interface OnboardingStatus {
  status: string
  state: OnboardingState
  usb_serial: string | null
  phase_index: number
  phase_order: OnboardingState[]
  is_ready: boolean
  history: OnboardingEvent[]
}

const BASE = `${API_BASE}/maschine/onboarding`

export const maschineOnboardingApi = {
  status: () => fetchJson<OnboardingStatus>(`${BASE}/status`),

  calibration: () =>
    fetchJson<{ status: string; calibration: Record<string, unknown> | null }>(
      `${BASE}/calibration`,
    ),

  connect: (usbSerial: string) =>
    fetchJson<OnboardingStatus>(`${BASE}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usb_serial: usbSerial }),
    }),

  tourComplete: () =>
    fetchJson<OnboardingStatus>(`${BASE}/tour-complete`, { method: 'POST' }),

  skip: () => fetchJson<OnboardingStatus>(`${BASE}/skip`, { method: 'POST' }),

  completePhase: (phase: OnboardingPhase, sectionPayload: unknown) =>
    fetchJson<OnboardingStatus>(`${BASE}/phase-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase, section_payload: sectionPayload }),
    }),

  reset: () => fetchJson<OnboardingStatus>(`${BASE}/reset`, { method: 'POST' }),

  profileCatalog: () =>
    fetchJson<{ status: string; profiles: ProfileCatalogEntry[] }>(
      `${BASE}/profile-catalog`,
    ),
}

export interface ProfileCatalogEntry {
  id: string
  name: string
  source: 'json' | 'code'
}
