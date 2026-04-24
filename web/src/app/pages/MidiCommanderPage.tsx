import './MidiCommanderPage.css'

import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { InlineNotification, Layer, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react'

import { useSetShellWindow } from '../layout/useSetShellWindow'
import { EmptyState } from '../components/shared/EmptyState'
import { useToasts } from '../components/Toasts'
import midiCommanderApi, { type MidiCommanderProjectionControl } from '../../map2/clients/midiCommander'

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

function groupControls(controls: MidiCommanderProjectionControl[]) {
  return {
    buttons: controls.filter((control) => control.control_type === 'button'),
    expression: controls.filter((control) => control.control_type === 'expression'),
  }
}

export function MidiCommanderPage() {
  const { pushToast } = useToasts()
  const statusQuery = useQuery({
    queryKey: ['midi-commander', 'status'],
    queryFn: () => midiCommanderApi.getStatus(),
    refetchInterval: 3000,
  })
  const projectionQuery = useQuery({
    queryKey: ['midi-commander', 'projection'],
    queryFn: () => midiCommanderApi.getProjection(),
    refetchInterval: 2000,
  })

  const patchMutation = useMutation({
    mutationFn: ({ controlId, patch }: { controlId: string; patch: Record<string, unknown> }) =>
      midiCommanderApi.patchMapping(controlId, patch),
    onSuccess: async () => {
      await projectionQuery.refetch()
      await statusQuery.refetch()
    },
  })

  const state = statusQuery.data?.state ?? null
  const projection = projectionQuery.data?.projection ?? null
  const daemonStatus = state?.daemon_status ?? null
  const groups = groupControls(projection?.controls ?? [])
  const manualSetupLines = projection?.active_snapshot_mapping?.manual_setup?.lines ?? []

  useEffect(() => {
    const notification = daemonStatus?.notification
    if (!notification?.emitted_at) return
    pushToast(`${notification.title}: ${notification.subtitle}`, notificationTone(notification.severity), {
      id: `midi-commander-daemon-${notification.emitted_at}`,
      persistent: notification.severity === 'warning' || notification.severity === 'error',
    })
  }, [daemonStatus?.notification, pushToast])

  useSetShellWindow({
    title: 'MeloAudio MIDI Commander',
    subtitle: 'Dedicated Carbon workspace for per-snapshot button and expression assignments, manual setup guidance, and reconnect posture.',
    kicker: 'Platform / MIDI Commander',
    actions: [
      { id: 'connected', label: state?.connected ? 'Connected' : 'Disconnected', status: state?.connected ? 'ok' : 'error', disabled: true },
      ...(daemonStatus ? [{ id: 'daemon', label: daemonStatus.state.replace('_', ' '), status: (daemonTagType(daemonStatus.state) === 'green' ? 'ok' : daemonTagType(daemonStatus.state) === 'red' ? 'error' : 'warn') as 'ok' | 'warn' | 'error' | 'info', disabled: true }] : []),
    ],
  }, [state?.connected, daemonStatus])


  return (
    <div className="midi-commander-page">
      {(statusQuery.isError || projectionQuery.isError) ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MIDI Commander data could not be loaded"
          subtitle="The dedicated MIDI Commander route is present, but the backend did not return a valid status or projection payload."
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

      <div className="midi-commander-page__grid">
        <Layer className="midi-commander-page__panel" data-testid="midi-commander-connection-panel">
          <div className="midi-commander-page__panel-head">
            <div>
              <p className="midi-commander-page__eyebrow">Connection</p>
              <h2>Profile-driven controller posture</h2>
            </div>
            <div className="midi-commander-page__tag-row">
              <Tag type={statusTagType(Boolean(state?.connected))}>{state?.connected ? 'Detected' : 'Offline'}</Tag>
              <Tag type="cool-gray">Bank {Number(state?.current_bank ?? 0) + 1}</Tag>
              {daemonStatus ? <Tag type={daemonTagType(daemonStatus.state)}>{daemonStatus.reconnect_count} reconnects</Tag> : null}
            </div>
          </div>
          <dl className="midi-commander-page__kv-grid">
            <div>
              <dt>Live snapshot</dt>
              <dd>{projection?.snapshot?.name ?? 'No live snapshot'}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>{String((state?.active_profile?.name as string | undefined) ?? 'Inactive')}</dd>
            </div>
            <div>
              <dt>Expression calibrations</dt>
              <dd>{Object.keys(state?.expression_calibrations ?? {}).length}</dd>
            </div>
            <div>
              <dt>Daemon</dt>
              <dd>{daemonStatus?.state ?? 'Unavailable'}</dd>
            </div>
          </dl>
          <ul className="midi-commander-page__list">
            {(state?.matched_ports ?? []).map((port) => (
              <li key={port.port_id} className="midi-commander-page__list-item">
                <strong>{port.name}</strong>
                <div className="midi-commander-page__tag-row">
                  <Tag type="warm-gray" size="sm">{port.direction}</Tag>
                  {port.variant ? <Tag type="blue" size="sm">{port.variant}</Tag> : null}
                </div>
              </li>
            ))}
          </ul>
          {(state?.matched_ports?.length ?? 0) === 0 ? (
            <EmptyState
              title="No MIDI Commander-family MIDI ports are currently visible"
              description="Connect the controller or refresh the daemon state to discover available MIDI Commander ports."
              compact
              align="left"
            />
          ) : null}
        </Layer>

        <Layer className="midi-commander-page__panel" data-testid="midi-commander-setup-panel">
          <div className="midi-commander-page__panel-head">
            <div>
              <p className="midi-commander-page__eyebrow">Manual Setup</p>
              <h2>Snapshot configuration guidance</h2>
            </div>
            <Tag type="purple">{manualSetupLines.length} steps</Tag>
          </div>
          <p className="midi-commander-page__body-copy">MIDI Commander does not expose a dedicated MAP2 SysEx programming surface, so the live snapshot contract is rendered as explicit manual setup guidance instead of a hardware push.</p>
          <ol className="midi-commander-page__steps">
            {manualSetupLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Layer>

        <Layer className="midi-commander-page__panel" data-testid="midi-commander-buttons-panel">
          <div className="midi-commander-page__panel-head">
            <div>
              <p className="midi-commander-page__eyebrow">Buttons</p>
              <h2>Per-snapshot assignments</h2>
            </div>
            <Tag type="cool-gray">{groups.buttons.length} switches</Tag>
          </div>
          <div className="midi-commander-page__control-grid">
            {groups.buttons.map((control) => {
              const assignment = (control.assignment ?? {}) as Record<string, unknown>
              const actionType = typeof assignment.kind === 'string'
                ? assignment.kind
                : typeof assignment.action_type === 'string'
                  ? assignment.action_type
                  : typeof assignment.action === 'string'
                    ? assignment.action
                    : ''
              return (
                <Tile key={control.control_id} className="midi-commander-page__control-card" data-testid={`midi-commander-control-${control.control_id}`}>
                  <strong>{control.label}</strong>
                  <span>{control.assignment_summary}</span>
                  <Select
                    id={`midi-commander-kind-${control.control_id}`}
                    size="sm"
                    labelText="Action type"
                    value={actionType}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      patchMutation.mutate({
                        controlId: control.control_id,
                        patch: {
                          assignment: {
                            ...assignment,
                            kind: value,
                          },
                        },
                      })
                    }}
                  >
                    <SelectItem value="" text="Unassigned" />
                    <SelectItem value="toggle_plugin" text="Bypass toggle" />
                    <SelectItem value="focus_block" text="Focus block" />
                    <SelectItem value="transport" text="Transport" />
                    <SelectItem value="parameter" text="Parameter" />
                  </Select>
                </Tile>
              )
            })}
          </div>
        </Layer>

        <Layer className="midi-commander-page__panel" data-testid="midi-commander-expression-panel">
          <div className="midi-commander-page__panel-head">
            <div>
              <p className="midi-commander-page__eyebrow">Expression</p>
              <h2>Pedal targets</h2>
            </div>
            <Tag type="blue">{groups.expression.length} pedals</Tag>
          </div>
          <div className="midi-commander-page__control-grid">
            {groups.expression.map((control) => {
              const assignment = (control.assignment ?? {}) as Record<string, unknown>
              const paramId = typeof assignment.param_id === 'string' ? assignment.param_id : ''
              return (
                <Tile key={control.control_id} className="midi-commander-page__control-card">
                  <strong>{control.label}</strong>
                  <span>{control.assignment_summary}</span>
                  <TextInput
                    id={`midi-commander-param-${control.control_id}`}
                    size="sm"
                    labelText="Parameter target"
                    placeholder="gain"
                    value={paramId}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      patchMutation.mutate({
                        controlId: control.control_id,
                        patch: {
                          assignment: {
                            ...assignment,
                            kind: 'expression_target',
                            param_id: value,
                          },
                        },
                      })
                    }}
                  />
                </Tile>
              )
            })}
          </div>
        </Layer>
      </div>
    </div>
  )
}

export default MidiCommanderPage
