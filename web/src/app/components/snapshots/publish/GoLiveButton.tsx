import { useState } from 'react'
import type { PublishStageMachine } from './usePublishStageMachine'
import './publishPerformance.css'

export interface GoLiveButtonProps {
  machine: PublishStageMachine
  disabled: boolean
  onGoLive: () => void
  snapshotName: string
}

export function GoLiveButton({ machine, disabled, onGoLive, snapshotName }: GoLiveButtonProps) {
  const [confirming, setConfirming] = useState(false)

  const { overallStatus } = machine
  const armed = overallStatus === 'armed' && !disabled
  const publishing = overallStatus === 'publishing'
  const live = overallStatus === 'live'

  if (live) {
    return (
      <div className="golive-button golive-button--live" role="status">
        <span className="golive-button__glow" aria-hidden="true" />
        <span className="golive-button__label">ON STAGE</span>
        <span className="golive-button__sub">This chain is live</span>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="golive-button__confirm" role="alertdialog" aria-modal="true">
        <p className="golive-button__confirm-title">Take {snapshotName} live?</p>
        <p className="golive-button__confirm-body">
          This replaces the current live chain immediately. House lights down.
        </p>
        <div className="golive-button__confirm-actions">
          <button
            type="button"
            className="golive-button__confirm-cancel"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="golive-button__confirm-go"
            onClick={() => {
              setConfirming(false)
              onGoLive()
            }}
          >
            GO LIVE →
          </button>
        </div>
      </div>
    )
  }

  const btnClass = [
    'golive-button',
    armed ? 'golive-button--armed' : 'golive-button--locked',
    publishing ? 'golive-button--publishing' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={btnClass}
      onClick={() => armed && setConfirming(true)}
      disabled={!armed || publishing}
      aria-label={publishing ? 'Publishing in progress' : armed ? 'Go live' : 'Publish disabled'}
    >
      <span className="golive-button__label">
        {publishing ? 'CURTAIN RISING…' : armed ? 'GO LIVE →' : 'NOT READY'}
      </span>
      <span className="golive-button__sub">
        {publishing
          ? 'Publishing the stage-ready asset'
          : armed
            ? 'All pre-flight checks cleared'
            : 'Resolve prior stages to arm'}
      </span>
    </button>
  )
}
