import './LaunchControlPage.css'

import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { InlineNotification, Layer, Select, SelectItem, Tag, Tile } from '@carbon/react'

import { useSetShellWindow } from '../layout/useSetShellWindow'
import { EmptyState } from '../components/shared/EmptyState'
import { useToasts } from '../components/Toasts'
import launchControlApi, { type LaunchControlProjectionControl } from '../../map2/clients/launchControl'

const LED_OPTIONS = [
  { value: '', label: 'Effect default' },
  { value: 'off', label: 'Off' },
  { value: 'red_full', label: 'Red' },
  { value: 'green_full', label: 'Green' },
  { value: 'amber_full', label: 'Amber' },
  { value: 'yellow_full', label: 'Yellow' },
]

function connectionTagType(connected: boolean): 'green' | 'red' {
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

function templateCount(templateState: Record<string, Record<string, unknown>> | undefined): number {
  return Object.keys(templateState ?? {}).length
}

function groupedControls(controls: LaunchControlProjectionControl[]) {
  return {
    knobs: controls.filter((control) => control.control_type === 'knob'),
    faders: controls.filter((control) => control.control_type === 'fader'),
    buttons: controls.filter((control) => control.control_type === 'button'),
  }
}

export function LaunchControlPage() {
  const { pushToast } = useToasts()
  const statusQuery = useQuery({
    queryKey: ['launch-control', 'status'],
    queryFn: () => launchControlApi.getStatus(),
    refetchInterval: 3000,
  })

  const projectionQuery = useQuery({
    queryKey: ['launch-control', 'projection'],
    queryFn: () => launchControlApi.getProjection(),
    refetchInterval: 2000,
  })

  const patchMutation = useMutation({
    mutationFn: ({ controlId, patch }: { controlId: string; patch: Record<string, unknown> }) =>
      launchControlApi.patchMapping(controlId, patch),
    onSuccess: async () => {
      await projectionQuery.refetch()
      await statusQuery.refetch()
    },
  })

  const state = statusQuery.data?.state ?? null
  const projection = projectionQuery.data?.projection ?? null
  const controls = projection?.controls ?? []
  const groups = groupedControls(controls)
  const daemonStatus = state?.daemon_status ?? null

  useEffect(() => {
    const notification = daemonStatus?.notification
    if (!notification?.emitted_at) return
    pushToast(`${notification.title}: ${notification.subtitle}`, notificationTone(notification.severity), {
      id: `launch-control-daemon-${notification.emitted_at}`,
      persistent: notification.severity === 'warning' || notification.severity === 'error',
    })
  }, [daemonStatus?.notification, pushToast])

  useSetShellWindow({
    title: 'Novation Launch Control',
    subtitle: 'Dedicated Carbon workspace for Launch Control / XL connection posture, current snapshot mappings, and per-button LED override editing.',
    kicker: 'Platform / Launch Control',
    actions: [
      { id: 'connected', label: state?.connected ? 'Connected' : 'Disconnected', status: state?.connected ? 'ok' : 'error', disabled: true },
      ...(daemonStatus ? [{ id: 'daemon', label: daemonStatus.state.replace('_', ' '), status: (daemonTagType(daemonStatus.state) === 'green' ? 'ok' : daemonTagType(daemonStatus.state) === 'red' ? 'error' : 'warn') as 'ok' | 'warn' | 'error' | 'info', disabled: true }] : []),
    ],
  }, [state?.connected, daemonStatus])


  return (
    <div className="launch-control-page">
      {(statusQuery.isError || projectionQuery.isError) ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Launch Control data could not be loaded"
          subtitle="The backend route did not return a valid Launch Control status or projection payload."
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

      <div className="launch-control-page__grid">
        <Layer className="launch-control-page__panel" data-testid="launch-control-connection-panel">
          <div className="launch-control-page__panel-head">
            <div>
              <p className="launch-control-page__eyebrow">Connection</p>
              <h2>MIDI presence and template posture</h2>
            </div>
            <div className="launch-control-page__tag-row">
              <Tag type={connectionTagType(Boolean(state?.connected))}>{state?.connected ? 'Detected' : 'Offline'}</Tag>
              <Tag type="cool-gray">{state?.recent_event_count ?? 0} events</Tag>
              {daemonStatus ? <Tag type={daemonTagType(daemonStatus.state)}>{daemonStatus.reconnect_count} reconnects</Tag> : null}
            </div>
          </div>
          <dl className="launch-control-page__kv-grid">
            <div>
              <dt>Live snapshot</dt>
              <dd>{projection?.snapshot?.name ?? 'No live snapshot'}</dd>
            </div>
            <div>
              <dt>Template pushes</dt>
              <dd>{String((state?.last_activation_push?.led_push_count ?? state?.active_snapshot_mapping?.mapping_count) ?? '--')}</dd>
            </div>
            <div>
              <dt>Daemon</dt>
              <dd>{daemonStatus?.state ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Last re-push</dt>
              <dd>{daemonStatus?.last_repush_at ?? '--'}</dd>
            </div>
          </dl>
          <ul className="launch-control-page__list">
            {(state?.matched_ports ?? []).map((port) => (
              <li key={port.port_id} className="launch-control-page__list-item">
                <strong>{port.name}</strong>
                <div className="launch-control-page__tag-row">
                  <Tag type="warm-gray" size="sm">{port.direction}</Tag>
                  {port.variant ? <Tag type="blue" size="sm">{port.variant}</Tag> : null}
                </div>
              </li>
            ))}
          </ul>
          {(state?.matched_ports?.length ?? 0) === 0 ? (
            <EmptyState
              title="No Launch Control-family MIDI ports are currently visible"
              description="Connect the controller or refresh the daemon state to discover available Launch Control ports."
              compact
              align="left"
            />
          ) : null}
        </Layer>

        <Layer className="launch-control-page__panel" data-testid="launch-control-grid-panel">
          <div className="launch-control-page__panel-head">
            <div>
              <p className="launch-control-page__eyebrow">Control Grid</p>
              <h2>Snapshot-owned assignments</h2>
            </div>
            <Tag type="purple">{controls.length} controls</Tag>
          </div>
          <p className="launch-control-page__body-copy">The grid follows the live snapshot-owned Launch Control mapping contract and shows the current physical control rows grouped by type.</p>
          <div className="launch-control-page__section">
            <h3>Knobs</h3>
            <div className="launch-control-page__control-grid">
              {groups.knobs.map((control) => (
                <Tile key={control.control_id} className="launch-control-page__control-card">
                  <strong>{control.label}</strong>
                  <span>{control.assignment_summary}</span>
                </Tile>
              ))}
            </div>
          </div>
          <div className="launch-control-page__section">
            <h3>Faders</h3>
            <div className="launch-control-page__control-grid">
              {groups.faders.map((control) => (
                <Tile key={control.control_id} className="launch-control-page__control-card">
                  <strong>{control.label}</strong>
                  <span>{control.assignment_summary}</span>
                </Tile>
              ))}
            </div>
          </div>
          <div className="launch-control-page__section">
            <h3>Buttons</h3>
            <div className="launch-control-page__control-grid">
              {groups.buttons.map((control) => (
                <Tile key={control.control_id} className="launch-control-page__control-card" data-testid={`launch-control-control-${control.control_id}`}>
                  <strong>{control.label}</strong>
                  <span>{control.assignment_summary}</span>
                  <Select
                    id={`launch-control-led-${control.control_id}`}
                    size="sm"
                    labelText="LED color"
                    value={typeof control.led_override === 'string' ? control.led_override : ''}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      patchMutation.mutate({
                        controlId: control.control_id,
                        patch: {
                          led_override: nextValue || null,
                        },
                      })
                    }}
                  >
                    {LED_OPTIONS.map((option) => (
                      <SelectItem key={option.value || 'default'} value={option.value} text={option.label} />
                    ))}
                  </Select>
                </Tile>
              ))}
            </div>
          </div>
        </Layer>
      </div>
    </div>
  )
}

export default LaunchControlPage
