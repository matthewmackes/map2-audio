// SignalChainBlock — single block in a signal chain (left-to-right
// audio flow). Pre-component for the unified signal-flow primitive
// designed by T2477. Until that lands, individual workspaces compose
// SignalChainBlock instances inside their existing flow renderers.
//
// Visual contract:
//   - Title and optional eyebrow.
//   - Optional bypass state — when bypassed, the block grays out.
//   - Optional flow direction indicator on the right edge.
//
// Edge anchoring (for connecting wires) is the consumer's responsibility;
// SignalChainBlock just renders the box.

import type { ReactNode } from 'react'
import './SignalChainBlock.css'

interface SignalChainBlockProps {
  title: ReactNode
  eyebrow?: string
  bypassed?: boolean
  /** Show a small "→" indicator on the right edge to suggest flow direction. */
  showFlowIndicator?: boolean
  /** Optional small status chip slot (top-right). */
  status?: ReactNode
  /** Children render inside the block body (parameter readouts, etc.). */
  children?: ReactNode
  className?: string
  onClick?: () => void
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function SignalChainBlock({
  title,
  eyebrow,
  bypassed = false,
  showFlowIndicator = false,
  status,
  children,
  className,
  onClick,
}: SignalChainBlockProps) {
  const Element = onClick ? 'button' : 'div'
  const elementProps = onClick
    ? { type: 'button' as const, onClick }
    : {}
  return (
    <Element
      {...elementProps}
      className={joinClasses(
        'map2-signal-chain-block',
        bypassed && 'map2-signal-chain-block--bypassed',
        onClick && 'map2-signal-chain-block--interactive',
        className,
      )}
    >
      <div className="map2-signal-chain-block__head">
        <div className="map2-signal-chain-block__head-copy">
          {eyebrow ? <span className="map2-signal-chain-block__eyebrow">{eyebrow}</span> : null}
          <span className="map2-signal-chain-block__title">{title}</span>
        </div>
        {status ? <div className="map2-signal-chain-block__status">{status}</div> : null}
      </div>
      {children ? <div className="map2-signal-chain-block__body">{children}</div> : null}
      {showFlowIndicator ? (
        <span className="map2-signal-chain-block__flow-indicator" aria-hidden="true">›</span>
      ) : null}
    </Element>
  )
}

export default SignalChainBlock
