import { Tag, Tile } from '@carbon/react'
import { useQuery } from '@tanstack/react-query'

import { stateAuthorityApi } from '../../../map2/clients/stateAuthority'
import { LIVE_ACTIVATION_PHASES } from '../../pages/snapshotEditor/snapshotEditorPageTypes'

// T2522-D cycle 11 — State Authority phase visibility surface.
//
// Per the locked T700 Q49 + Q71 decisions, the MK1 config will
// embed as `document.controllers.maschine_mk1` in snapshot JSONB
// and participate in the full VALIDATING → STAGING → APPLYING →
// VERIFYING → LIVE state machine. The full snapshot JSONB
// extension lives behind a separate epic-level schema change
// (T2522-D-StateAuthority-Schema, follow-on); this strip wires
// the GUI side now so the operator sees authoritative phase
// state as soon as the backend ingestor lands.
//
// Today the strip subscribes to
// `GET /api/state-authority/reconciliation/metrics` (the canonical
// reconciliation telemetry endpoint) at 1-second intervals and
// renders:
//   • Current local-reconcile status (VALIDATING / STAGING /
//     APPLYING / VERIFYING / LIVE / IDLE / ERROR), tag-coded.
//   • Last-reconcile timestamp.
//   • Drift counters (so the operator can see at-a-glance whether
//     a save round-trip actually settled).
//   • Per-phase LED-signature hint, mirroring the T700 Q71 spec
//     that the daemon will emit on the physical LED ring during
//     phase transitions. The hints live in the GUI to anchor
//     muscle-memory before the daemon's LED side ships.

const PHASE_TONES: Record<string, 'green' | 'cyan' | 'magenta' | 'purple' | 'red' | 'warm-gray'> = {
  LIVE: 'green',
  VALIDATING: 'cyan',
  STAGING: 'purple',
  APPLYING: 'magenta',
  VERIFYING: 'cyan',
  IDLE: 'warm-gray',
  ERROR: 'red',
}

// Mirror of T700 Q71: each activation phase has a distinct LED
// "signature" the daemon will paint on the device's LED ring once
// the backend ingestor lands. The hints here let the operator
// memorise the visual cue ahead of that wiring.
const PHASE_LED_HINT: Record<string, string> = {
  VALIDATING: 'group LEDs A→D scan cyan (left → right)',
  STAGING: 'transport LEDs pulse magenta (1 Hz)',
  APPLYING: 'all groups solid magenta',
  VERIFYING: 'group LEDs E→H scan cyan (right → left)',
  LIVE: 'snapshot bank lit green; transport idle',
  IDLE: 'no LED change',
  ERROR: 'all LEDs solid red',
}

function formatRelative(unixSeconds: number): string {
  if (!unixSeconds || unixSeconds < 0) return '—'
  const ago = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds))
  if (ago < 60) return `${ago}s ago`
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return `${Math.floor(ago / 86400)}d ago`
}

function normalisePhase(raw: string | null | undefined): string {
  if (!raw) return 'IDLE'
  const upper = raw.trim().toUpperCase()
  if (upper === 'OK' || upper === 'CLEAN' || upper === '') return 'LIVE'
  if (LIVE_ACTIVATION_PHASES.includes(upper as never)) return upper
  if (upper.includes('ERROR') || upper.includes('FAIL')) return 'ERROR'
  return upper
}

export function MaschinePhaseStrip() {
  const metricsQuery = useQuery({
    queryKey: ['maschine', 'phase-strip', 'reconciliation-metrics'],
    queryFn: () => stateAuthorityApi.getReconciliationMetrics(),
    refetchInterval: 1000,
    refetchOnWindowFocus: false,
  })

  const metrics = metricsQuery.data?.metrics ?? null
  const phase = normalisePhase(metrics?.last_local_status)
  const tone = PHASE_TONES[phase] ?? 'warm-gray'
  const lastReconcileIso = metrics ? formatRelative(metrics.last_local_reconcile_unix_s) : '—'

  return (
    <Tile className="maschine-phase-strip">
      <header className="maschine-phase-strip__head">
        <div className="maschine-phase-strip__head-left">
          <h4 className="maschine-mapping__pane-title">State Authority phase</h4>
          <p className="maschine-mapping__sub" style={{ marginTop: '0.25rem' }}>
            Live local-reconcile state. Saved bindings ride this state machine: VALIDATING → STAGING →
            APPLYING → VERIFYING → LIVE. The MK1's physical LED ring will mirror the active phase once
            the backend `document.controllers.maschine_mk1` ingestor lands.
          </p>
        </div>
        <div className="maschine-phase-strip__head-right">
          <Tag size="md" type={tone}>{phase}</Tag>
        </div>
      </header>
      <dl className="maschine-phase-strip__metrics">
        <div>
          <dt>Last local reconcile</dt>
          <dd>{lastReconcileIso}</dd>
        </div>
        <div>
          <dt>Local runs</dt>
          <dd>{metrics?.local_runs_total ?? '—'}</dd>
        </div>
        <div>
          <dt>Local drift detected</dt>
          <dd>{metrics?.local_drift_detected_total ?? '—'}</dd>
        </div>
        <div>
          <dt>Local corrections applied</dt>
          <dd>{metrics?.local_corrections_applied_total ?? '—'}</dd>
        </div>
        <div>
          <dt>Reactivations required</dt>
          <dd>{metrics?.local_reactivations_required_total ?? '—'}</dd>
        </div>
      </dl>
      <p className="maschine-phase-strip__hint">
        <strong>Phase LED signature (Q71):</strong> {PHASE_LED_HINT[phase] ?? '—'}
      </p>
      {metrics?.last_local_error ? (
        <p className="maschine-phase-strip__error">{metrics.last_local_error}</p>
      ) : null}
    </Tile>
  )
}
