import './McuPage.css'

import { useEffect } from 'react'
import { Button, InlineNotification, Layer, Tag, Tile } from '@carbon/react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'
import mcuApi from '../../map2/clients/mcu'

function statusTagType(connected: boolean): 'green' | 'red' {
  return connected ? 'green' : 'red'
}

function daemonTagType(state: string | null | undefined): 'green' | 'blue' | 'red' | 'warm-gray' {
  if (state === 'connected') return 'green'
  if (state === 'repushing') return 'blue'
  if (state === 'error') return 'red'
  return 'warm-gray'
}

function notificationTone(severity: string | null | undefined): 'info' | 'warn' | 'error' {
  if (severity === 'warning') return 'warn'
  if (severity === 'error') return 'error'
  return 'info'
}

function transportOwnerLabel(activeOwner: string | null): string {
  return activeOwner ? activeOwner.replace(/_/g, ' ') : 'Unavailable'
}

function formatStripValue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ? 1 : 2)
}

export function McuPage() {
  const { pushToast } = useToasts()
  const statusQuery = useQuery({
    queryKey: ['mcu', 'status'],
    queryFn: () => mcuApi.getStatus(),
    refetchInterval: 3000,
  })

  const projectionQuery = useQuery({
    queryKey: ['mcu', 'projection'],
    queryFn: () => mcuApi.getProjection(),
    refetchInterval: 2000,
  })

  const eventMutation = useMutation({
    mutationFn: ({ event }: { event: Record<string, unknown> }) => mcuApi.dispatchEvent(event),
    onSuccess: async () => {
      await projectionQuery.refetch()
    },
  })

  const state = statusQuery.data?.state ?? null
  const projection = projectionQuery.data?.projection ?? null
  const transport = projectionQuery.data?.transport ?? null
  const strips = projection?.channel_strips ?? []
  const banks = projection?.banks ?? []
  const selectedPlugin = projection?.selected_plugin ?? null
  const daemonStatus = state?.daemon_status ?? null

  useEffect(() => {
    const notification = daemonStatus?.notification
    if (!notification?.emitted_at) return
    pushToast(`${notification.title}: ${notification.subtitle}`, notificationTone(notification.severity), {
      id: `mcu-daemon-${notification.emitted_at}`,
      persistent: notification.severity === 'warning' || notification.severity === 'error',
    })
  }, [daemonStatus?.notification, pushToast])

  return (
    <div className="mcu-page">
      <PageHeader
        title="Mackie MCU Pro"
        subtitle="Dedicated Carbon editor for MCU connection posture, current focused plugin bank, scribble-strip preview, parameter-page browsing, and transport ownership."
        actions={(
          <div className="mcu-page__tag-row">
            <Tag type={statusTagType(Boolean(state?.connected))}>{state?.connected ? 'Connected' : 'Disconnected'}</Tag>
            {daemonStatus ? <Tag type={daemonTagType(daemonStatus.state)}>{daemonStatus.state.replace('_', ' ')}</Tag> : null}
          </div>
        )}
      />

      {(statusQuery.isError || projectionQuery.isError) ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MCU data could not be loaded"
          subtitle="The dedicated MCU route is present, but the backend did not return a valid status or projection payload."
        />
      ) : null}

      {daemonStatus?.notification ? (
        <InlineNotification
          kind={daemonStatus.notification.severity === 'warning' ? 'warning' : daemonStatus.notification.severity === 'error' ? 'error' : 'info'}
          lowContrast
          hideCloseButton
          title={daemonStatus.notification.title}
          subtitle={daemonStatus.notification.subtitle}
        />
      ) : null}

      <div className="mcu-page__grid">
        <Layer className="mcu-page__panel" data-testid="mcu-connection-panel">
          <div className="mcu-page__panel-head">
            <div>
              <p className="mcu-page__eyebrow">Connection</p>
              <h2>MIDI presence and identity</h2>
            </div>
            <div className="mcu-page__tag-row">
              <Tag type={statusTagType(Boolean(state?.connected))}>{state?.connected ? 'Detected' : 'Offline'}</Tag>
              <Tag type="cool-gray">{state?.matched_port_count ?? 0} ports</Tag>
              {daemonStatus ? <Tag type={daemonTagType(daemonStatus.state)}>{daemonStatus.reconnect_count} reconnects</Tag> : null}
            </div>
          </div>
          <p className="mcu-page__body-copy">Live MIDI-hub discovery plus the most recent MCU identity response feed the connection posture for this dedicated editor page.</p>
          <dl className="mcu-page__kv-grid">
            <div>
              <dt>Identity</dt>
              <dd>{String(state?.identity?.version ?? 'Unknown')}</dd>
            </div>
            <div>
              <dt>Recent events</dt>
              <dd>{state?.recent_event_count ?? 0}</dd>
            </div>
            <div>
              <dt>Daemon</dt>
              <dd>{daemonStatus?.state ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Last transport owner</dt>
              <dd>{transportOwnerLabel(daemonStatus?.last_transport_owner ?? null)}</dd>
            </div>
          </dl>
          <ul className="mcu-page__port-list">
            {(state?.matched_ports ?? []).map((port) => (
              <li key={port.port_id} className="mcu-page__port-item">
                <strong>{port.name}</strong>
                <div className="mcu-page__tag-row">
                  <Tag type="warm-gray" size="sm">{port.direction}</Tag>
                </div>
              </li>
            ))}
            {(state?.matched_ports?.length ?? 0) === 0 ? <li className="mcu-page__port-item">No Mackie MCU Pro MIDI ports are currently visible.</li> : null}
          </ul>
        </Layer>

        <Layer className="mcu-page__panel" data-testid="mcu-plugin-panel">
          <div className="mcu-page__panel-head">
            <div>
              <p className="mcu-page__eyebrow">Focused Plugin</p>
              <h2>{selectedPlugin?.plugin_name ?? 'No focused block'}</h2>
            </div>
            <div className="mcu-page__tag-row">
              <Tag type="blue">{projection?.active_bank?.title ?? 'No bank'}</Tag>
              <Tag type="purple">{selectedPlugin?.bank_group ?? 'none'}</Tag>
            </div>
          </div>
          <p className="mcu-page__body-copy">The page follows the current Maschine audio-grid block focus and exposes the active 8-strip MCU bank with bank navigation buttons.</p>
          <dl className="mcu-page__kv-grid">
            <div>
              <dt>Plugin URI</dt>
              <dd>{selectedPlugin?.plugin_uri ?? '--'}</dd>
            </div>
            <div>
              <dt>Bank</dt>
              <dd>{typeof projection?.bank_index === 'number' ? `${projection.bank_index + 1}/${projection.bank_count}` : '--'}</dd>
            </div>
          </dl>
          <div className="mcu-page__bank-toolbar">
            <Button
              kind="secondary"
              size="sm"
              disabled={!projection || projection.bank_index <= 0 || eventMutation.isPending}
              onClick={() => eventMutation.mutate({ event: { event_type: 'button', pressed: true, note: 0x2E } })}
            >
              Previous Bank
            </Button>
            <Button
              kind="secondary"
              size="sm"
              disabled={!projection || projection.bank_index >= Math.max((projection.bank_count ?? 1) - 1, 0) || eventMutation.isPending}
              onClick={() => eventMutation.mutate({ event: { event_type: 'button', pressed: true, note: 0x2F } })}
            >
              Next Bank
            </Button>
          </div>
          <ul className="mcu-page__plugin-list">
            {banks.map((bank) => (
              <li key={`${bank.group_id}-${bank.bank_index}`} className="mcu-page__plugin-item">
                <strong>{bank.title}</strong>
                <p className="mcu-page__body-copy">{bank.parameters.length} parameters</p>
              </li>
            ))}
          </ul>
        </Layer>

        <Layer className="mcu-page__panel" data-testid="mcu-scribble-panel">
          <div className="mcu-page__panel-head">
            <div>
              <p className="mcu-page__eyebrow">Scribble Strip</p>
              <h2>Preview</h2>
            </div>
            <Tag type="cool-gray">{projection?.scribble_labels?.length ?? 0} labels</Tag>
          </div>
          <p className="mcu-page__body-copy">The current active bank is rendered into 7-character MCU scribble labels exactly as the runtime bridge will push them back to hardware.</p>
          <ul className="mcu-page__scribble-list">
            {(projection?.scribble_labels ?? []).map((label, index) => (
              <li key={`${label}-${index}`} className="mcu-page__scribble-item">
                <span>Strip {index + 1}</span>
                <strong>{label || '-------'}</strong>
              </li>
            ))}
          </ul>
        </Layer>

        <Tile className="mcu-page__panel" data-testid="mcu-faders-panel">
          <div className="mcu-page__panel-head">
            <div>
              <p className="mcu-page__eyebrow">Fader Bank</p>
              <h2>Current values</h2>
            </div>
            <Tag type="cool-gray">8 strips</Tag>
          </div>
          <p className="mcu-page__body-copy">Each strip shows the current normalized position coming from the active MCU bridge bank, including focused-strip highlighting for jog-wheel targeting.</p>
          <div className="mcu-page__faders">
            {strips.map((strip) => (
              <div
                key={strip.slot_index}
                className={`mcu-page__fader-card${strip.focused ? ' mcu-page__fader-card--focused' : ''}`}
              >
                <div className="mcu-page__fader-label">
                  <strong>{strip.scribble_label || 'Empty'}</strong>
                </div>
                <div className="mcu-page__fader-rail" aria-label={`Strip ${strip.slot_index + 1} value`}>
                  <div
                    className="mcu-page__fader-fill"
                    style={{ height: `${Math.max(0, Math.min((strip.normalized_value ?? 0) * 100, 100))}%` }}
                  />
                </div>
                <div className="mcu-page__fader-value">{strip.assigned ? formatStripValue(strip.value) : '--'}</div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="mcu-page__panel" data-testid="mcu-transport-panel">
          <div className="mcu-page__panel-head">
            <div>
              <p className="mcu-page__eyebrow">Transport</p>
              <h2>{transportOwnerLabel(transport?.active_owner ?? null)}</h2>
            </div>
            <Tag type="green">{transport?.active_owner ? 'Ready' : 'Unavailable'}</Tag>
          </div>
          <p className="mcu-page__body-copy">MCU transport buttons now dispatch through the shared transport-owner service, so this page shows the same active owner state used by Maschine and the broader runtime.</p>
          <div className="mcu-page__transport-grid">
            {['rew', 'stop', 'play', 'ff', 'record'].map((action) => (
              <div key={action} className="mcu-page__transport-card">
                <strong>{action.toUpperCase()}</strong>
                <p className="mcu-page__body-copy">Mapped through shared transport dispatch.</p>
              </div>
            ))}
          </div>
        </Tile>
      </div>
    </div>
  )
}

export default McuPage
