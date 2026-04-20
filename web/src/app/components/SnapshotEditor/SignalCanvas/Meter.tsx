export interface MeterProps {
  left: number
  right?: number
  stale?: boolean
  clipped?: boolean
  onClearClip?: () => void
}

export function Meter({ left, right = left, stale = false, clipped = false, onClearClip }: MeterProps) {
  const leftLevel = clampMeter(left)
  const rightLevel = clampMeter(right)
  const valueLabel = stale ? '--.-' : `${Math.round(Math.max(leftLevel, rightLevel) * 100)}`

  return (
    <button
      type="button"
      className={`snapshot-meter${stale ? ' is-stale' : ''}${clipped ? ' is-clipped' : ''}`}
      aria-label={clipped ? 'Meter clipped, click to clear' : `Meter ${valueLabel} percent`}
      onClick={onClearClip}
    >
      <span className="snapshot-meter__display">{valueLabel}</span>
      <span className="snapshot-meter__bars" aria-hidden>
        <span className="snapshot-meter__bar" style={{ inlineSize: `${leftLevel * 100}%` }} />
        <span className="snapshot-meter__bar" style={{ inlineSize: `${rightLevel * 100}%` }} />
      </span>
    </button>
  )
}

function clampMeter(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}
