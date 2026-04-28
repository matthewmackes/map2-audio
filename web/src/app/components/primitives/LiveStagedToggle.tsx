// LiveStagedToggle — visual indicator + toggle between viewing the live
// (running) and staged (queued for commit) snapshot of system config.
// Surfaces in editor pages so operators always know which view they're
// looking at and can switch.

import './LiveStagedToggle.css'

export type LiveStagedView = 'live' | 'staged'

interface LiveStagedToggleProps {
  view: LiveStagedView
  onChange: (next: LiveStagedView) => void
  /** Disabled when there are no staged changes (operator stays on live). */
  disabled?: boolean
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function LiveStagedToggle({
  view,
  onChange,
  disabled = false,
  className,
}: LiveStagedToggleProps) {
  return (
    <div
      className={joinClasses('map2-live-staged-toggle', className)}
      role="tablist"
      aria-label="Live vs staged view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'live'}
        className={joinClasses(
          'map2-live-staged-toggle__btn',
          'map2-live-staged-toggle__btn--live',
          view === 'live' && 'is-active',
        )}
        onClick={() => onChange('live')}
        disabled={disabled && view !== 'live'}
      >
        <span className="map2-live-staged-toggle__dot" aria-hidden="true" />
        LIVE
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'staged'}
        className={joinClasses(
          'map2-live-staged-toggle__btn',
          'map2-live-staged-toggle__btn--staged',
          view === 'staged' && 'is-active',
        )}
        onClick={() => onChange('staged')}
        disabled={disabled && view !== 'staged'}
      >
        <span className="map2-live-staged-toggle__dot" aria-hidden="true" />
        STAGED
      </button>
    </div>
  )
}

export default LiveStagedToggle
