/**
 * T2503 Set 10 — MultiTrack Recorder health drawer.
 *
 * Mirrors MidiHubHealthDrawer. Shows live DAW mode + project + topology
 * counts. The "Reseat engine" action flips MAP2 engine mode via
 * /api/daw/mode (Set 3); the "View transport / sessions" buttons jump
 * to the relevant sub-area.
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Close, Play as PlayIcon, Folder, Reset } from '@carbon/icons-react'

import { dawApi, type EngineMode } from '../../../map2/clients/daw'
import { useDawOverview, type DawHealth } from './useDawOverview'
import './MultiTrackHealthDrawer.css'

interface MultiTrackHealthDrawerProps {
  open: boolean
  onClose: () => void
  scopeKey: string
}

function toneForHealth(health: DawHealth): 'green' | 'blue' | 'warm-gray' | 'red' {
  if (health === 'online') return 'green'
  if (health === 'unavailable') return 'red'
  if (health === 'transitioning') return 'blue'
  return 'warm-gray'
}

export function MultiTrackHealthDrawer({ open, onClose, scopeKey }: MultiTrackHealthDrawerProps) {
  const navigate = useNavigate()
  const {
    modeQuery,
    mode,
    available,
    health,
    activeProject,
    trackCount,
    clipCount,
    pluginCount,
    automationLaneCount,
  } = useDawOverview(scopeKey)

  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) {
      setNotice(null)
    }
  }, [open])

  const reseatMutation = useMutation({
    mutationFn: async () => {
      const target: EngineMode = mode?.mode === 'daw' ? 'live' : 'daw'
      await dawApi.setMode(target)
      await dawApi.setMode('daw')
    },
    onSuccess: () => {
      setNotice({ kind: 'success', text: 'Engine reseated into DAW mode.' })
      void modeQuery.refetch()
    },
    onError: (err) => {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Reseat failed.' })
    },
  })

  return (
    <>
      {open ? (
        <button
          type="button"
          className="multitrack-health-drawer__scrim multitrack-health-drawer__scrim--open"
          aria-label="Close health drawer"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`multitrack-health-drawer${open ? ' multitrack-health-drawer--open' : ''}`}
        role="dialog"
        aria-label="MultiTrack Recorder health"
        aria-hidden={!open}
      >
        <header className="multitrack-health-drawer__head">
          <div>
            <div className="multitrack-health-drawer__eyebrow">MULTITRACK RECORDER</div>
            <h2 className="multitrack-health-drawer__title">Health</h2>
          </div>
          <button
            type="button"
            className="multitrack-health-drawer__close"
            aria-label="Close health drawer"
            onClick={onClose}
          >
            <Close size={16} />
          </button>
        </header>

        <div className="multitrack-health-drawer__body">
          <section className="multitrack-health-drawer__section">
            <div className="multitrack-health-drawer__section-head">
              <span className="multitrack-health-drawer__section-label">Engine</span>
              <Tag type={toneForHealth(health)}>{health}</Tag>
            </div>
            <dl className="multitrack-health-drawer__kv">
              <div>
                <dt>Mode</dt>
                <dd>{mode?.mode ?? '—'}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{mode?.state ?? '—'}</dd>
              </div>
              <div>
                <dt>Build flag</dt>
                <dd>{available ? 'enabled' : 'disabled'}</dd>
              </div>
              <div>
                <dt>Last error</dt>
                <dd>{mode?.last_error ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="multitrack-health-drawer__section">
            <div className="multitrack-health-drawer__section-head">
              <span className="multitrack-health-drawer__section-label">Project</span>
            </div>
            <dl className="multitrack-health-drawer__kv">
              <div>
                <dt>Active</dt>
                <dd>{activeProject ?? '—'}</dd>
              </div>
              <div>
                <dt>Tracks</dt>
                <dd>{trackCount}</dd>
              </div>
              <div>
                <dt>Clips</dt>
                <dd>{clipCount}</dd>
              </div>
              <div>
                <dt>Plugins</dt>
                <dd>{pluginCount}</dd>
              </div>
              <div>
                <dt>Auto lanes</dt>
                <dd>{automationLaneCount}</dd>
              </div>
            </dl>
          </section>

          {notice ? (
            <InlineNotification
              kind={notice.kind === 'success' ? 'success' : 'error'}
              lowContrast
              hideCloseButton
              title={notice.kind === 'success' ? 'Reseat complete' : 'Reseat failed'}
              subtitle={notice.text}
            />
          ) : null}

          <section className="multitrack-health-drawer__actions">
            <Button
              kind="primary"
              size="sm"
              renderIcon={Reset}
              onClick={() => reseatMutation.mutate()}
              disabled={reseatMutation.isPending || !available}
            >
              {reseatMutation.isPending ? (
                <InlineLoading description="Reseating engine…" />
              ) : (
                'Reseat engine into DAW mode'
              )}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={PlayIcon}
              onClick={() => {
                onClose()
                navigate('/multitrack-recorder/transport')
              }}
            >
              Open transport
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Folder}
              onClick={() => {
                onClose()
                navigate('/multitrack-recorder/sessions')
              }}
            >
              Open sessions
            </Button>
          </section>
        </div>
      </aside>
    </>
  )
}
