import { CaretDown } from '@carbon/icons-react'
import { Popover, PopoverContent } from '@carbon/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ShellActionSlot } from '../ShellWindowContext'
import type { ShellBreadcrumbItem } from '../../routing/shellRouteMeta'
import './ContentKicker.css'

interface HostBreadcrumbOption {
  nodeId: string
  label: string
  secondaryLabel?: string
  statusLabel: string
  statusTone?: 'ok' | 'warn' | 'critical' | 'offline'
  isActive: boolean
}

interface HostBreadcrumbRoot {
  label: string
  options: HostBreadcrumbOption[]
  onSelect: (nodeId: string) => void
  disabled?: boolean
}

interface ContentKickerProps {
  kicker?: string
  title?: string
  subtitle?: string
  lead?: ReactNode
  crumbs?: ShellBreadcrumbItem[]
  hostRoot?: HostBreadcrumbRoot
  actions?: ShellActionSlot[]
  onClose?: () => void
  closeLabel?: string
}

export function ContentKicker({
  kicker,
  title,
  subtitle,
  lead,
  crumbs = [],
  hostRoot,
  actions = [],
  onClose,
  closeLabel,
}: ContentKickerProps) {
  const [hostSelectorOpen, setHostSelectorOpen] = useState(false)
  const [hostFilter, setHostFilter] = useState('')
  const hasControls = Boolean(onClose) || actions.length > 0
  const hasContent = Boolean(kicker) || Boolean(title) || Boolean(subtitle) || Boolean(lead) || hasControls
  if (!hasContent) {
    return null
  }

  const breadcrumbItems = hostRoot ? [{ label: hostRoot.label }, ...crumbs] : crumbs
  const hasHostSelector = Boolean(hostRoot) && hostRoot.options.length > 1 && !hostRoot.disabled
  const filteredHostOptions = hostRoot
    ? hostRoot.options.filter((option) => {
      if (!hostFilter.trim()) return true
      const normalizedFilter = hostFilter.trim().toLowerCase()
      return `${option.label} ${option.secondaryLabel ?? ''} ${option.statusLabel}`.toLowerCase().includes(normalizedFilter)
    })
    : []

  return (
    <header className="shell-kicker">
      <div className="shell-kicker__head">
        <div className="shell-kicker__copy">
          {breadcrumbItems.length > 0 ? (
            <nav className="shell-kicker__breadcrumbs" aria-label="Workspace breadcrumbs">
              {breadcrumbItems.map((crumb, index) => {
                const isLast = index === breadcrumbItems.length - 1
                const isHostCrumb = Boolean(hostRoot) && index === 0

                if (isHostCrumb && hostRoot) {
                  return (
                    <span className="shell-kicker__breadcrumb-item" key={`host-${hostRoot.label}`}>
                      {hasHostSelector ? (
                        <Popover
                          align="bottom-start"
                          caret
                          open={hostSelectorOpen}
                          onRequestClose={() => {
                            setHostSelectorOpen(false)
                            setHostFilter('')
                          }}
                        >
                          <button
                            type="button"
                            className="shell-kicker__breadcrumb-host"
                            aria-label={`Current host ${hostRoot.label}. Select a different host.`}
                            aria-haspopup="dialog"
                            aria-expanded={hostSelectorOpen}
                            onClick={() => setHostSelectorOpen((current) => {
                              const next = !current
                              if (!next) {
                                setHostFilter('')
                              }
                              return next
                            })}
                          >
                            <span className="shell-kicker__breadcrumb-host-label">{hostRoot.label}</span>
                            <CaretDown size={12} aria-hidden />
                          </button>
                          <PopoverContent className="shell-kicker__host-switcher">
                            <p className="shell-kicker__host-switcher-title">Switch host view</p>
                            <label className="shell-kicker__host-filter-label" htmlFor="shell-kicker-host-filter">
                              Filter hosts
                            </label>
                            <input
                              id="shell-kicker-host-filter"
                              type="search"
                              value={hostFilter}
                              placeholder="Search hostname, label, or status"
                              className="shell-kicker__host-filter-input"
                              onChange={(event) => setHostFilter(event.target.value)}
                            />
                            <div className="shell-kicker__host-switcher-list">
                              {filteredHostOptions.map((option) => (
                                <button
                                  key={option.nodeId}
                                  type="button"
                                  className={`shell-kicker__host-switcher-option${option.isActive ? ' is-active' : ''}`}
                                  onClick={() => {
                                    hostRoot.onSelect(option.nodeId)
                                    setHostSelectorOpen(false)
                                    setHostFilter('')
                                  }}
                                >
                                  <span className="shell-kicker__host-switcher-copy">
                                    <span>{option.label}</span>
                                    {option.secondaryLabel ? (
                                      <span className="shell-kicker__host-switcher-secondary">{option.secondaryLabel}</span>
                                    ) : null}
                                  </span>
                                  <span className={`shell-kicker__host-switcher-status${option.statusTone ? ` is-${option.statusTone}` : ''}`}>
                                    {option.statusLabel}
                                  </span>
                                </button>
                              ))}
                              {filteredHostOptions.length === 0 ? (
                                <p className="shell-kicker__host-switcher-empty">No hosts match this filter.</p>
                              ) : null}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="shell-kicker__breadcrumb-host-label" aria-current={isLast ? 'page' : undefined}>
                          {hostRoot.label}
                        </span>
                      )}
                      {!isLast ? <span className="shell-kicker__breadcrumb-sep">/</span> : null}
                    </span>
                  )
                }

                return (
                  <span className="shell-kicker__breadcrumb-item" key={`${crumb.label}-${index}`}>
                    {crumb.to && !isLast ? (
                      <Link to={crumb.to} className="shell-kicker__breadcrumb-link">{crumb.label}</Link>
                    ) : (
                      <span
                        className={isLast ? 'shell-kicker__breadcrumb-current' : undefined}
                        aria-current={isLast ? 'page' : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                    {!isLast ? <span className="shell-kicker__breadcrumb-sep">/</span> : null}
                  </span>
                )
              })}
            </nav>
          ) : null}
          {kicker ? <div className="shell-kicker__eyebrow">{kicker}</div> : null}
          {title ? <h1 className="shell-kicker__title">{title}</h1> : null}
          {subtitle ? <p className="shell-kicker__subtitle">{subtitle}</p> : null}
          {lead ? <div className="shell-kicker__lead">{lead}</div> : null}
        </div>
        {hasControls ? (
          <div className="shell-kicker__actions" role="toolbar" aria-label="Workspace actions">
            {actions.slice(0, 8).map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  type="button"
                  className="shell-kicker__action"
                  data-active={action.active ? 'true' : 'false'}
                  disabled={action.disabled === true}
                  title={action.title ?? action.label}
                  onClick={action.onClick}
                >
                  {action.status ? (
                    <span
                      className={`shell-kicker__action-dot shell-kicker__action-dot--${action.status}`}
                      aria-hidden="true"
                    />
                  ) : null}
                  {Icon ? <Icon size={12} /> : null}
                  {action.label}
                </button>
              )
            })}
            {onClose ? (
              <button
                type="button"
                className="shell-kicker__action shell-kicker__action--close"
                aria-label={closeLabel ?? `Close ${title ?? 'workspace'}`}
                title={closeLabel ?? `Close ${title ?? 'workspace'}`}
                onClick={onClose}
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}
