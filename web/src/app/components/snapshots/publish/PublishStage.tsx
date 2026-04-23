import type { ReactNode } from 'react'
import type { PublishStageDescriptor } from './usePublishStageMachine'
import './publishPerformance.css'

export interface PublishStageProps {
  stage: PublishStageDescriptor
  isActive: boolean
  onToggle: () => void
  children: ReactNode
}

export function PublishStage({ stage, isActive, onToggle, children }: PublishStageProps) {
  const className = [
    'publish-stage',
    `publish-stage--${stage.status}`,
    isActive ? 'is-active' : 'is-collapsed',
  ].join(' ')
  const isDisabled = stage.status === 'locked'

  return (
    <section className={className} aria-labelledby={`publish-stage-${stage.id}`}>
      <button
        type="button"
        className="publish-stage__header"
        onClick={onToggle}
        disabled={isDisabled}
        aria-expanded={isActive}
        aria-controls={`publish-stage-body-${stage.id}`}
      >
        <span className="publish-stage__label-col">
          <span className="publish-stage__label" id={`publish-stage-${stage.id}`}>
            {stage.label}
          </span>
          <span className="publish-stage__status">{statusLabel(stage.status)}</span>
        </span>
        <span className="publish-stage__recap">{stage.recap}</span>
        {stage.blockers.length > 0 ? (
          <span className="publish-stage__blocker-count">
            {stage.blockers.length} blocker{stage.blockers.length > 1 ? 's' : ''}
          </span>
        ) : null}
      </button>
      {isActive ? (
        <div className="publish-stage__body" id={`publish-stage-body-${stage.id}`}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

function statusLabel(status: PublishStageDescriptor['status']): string {
  switch (status) {
    case 'complete': return 'complete'
    case 'active': return 'in progress'
    case 'armed': return 'armed'
    case 'live': return 'live'
    case 'locked': return 'waiting'
    case 'ready':
    default: return 'ready'
  }
}
