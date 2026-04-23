import type { PublishStageDescriptor, PublishStageId } from './usePublishStageMachine'
import './publishPerformance.css'

export interface PublishStepperProps {
  stages: PublishStageDescriptor[]
  activeStageId: PublishStageId
  onSelectStage: (stageId: PublishStageId) => void
}

function stageGlyph(status: PublishStageDescriptor['status']): string {
  switch (status) {
    case 'complete': return '✓'
    case 'active': return '●'
    case 'armed': return '◉'
    case 'live': return '◆'
    case 'locked':
    case 'ready':
    default: return '○'
  }
}

export function PublishStepper({ stages, activeStageId, onSelectStage }: PublishStepperProps) {
  return (
    <nav className="publish-stepper" aria-label="Publish stages">
      <ol className="publish-stepper__list">
        {stages.map((stage, index) => {
          const isActive = stage.id === activeStageId
          const isDisabled = stage.status === 'locked'
          const className = [
            'publish-stepper__item',
            `publish-stepper__item--${stage.status}`,
            isActive ? 'is-active' : '',
          ].filter(Boolean).join(' ')
          return (
            <li key={stage.id} className={className}>
              <button
                type="button"
                className="publish-stepper__button"
                onClick={() => !isDisabled && onSelectStage(stage.id)}
                disabled={isDisabled}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="publish-stepper__glyph" aria-hidden="true">
                  {stageGlyph(stage.status)}
                </span>
                <span className="publish-stepper__label">{stage.label}</span>
                <span className="publish-stepper__recap">{stage.recap}</span>
              </button>
              {index < stages.length - 1 ? (
                <span className="publish-stepper__connector" aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
