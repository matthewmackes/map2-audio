export interface JoinerProps {
  index: number
  kind: 'split' | 'merge'
  active?: boolean
}

export function Joiner({ index, kind, active = false }: JoinerProps) {
  const label = `${kind === 'split' ? 'Split' : 'Merge'} ${index}`

  return (
    <div className={`snapshot-joiner snapshot-joiner--${kind}${active ? ' is-active' : ''}`} aria-label={label}>
      <span className="snapshot-joiner__index">{index}</span>
    </div>
  )
}
