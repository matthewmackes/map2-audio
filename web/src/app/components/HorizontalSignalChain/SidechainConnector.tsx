/**
 * Displays a visual connector for incoming sidechain signals.
 */

import { Link, Unlink } from '@carbon/icons-react'

export interface SidechainConnectorProps {
  /** The source of the sidechain signal */
  source?: string
  /** The source chain label (A, B, C, etc.) */
  sourceChainLabel?: string
  /** Whether the sidechain is connected */
  isConnected: boolean
  /** Whether the sidechain signal is active */
  isActive?: boolean
  /** Click handler to configure sidechain */
  onClick?: () => void
}

export function SidechainConnector({
  source,
  sourceChainLabel,
  isConnected,
  isActive = false,
  onClick,
}: SidechainConnectorProps) {
  return (
    <button
      type="button"
      className={`snapshot-sidechain-connector h-sidechain-connector ${isConnected ? 'connected' : 'disconnected'} ${isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={isConnected ? `Sidechain from ${source || 'unknown source'}` : 'Sidechain input not connected'}
      title={isConnected ? `Sidechain from: ${source || 'Unknown'}` : 'Sidechain input (not connected)'}
    >
      {/* Vertical connector line coming from above */}
      <div className="h-sidechain-line-vertical" />

      {/* Source indicator */}
      <div className="h-sidechain-source">
        {isConnected ? (
          <>
            <Link size={10} />
            {sourceChainLabel && (
              <span className="h-sidechain-source-label">{sourceChainLabel}</span>
            )}
          </>
        ) : (
          <Unlink size={10} />
        )}
      </div>

      {/* Arrow pointing down to plugin */}
      <div className="h-sidechain-arrow-down" />
    </button>
  )
}

export default SidechainConnector
