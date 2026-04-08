import { Button, ProgressBar } from '@carbon/react'

import type { RestartProgressStage, RestartProgressStep } from './useRestartBackend'

export function RestartOverlay({
  restartProgressStage,
  restartError,
  restartProgressSteps,
  restartProgressIndex,
  restartCurrentStep,
  onDismiss,
}: {
  restartProgressStage: RestartProgressStage
  restartError: string | null
  restartProgressSteps: readonly RestartProgressStep[]
  restartProgressIndex: number
  restartCurrentStep: RestartProgressStep | null
  onDismiss: () => void
}) {
  if (restartProgressStage === 'idle') {
    return null
  }

  return (
    <div className="shell-restart-overlay" role="status" aria-live="polite">
      <div className="shell-restart-overlay__panel">
        <div className="shell-restart-overlay__eyebrow">Power</div>
        <h2 className="shell-restart-overlay__title">
          {restartProgressStage === 'error' ? 'Restart failed' : 'Restarting backend'}
        </h2>
        <p className="shell-restart-overlay__subtitle">
          {restartProgressStage === 'error'
            ? (restartError ?? 'The backend restart request did not complete.')
            : restartCurrentStep?.description}
        </p>
        {restartProgressStage === 'error' ? (
          <Button kind="primary" onClick={onDismiss}>
            Close
          </Button>
        ) : (
          <>
            <ProgressBar
              className="shell-restart-overlay__progress"
              label="Restart progress"
              hideLabel
              helperText={restartCurrentStep?.label}
              value={((restartProgressIndex + 1) / restartProgressSteps.length) * 100}
            />
            <div className="shell-restart-overlay__steps" aria-label="Restart progress steps">
              {restartProgressSteps.map((step, index) => {
                const isActive = step.key === restartProgressStage
                const isComplete = index < restartProgressIndex || restartProgressStage === 'ready'
                return (
                  <div
                    key={step.key}
                    className={`shell-restart-overlay__step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                  >
                    <span className="shell-restart-overlay__step-label">{step.label}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
