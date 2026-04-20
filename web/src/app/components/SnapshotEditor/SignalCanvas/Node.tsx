import { SignalCanvasIcon } from './icons'
import type { PluginCategorySpriteId } from '../../shared/pluginCategoryIcon'

export interface SignalNodeProps {
  label: string
  iconId: PluginCategorySpriteId
  selected?: boolean
  bypassed?: boolean
  cpuLoad?: number
  showBypassControl?: boolean
  bypassDisabled?: boolean
  onSelect?: () => void
  onBypassToggle?: () => void
}

export function SignalNode({
  label,
  iconId,
  selected = false,
  bypassed = false,
  cpuLoad = 0,
  showBypassControl = true,
  bypassDisabled = false,
  onSelect,
  onBypassToggle,
}: SignalNodeProps) {
  const cpuWarn = cpuLoad >= 0.85

  return (
    <div
      className={`snapshot-node${selected ? ' is-selected' : ''}${bypassed ? ' is-bypassed' : ''}${cpuWarn ? ' is-cpu-warn' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}${bypassed ? ' bypassed' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.()
        }
      }}
    >
      <span className="node-led" aria-hidden />
      <SignalCanvasIcon id={iconId} className="snapshot-node__icon" />
      <span className="snapshot-node__label">{label}</span>
      {showBypassControl ? (
        <button
          type="button"
          className="snapshot-node__bypass"
          aria-label={bypassed ? `Enable ${label}` : `Bypass ${label}`}
          disabled={bypassDisabled || !onBypassToggle}
          onClick={(event) => {
            event.stopPropagation()
            onBypassToggle?.()
          }}
        >
          {bypassed ? 'ON' : 'BYP'}
        </button>
      ) : null}
    </div>
  )
}
