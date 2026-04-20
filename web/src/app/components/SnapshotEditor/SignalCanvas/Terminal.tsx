import { SignalCanvasIcon } from './icons'

export interface TerminalProps {
  role: 'input' | 'output'
  label?: string
  active?: boolean
}

export function Terminal({ role, label = role === 'input' ? 'IN' : 'OUT', active = false }: TerminalProps) {
  return (
    <div className={`snapshot-terminal snapshot-terminal--${role}${active ? ' is-active' : ''}`} aria-label={`${label} terminal`}>
      <span className="terminal-led" aria-hidden />
      <SignalCanvasIcon id={role === 'input' ? 'i-vol-in' : 'i-vol-out'} className="snapshot-terminal__icon" />
      <span>{label}</span>
    </div>
  )
}
