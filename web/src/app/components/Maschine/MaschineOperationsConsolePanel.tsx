import {
  Accordion,
  AccordionItem,
  Button,
  ButtonSet,
  InlineLoading,
  InlineNotification,
  Layer,
  ProgressBar,
  Tag,
} from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import {
  maschineApi,
  type MaschineAdminConsoleAction,
  type MaschineAdminConsoleResponse,
  type MaschineAdminConsoleSnapshot,
  type MaschineIncidentLogEntry,
  type MaschinePlatformEventOverlay,
} from '../../../map2/clients/maschine'
import type { MaschineAudioGridProjection, MaschineDaemonStatus } from '../../../map2/types'

const PROFILE_CATEGORIES = [
  { id: 'Control', label: 'Control', detail: 't1_ctrl, t2_macro, t3_perform — chain mixers + macros' },
  { id: 'Chain', label: 'Chain', detail: 't9_chain_editor — pad-per-block effect chain editor' },
  { id: 'Brain', label: 'Brain', detail: 'Brain step / sequence / overview profiles' },
  { id: 'Sampler', label: 'Sampler', detail: 'Pad sampler & loop record' },
  { id: 'Monitor', label: 'Monitor', detail: 't16_monitor — live stats LCD page' },
  { id: 'Admin', label: 'Admin', detail: 't18_admin_console — sudo restart / reboot' },
  { id: 'Help', label: 'Help', detail: 'On-device help & shortcuts' },
] as const

const INSPECTION_MODES: Array<{ id: 'off' | 'assigned' | 'muted' | 'automated'; label: string; detail: string; led: string }> = [
  { id: 'off', label: 'Off', detail: 'No inspection overlay; pads show audio-grid colours.', led: '—' },
  { id: 'assigned', label: 'Assigned', detail: 'Highlight pads whose block has an encoder assignment.', led: 'Keyboard' },
  { id: 'muted', label: 'Muted', detail: 'Highlight bypassed pads.', led: 'Pattern' },
  { id: 'automated', label: 'Automated', detail: 'Highlight pads whose plugin has an automation source.', led: 'Scene' },
]

const LIFECYCLE_WORKFLOWS = [
  {
    id: 'boot',
    label: 'Boot Sequence',
    summary: '5 stages · ~3.1s total',
    stages: [
      'wordmark · pixel wipe',
      'status · backend + USB',
      'led_chase · surface test',
      'lcd_test · dual panel',
      'profile_load · ctrl ready',
    ],
    note: 'Auto-runs on daemon start. Skipped if backend & device come online before the wall-clock budget elapses.',
  },
  {
    id: 'onboarding',
    label: 'Onboarding Tour',
    summary: 'First-run pad & button tour',
    stages: [
      'welcome',
      'pads · 16 pressure inputs',
      'encoders · 11 detents',
      'buttons · transport + groups',
      'lcds · dual 255×64',
      'finish',
    ],
    note: 'Persists state to maschine.onboarding.* in runtime config; can be skipped or completed.',
  },
  {
    id: 'screensaver',
    label: 'Screensaver',
    summary: 'Idle timeout 90s · wake pressure ≥ 16',
    stages: ['ambient pad sweep', 'idle counter', 'transport readout', 'wake on pad pressure'],
    note: 'Activates after configurable idle window; wakes on any pad ≥ wake_pressure_min raw value.',
  },
  {
    id: 'shutdown',
    label: 'Shutdown Sequence',
    summary: 'Graceful drain · ≤ 4s budget',
    stages: ['drain pads', 'drain LCD', 'final wordmark'],
    note: 'Runs synchronously on daemon SIGTERM with a per-stage 50 ms write timeout.',
  },
  {
    id: 'long_op',
    label: 'Long Operation Feedback',
    summary: 'Startup · cluster_update · plugin_scan · IR/SF dl · manual',
    stages: [
      'observe_running → progress LEDs (TransportLeft … TransportRight)',
      'cancel → Erase LED double_pulse',
      'completed → 3s receipt hold',
    ],
    note: 'Highest-priority active source wins (manual > cluster_update > plugin_scan > soundfont/ir > startup).',
  },
] as const

function severityTag(
  severity: MaschineIncidentLogEntry['severity'],
): 'green' | 'cyan' | 'magenta' | 'red' | 'warm-gray' {
  if (severity === 'info') return 'cyan'
  if (severity === 'warn') return 'magenta'
  if (severity === 'error') return 'red'
  if (severity === 'critical') return 'red'
  return 'warm-gray'
}

function overlayActiveAndUnexpired(overlay: MaschinePlatformEventOverlay | null | undefined): boolean {
  if (!overlay || !overlay.active) return false
  const expiresAt = overlay.expires_at
  if (!expiresAt) return true
  const expiresMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresMs)) return true
  return expiresMs > Date.now()
}

function AdminConsoleControls({ snapshot }: { snapshot: MaschineAdminConsoleSnapshot | null }) {
  const queryClient = useQueryClient()

  const refresh = useCallback(
    (response: MaschineAdminConsoleResponse) => {
      queryClient.setQueryData(['maschine', 'admin-console'], response)
    },
    [queryClient],
  )

  const unlock = useMutation({ mutationFn: () => maschineApi.unlockAdminConsole(), onSuccess: refresh })
  const lock = useMutation({ mutationFn: () => maschineApi.lockAdminConsole(), onSuccess: refresh })
  const selectDelta = useMutation({
    mutationFn: (delta: number) => maschineApi.selectAdminConsoleAction(delta),
    onSuccess: refresh,
  })
  const confirm = useMutation({ mutationFn: () => maschineApi.confirmAdminConsoleAction(), onSuccess: refresh })
  const cancel = useMutation({ mutationFn: () => maschineApi.cancelAdminConsoleAction(), onSuccess: refresh })

  if (!snapshot) {
    return <InlineLoading description="Loading admin console snapshot…" />
  }

  const progressLabel = `${snapshot.confirmation_progress} / ${snapshot.confirmation_required}`
  const lastResultStatus = String(snapshot.last_result?.status ?? '')
  const lastResultLabel = String(snapshot.last_result?.label ?? '')
  const lastResultDetail = String(snapshot.last_result?.detail ?? '')

  return (
    <div className="maschine-ops__admin">
      <div className="maschine-page__tag-row">
        <Tag type={snapshot.session_unlocked ? 'green' : 'warm-gray'}>
          {snapshot.session_unlocked ? 'UNLOCKED' : 'LOCKED'}
        </Tag>
        <Tag type={snapshot.busy ? 'magenta' : 'cool-gray'}>
          {snapshot.busy ? `RUNNING ${snapshot.active_action_id ?? ''}` : 'IDLE'}
        </Tag>
        <Tag type="blue">Confirm {progressLabel}</Tag>
      </div>

      <div className="maschine-ops__admin-actions">
        {snapshot.actions.map((action: MaschineAdminConsoleAction) => (
          <button
            key={action.action_id}
            type="button"
            className={
              'maschine-ops__admin-action' +
              (action.is_selected ? ' maschine-ops__admin-action--selected' : '') +
              (action.is_active ? ' maschine-ops__admin-action--active' : '')
            }
            onClick={() => {
              const currentIndex = snapshot.selected_action_index
              const targetIndex = snapshot.actions.findIndex((a) => a.action_id === action.action_id)
              const delta = targetIndex - currentIndex
              if (delta !== 0) {
                selectDelta.mutate(delta)
              }
            }}
            disabled={!snapshot.session_unlocked || snapshot.busy}
          >
            <span className="maschine-ops__admin-label">{action.label}</span>
            <span className="maschine-ops__admin-detail">{action.detail}</span>
            <span className="maschine-ops__admin-kind">{action.kind ?? 'systemctl'}</span>
          </button>
        ))}
      </div>

      <ButtonSet>
        <Button
          kind="primary"
          size="sm"
          onClick={() => unlock.mutate()}
          disabled={snapshot.session_unlocked || unlock.isPending}
        >
          Unlock session
        </Button>
        <Button
          kind="danger--tertiary"
          size="sm"
          onClick={() => confirm.mutate()}
          disabled={!snapshot.session_unlocked || snapshot.busy || confirm.isPending}
        >
          Confirm step ({progressLabel})
        </Button>
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending}
        >
          Cancel
        </Button>
        <Button
          kind="ghost"
          size="sm"
          onClick={() => lock.mutate()}
          disabled={!snapshot.session_unlocked || lock.isPending}
        >
          Lock
        </Button>
      </ButtonSet>

      {(lastResultStatus || lastResultLabel) && (
        <div className="maschine-ops__admin-result">
          <Tag
            type={
              lastResultStatus === 'completed'
                ? 'green'
                : lastResultStatus === 'failed'
                  ? 'red'
                  : 'cool-gray'
            }
          >
            {lastResultStatus || 'unknown'}
          </Tag>
          <span className="maschine-ops__admin-result-label">{lastResultLabel}</span>
          {lastResultDetail && <code className="maschine-ops__admin-result-detail">{lastResultDetail}</code>}
        </div>
      )}
    </div>
  )
}

function AudioGridControls({ projection }: { projection: MaschineAudioGridProjection | null }) {
  const queryClient = useQueryClient()

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['maschine', 'audio-grid'] })
    void queryClient.invalidateQueries({ queryKey: ['maschine', 'status'] })
  }, [queryClient])

  const select = useMutation({
    mutationFn: (blockId: string) => maschineApi.selectAudioGridBlock(blockId),
    onSuccess: refresh,
  })
  const bypass = useMutation({
    mutationFn: (blockId: string) => maschineApi.toggleAudioGridBlockBypass(blockId),
    onSuccess: refresh,
  })

  const blocks = projection?.blocks ?? []
  const slots = useMemo(() => {
    const filled = new Map(blocks.map((b) => [b.pad_index, b]))
    return Array.from({ length: 16 }, (_, index) => filled.get(index) ?? null)
  }, [blocks])

  if (!projection) {
    return <InlineLoading description="Loading audio grid…" />
  }

  return (
    <div className="maschine-ops__grid">
      <div className="maschine-ops__grid-meta">
        <Tag type="cool-gray">{blocks.length} block(s)</Tag>
        {projection.snapshot_name && <Tag type="blue">snapshot · {projection.snapshot_name}</Tag>}
        {projection.selected_block_id && (
          <Tag type="green">selected · {projection.selected_block_id.slice(0, 12)}</Tag>
        )}
      </div>
      <div className="maschine-ops__grid-pads">
        {slots.map((block, index) => {
          const isSelected = block?.block_id === projection.selected_block_id
          const isBypassed = Boolean(block?.bypassed)
          const cls = [
            'maschine-ops__grid-pad',
            block ? 'maschine-ops__grid-pad--filled' : 'maschine-ops__grid-pad--empty',
            isSelected ? 'maschine-ops__grid-pad--selected' : '',
            isBypassed ? 'maschine-ops__grid-pad--bypassed' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={index} className={cls}>
              <span className="maschine-ops__grid-pad-index">PAD {index + 1}</span>
              <span className="maschine-ops__grid-pad-name">
                {block?.plugin_name ?? block?.path_label ?? '—'}
              </span>
              {block && (
                <ButtonSet>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => select.mutate(block.block_id)}
                    disabled={select.isPending}
                  >
                    Select
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => bypass.mutate(block.block_id)}
                    disabled={bypass.isPending}
                  >
                    {isBypassed ? 'Un-bypass' : 'Bypass'}
                  </Button>
                </ButtonSet>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MaschineOperationsConsolePanelProps {
  status: MaschineDaemonStatus | null
  audioGrid: MaschineAudioGridProjection | null
}

export function MaschineOperationsConsolePanel({ status, audioGrid }: MaschineOperationsConsolePanelProps) {
  const queryClient = useQueryClient()

  const adminConsoleQuery = useQuery({
    queryKey: ['maschine', 'admin-console'],
    queryFn: () => maschineApi.getAdminConsole(),
    refetchInterval: 2000,
  })

  const incidentLogQuery = useQuery({
    queryKey: ['maschine', 'incident-log'],
    queryFn: () => maschineApi.getIncidentLog(50),
    refetchInterval: 4000,
  })

  const platformEventQuery = useQuery({
    queryKey: ['maschine', 'platform-event-overlay'],
    queryFn: () => maschineApi.getPlatformEventOverlay(),
    refetchInterval: 2000,
  })

  const renderAudioGridMutation = useMutation({
    mutationFn: () => maschineApi.renderLcd('audio_grid'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'lcd-render', 'audio-grid'] })
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'status'] })
    },
  })
  const renderStatsMutation = useMutation({
    mutationFn: () => maschineApi.renderLcd('stats'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'status'] })
    },
  })

  const clearOverlayMutation = useMutation({
    mutationFn: () => maschineApi.clearPlatformEventOverlay(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'platform-event-overlay'] })
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'status'] })
    },
  })

  const overlay = platformEventQuery.data?.overlay ?? status?.platform_event_overlay ?? null
  const overlayActive = overlayActiveAndUnexpired(overlay as MaschinePlatformEventOverlay | null)
  const adminSnapshot = adminConsoleQuery.data?.admin_console ?? null
  const incidentEntries = incidentLogQuery.data?.entries ?? []
  const projection = audioGrid ?? status?.audio_grid ?? null
  const isConnected = Boolean(status?.connected && status?.transport?.connected)

  return (
    <Layer className="maschine-page__panel maschine-ops" data-testid="maschine-operations-console-panel">
      <div className="maschine-page__panel-head">
        <h2>Operations Console</h2>
        <div className="maschine-page__tag-row">
          <Tag type={isConnected ? 'green' : 'warm-gray'}>{isConnected ? 'Hardware live' : 'Hardware offline'}</Tag>
          <Tag type={overlayActive ? 'magenta' : 'cool-gray'}>
            Overlay {overlayActive ? 'active' : 'idle'}
          </Tag>
          <Tag type={adminSnapshot?.session_unlocked ? 'green' : 'warm-gray'}>
            Admin {adminSnapshot?.session_unlocked ? 'unlocked' : 'locked'}
          </Tag>
        </div>
      </div>
      <p className="maschine-page__panel-copy">
        Single-pane control surface for every Maschine MK1 mode, lifecycle workflow and runtime sub-system. Each
        accordion section maps to a service in <code>app/services/maschine/</code> and exposes its live state plus the
        operator actions it supports.
      </p>

      <Accordion align="start" size="lg">
        <AccordionItem title="1. Display Context & Profile Categories" open>
          <p className="maschine-page__panel-copy">
            The MK1 daemon routes every render through one <em>display context</em>. The 7 menu categories below map 1:1
            to the Maschine Group A–H LEDs (A → Control … G → Help). The currently selected context is owned by the
            daemon's <code>SharedRuntimeState.display_context</code> and surfaced through the LCD render endpoint.
          </p>
          <div className="maschine-ops__category-grid">
            {PROFILE_CATEGORIES.map((cat, index) => (
              <div key={cat.id} className="maschine-ops__category">
                <div className="maschine-ops__category-head">
                  <Tag type="blue" size="sm">
                    Group {String.fromCharCode(65 + index)}
                  </Tag>
                  <strong>{cat.label}</strong>
                </div>
                <p className="maschine-page__panel-copy">{cat.detail}</p>
              </div>
            ))}
          </div>
          <ButtonSet>
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => renderAudioGridMutation.mutate()}
              disabled={renderAudioGridMutation.isPending}
            >
              Force render audio_grid
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => renderStatsMutation.mutate()}
              disabled={renderStatsMutation.isPending}
            >
              Force render stats
            </Button>
          </ButtonSet>
        </AccordionItem>

        <AccordionItem title="2. Inspection Modes (LED overlays)">
          <p className="maschine-page__panel-copy">
            Cycled by the Group/Pattern/Scene/Keyboard buttons on the device. Each mode re-tints the 16 audio-grid pads
            with a <code>brightness_level</code> + <code>animation</code> overlay before they're forwarded to the LED
            driver.
          </p>
          <div className="maschine-ops__inspection-grid">
            {INSPECTION_MODES.map((mode) => (
              <div key={mode.id} className="maschine-ops__inspection-card">
                <div className="maschine-ops__category-head">
                  <Tag type="cyan" size="sm">
                    {mode.label}
                  </Tag>
                  <strong>{mode.id}</strong>
                </div>
                <p className="maschine-page__panel-copy">{mode.detail}</p>
                <code>LED → {mode.led}</code>
              </div>
            ))}
          </div>
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Read-only readout"
            subtitle="Inspection mode is owned by the daemon — change it on the hardware via Group/Pattern/Scene/Keyboard buttons. The visible state will update via the websocket once the daemon publishes it on /status."
          />
        </AccordionItem>

        <AccordionItem title="3. Lifecycle Workflows">
          <p className="maschine-page__panel-copy">
            The daemon ships five canonical lifecycle workflows. Each renders to the dual LCDs + 62 LEDs through its
            own render path.
          </p>
          <div className="maschine-ops__lifecycle-grid">
            {LIFECYCLE_WORKFLOWS.map((wf) => (
              <div key={wf.id} className="maschine-ops__lifecycle-card">
                <div className="maschine-ops__category-head">
                  <Tag type="purple" size="sm">
                    {wf.id}
                  </Tag>
                  <strong>{wf.label}</strong>
                </div>
                <Tag type="cool-gray" size="sm">
                  {wf.summary}
                </Tag>
                <ol className="maschine-ops__lifecycle-stages">
                  {wf.stages.map((stage) => (
                    <li key={stage}>{stage}</li>
                  ))}
                </ol>
                <p className="maschine-page__panel-copy">{wf.note}</p>
              </div>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="4. Admin Console (sudo restart / reboot)" open>
          <p className="maschine-page__panel-copy">
            The on-device <code>t18_admin_console</code> profile, exposed here. Unlock the session, dial to an action,
            press Confirm three times to arm, then watch the executor run.
          </p>
          <AdminConsoleControls snapshot={adminSnapshot} />
        </AccordionItem>

        <AccordionItem title="5. Audio Grid (16-pad chain editor)" open>
          <p className="maschine-page__panel-copy">
            The <code>t1_ctrl</code> default workflow. Each pad maps to one block in the active snapshot's chain
            graph. Click Select to push it into the daemon as the focused block, or Bypass to toggle the runtime chain.
          </p>
          <AudioGridControls projection={projection} />
        </AccordionItem>

        <AccordionItem title="6. Platform Event Overlay">
          <p className="maschine-page__panel-copy">
            A platform-wide modal for cross-device receipts (alerts, broadcast notifications). When active, the overlay
            takes over the LEDs/LCDs in <code>exclusive_overlay</code> mode or merges with current pad colours in
            <code> shared_receipt</code> mode.
          </p>
          {overlay && overlayActive ? (
            <div className="maschine-ops__overlay">
              <Tag type={severityTag((overlay.severity as MaschineIncidentLogEntry['severity']) ?? 'info')}>
                {String(overlay.severity ?? 'info').toUpperCase()}
              </Tag>
              <Tag type="cool-gray">{overlay.mode}</Tag>
              <strong>{overlay.title || '—'}</strong>
              <p className="maschine-page__panel-copy">{overlay.message || '—'}</p>
              <div className="maschine-page__tag-row">
                <Tag type="warm-gray">id · {overlay.event_id ?? '—'}</Tag>
                <Tag type="warm-gray">expires · {overlay.expires_at ?? 'never'}</Tag>
              </div>
              <Button
                kind="danger--tertiary"
                size="sm"
                onClick={() => clearOverlayMutation.mutate()}
                disabled={clearOverlayMutation.isPending}
              >
                Clear overlay
              </Button>
            </div>
          ) : (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No overlay active"
              subtitle="Platform broadcasts will surface here as they arrive."
            />
          )}
        </AccordionItem>

        <AccordionItem title="7. Long-Operation Feedback (live)">
          <p className="maschine-page__panel-copy">
            The MK1 reserves the 5 transport LEDs (TransportLeft → Play → Rec → Loop → TransportRight) as a discrete
            progress bar for any registered long-running source. The latest receipt is held for 3 seconds before the
            slot returns to its profile owner.
          </p>
          <ProgressBar
            label="Long-operation slot"
            helperText="No active long-op (live progress is published by the daemon over the status websocket)."
            value={0}
            max={1}
          />
          <div className="maschine-page__tag-row">
            <Tag type="cool-gray">manual</Tag>
            <Tag type="cool-gray">cluster_update</Tag>
            <Tag type="cool-gray">plugin_scan</Tag>
            <Tag type="cool-gray">soundfont_download</Tag>
            <Tag type="cool-gray">ir_download</Tag>
            <Tag type="cool-gray">startup</Tag>
          </div>
        </AccordionItem>

        <AccordionItem title="8. Incident Log (recent)">
          <p className="maschine-page__panel-copy">
            Severity-tagged events emitted by every Maschine sub-service. Backed by{' '}
            <code>~/.map2/maschine_incident_log.jsonl</code> — append-only and fsync'd.
          </p>
          {incidentEntries.length === 0 ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No incidents recorded yet"
              subtitle="Daemon registration, websocket transitions, admin actions and overlay events will appear here."
            />
          ) : (
            <ol className="maschine-ops__incident-list">
              {incidentEntries.map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`} className="maschine-ops__incident-row">
                  <Tag type={severityTag(entry.severity)} size="sm">
                    {entry.severity}
                  </Tag>
                  <code className="maschine-ops__incident-time">{entry.timestamp}</code>
                  <span className="maschine-ops__incident-source">{entry.source}</span>
                  <span className="maschine-ops__incident-message">{entry.message}</span>
                  {entry.detail && <code className="maschine-ops__incident-detail">{entry.detail}</code>}
                </li>
              ))}
            </ol>
          )}
        </AccordionItem>

        <AccordionItem title="9. LCD Render Pipeline (manual trigger)">
          <p className="maschine-page__panel-copy">
            The daemon can render any of the 8 LCD page contexts on demand. This forces a re-render of the 255×64 dual
            display buffers and pushes them through the service to the websocket clients.
          </p>
          <ButtonSet>
            <Button
              kind="primary"
              size="sm"
              onClick={() => renderAudioGridMutation.mutate()}
              disabled={renderAudioGridMutation.isPending}
            >
              Render audio_grid
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => renderStatsMutation.mutate()}
              disabled={renderStatsMutation.isPending}
            >
              Render stats
            </Button>
          </ButtonSet>
          {renderAudioGridMutation.isError && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Render failed"
              subtitle={String(renderAudioGridMutation.error)}
            />
          )}
        </AccordionItem>
      </Accordion>
    </Layer>
  )
}

export default MaschineOperationsConsolePanel
