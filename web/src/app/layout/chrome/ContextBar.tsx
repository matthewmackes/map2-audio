import './ContextBar.css'

interface ContextBarProps {
  crumbs: string[]
  routeHint: string
  hidden: boolean
  onDismiss: () => void
}

export function ContextBar({ crumbs, routeHint, hidden, onDismiss }: ContextBarProps) {
  const lastIdx = crumbs.length - 1
  return (
    <div
      className={`shell-ctx${hidden ? ' shell-ctx--hidden' : ''}`}
      role="region"
      aria-label="Workspace context"
      aria-hidden={hidden}
    >
      <div className="shell-ctx__trail">
        <span className="shell-ctx__glyph" aria-hidden="true">~</span>
        {crumbs.map((crumb, idx) => {
          const isLast = idx === lastIdx
          return (
            <span key={`${idx}-${crumb}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {isLast ? (
                <span className="shell-ctx__node">{crumb}</span>
              ) : (
                <span className="shell-ctx__crumb">{crumb}</span>
              )}
              {!isLast ? <span className="shell-ctx__sep">/</span> : null}
            </span>
          )
        })}
        {routeHint ? <span className="shell-ctx__query">{routeHint}</span> : null}
      </div>
      <button
        type="button"
        className="shell-ctx__close"
        aria-label="Dismiss context bar"
        title="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
