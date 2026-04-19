/**
 * Horizontal signal flow connector between plugin nodes
 */

import type { HorizontalConnectorProps } from './types'

export function HorizontalConnector({ isActive = true }: HorizontalConnectorProps) {
  return (
    <div
      className={`h-connector ${isActive ? 'active' : ''}`}
      aria-hidden="true"
    />
  )
}
