import type { ShellActionSlot } from '../ShellWindowContext'
import './WorkspaceBar.css'

interface WorkspaceBarProps {
  workspaceLabel: string
  actions: ShellActionSlot[]
  navPinned: boolean
  onToggleNavPin: () => void
  contextBarHidden: boolean
  onClose?: () => void
  closeLabel?: string
}

export function WorkspaceBar({
  workspaceLabel,
  actions,
  navPinned,
  onToggleNavPin,
  contextBarHidden,
  onClose,
  closeLabel,
}: WorkspaceBarProps) {
  return (
    <div
      className={`shell-ws${contextBarHidden ? ' shell-ws--ctx-hidden' : ''}`}
      role="toolbar"
      aria-label="Workspace toolbar"
    >
      <div className="shell-ws__side">
        <svg className="shell-ws__side-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span className="shell-ws__side-label">Global Navigation</span>
        <button
          type="button"
          className="shell-ws__side-toggle"
          onClick={onToggleNavPin}
          aria-label={navPinned ? 'Collapse global navigation' : 'Expand global navigation'}
          title={navPinned ? 'Collapse' : 'Expand'}
        >
          {navPinned ? '‹' : '›'}
        </button>
      </div>
      <div className="shell-ws__main">
        <span className="shell-ws__main-dot" aria-hidden="true" />
        <span className="shell-ws__main-label">Platform Workspace</span>
        <span className="shell-ws__main-sep">·</span>
        <strong className="shell-ws__main-name">{workspaceLabel}</strong>
      </div>
      <div className="shell-ws__actions">
        {onClose ? (
          <button
            type="button"
            className="shell-ws__btn shell-ws__btn--close"
            aria-label={closeLabel ?? `Close ${workspaceLabel}`}
            title={closeLabel ?? `Close ${workspaceLabel}`}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
        {actions.slice(0, 3).map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              className="shell-ws__btn"
              data-active={action.active ? 'true' : 'false'}
              disabled={action.disabled === true}
              title={action.title ?? action.label}
              onClick={action.onClick}
            >
              {action.status ? (
                <span
                  className={`shell-ws__btn-dot shell-ws__btn-dot--${action.status}`}
                  aria-hidden="true"
                />
              ) : null}
              {Icon ? <Icon size={12} /> : null}
              {action.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
