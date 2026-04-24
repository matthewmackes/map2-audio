import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Close, Events, NetworkEnterprise, Reset } from '@carbon/icons-react'

import { midiHubApi } from '../../../map2/clients/midiHub'
import { useMidiHubOverview } from '../../components/MidiHub/useMidiHubOverview'
import './MidiHubHealthDrawer.css'

interface MidiHubHealthDrawerProps {
  open: boolean
  onClose: () => void
  apiNodeId: string | null
  scopeKey: string
}

function toneForHealth(health: string): 'green' | 'blue' | 'warm-gray' | 'red' {
  if (health === 'online') return 'green'
  if (health === 'degraded') return 'red'
  return 'warm-gray'
}

export function MidiHubHealthDrawer({ open, onClose, apiNodeId, scopeKey }: MidiHubHealthDrawerProps) {
  const navigate = useNavigate()
  const {
    statusQuery,
    clockQuery,
    routesCount,
    connectedDeviceCount,
    sessionsCount,
    activePresetName,
    health,
  } = useMidiHubOverview(apiNodeId, scopeKey)

  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) {
      setNotice(null)
    }
  }, [open])

  const restartMutation = useMutation({
    mutationFn: async () => {
      await midiHubApi.stopHub(apiNodeId)
      await midiHubApi.startHub(apiNodeId)
    },
    onSuccess: () => {
      setNotice({ kind: 'success', text: 'MIDI Hub daemon restarted.' })
      void statusQuery.refetch()
    },
    onError: (err) => {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Restart failed.' })
    },
  })

  const clock = clockQuery.data
  const bpm = Number.isFinite(clock?.bpm) ? Math.round(clock?.bpm ?? 0) : 0
  const running = Boolean(clock?.running)

  const status = statusQuery.data ?? {}
  const xruns = Number.isFinite((status as Record<string, number>).xruns)
    ? Math.round((status as Record<string, number>).xruns)
    : 0
  const latencyMs = Number.isFinite((status as Record<string, number>).latency_ms)
    ? ((status as Record<string, number>).latency_ms).toFixed(1)
    : null

  return (
    <>
      {open ? (
        <button
          type="button"
          className="midi-hub-health-drawer__scrim"
          aria-label="Close health drawer"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`midi-hub-health-drawer${open ? ' midi-hub-health-drawer--open' : ''}`}
        role="dialog"
        aria-label="MIDI Hub health"
        aria-hidden={!open}
      >
        <header className="midi-hub-health-drawer__head">
          <div>
            <div className="midi-hub-health-drawer__eyebrow">MIDI HUB</div>
            <h2 className="midi-hub-health-drawer__title">Health</h2>
          </div>
          <button
            type="button"
            className="midi-hub-health-drawer__close"
            aria-label="Close health drawer"
            onClick={onClose}
          >
            <Close size={16} />
          </button>
        </header>

        <div className="midi-hub-health-drawer__body">
          <section className="midi-hub-health-drawer__section">
            <div className="midi-hub-health-drawer__section-head">
              <span className="midi-hub-health-drawer__section-label">System</span>
              <Tag type={toneForHealth(health)}>{health}</Tag>
            </div>
            <dl className="midi-hub-health-drawer__kv">
              <div>
                <dt>Clock</dt>
                <dd>{running ? `${bpm} BPM live` : `${bpm} BPM stopped`}</dd>
              </div>
              <div>
                <dt>Preset</dt>
                <dd>{activePresetName}</dd>
              </div>
              <div>
                <dt>xruns</dt>
                <dd>{xruns}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{latencyMs ? `${latencyMs} ms` : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="midi-hub-health-drawer__section">
            <div className="midi-hub-health-drawer__section-head">
              <span className="midi-hub-health-drawer__section-label">Topology</span>
            </div>
            <dl className="midi-hub-health-drawer__kv">
              <div>
                <dt>Routes</dt>
                <dd>{routesCount}</dd>
              </div>
              <div>
                <dt>Devices</dt>
                <dd>{connectedDeviceCount}</dd>
              </div>
              <div>
                <dt>Sessions</dt>
                <dd>{sessionsCount}</dd>
              </div>
            </dl>
          </section>

          {notice ? (
            <InlineNotification
              kind={notice.kind === 'success' ? 'success' : 'error'}
              lowContrast
              hideCloseButton
              title={notice.kind === 'success' ? 'Restart complete' : 'Restart failed'}
              subtitle={notice.text}
            />
          ) : null}

          <section className="midi-hub-health-drawer__actions">
            <Button
              kind="primary"
              size="sm"
              renderIcon={Reset}
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
            >
              {restartMutation.isPending ? (
                <InlineLoading description="Restarting daemon…" />
              ) : (
                'Restart MIDI Hub daemon'
              )}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Events}
              onClick={() => {
                onClose()
                navigate('/midi-hub/events')
              }}
            >
              View events
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={NetworkEnterprise}
              onClick={() => {
                onClose()
                navigate('/midi-hub/network')
              }}
            >
              View network
            </Button>
          </section>
        </div>
      </aside>
    </>
  )
}
