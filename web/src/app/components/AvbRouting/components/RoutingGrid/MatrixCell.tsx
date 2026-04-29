// Matrix Cell — single cell in the routing matrix. T2475 (E1)
// Carbon migration:
//   Box → semantic <div>
//   CircularProgress → Carbon InlineLoading (or a CSS spinner; the
//     cell is small so a 16px CSS-only spinner keeps the DOM cheap)
//   MUI Tooltip with rich React content → native title attribute
//     so the matrix doesn't render thousands of off-screen tooltip
//     bodies. Cross-node overlay role/aria-label preserved verbatim.
// All MUI palette literals (#4caf50, #ff9800, #2196f3, #f44336,
// #ffd43b, #1976d2, primary.main) routed through MAP semantic
// tokens via inline style or CSS class.

import type { ReactNode } from 'react'
import { CheckmarkFilled, ErrorFilled, Link, Locked } from '@carbon/icons-react'

import { useRouting } from '../../context/RoutingContext'
import { useAvbStreams } from '../../hooks/useAvbApi'
import { getRouteStreams } from '../../utils/avbRouteStreams'
import type { Endpoint, Route } from '../../types'
import './MatrixCell.css'

interface MatrixCellProps {
  talker: Endpoint
  listener: Endpoint
  route: Route | null
  isPending: boolean
  isHovered: boolean
  isFocused: boolean
  isSelected?: boolean
  onClick: () => void
  onHover: (hover: boolean) => void
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseMove?: () => void
}

// MAP-semantic palette pinned for inline use. SVG/CSS gradient
// strings need real hex values; these resolve to the same shades
// as --map2-state-* / --map2-alert-* under the default g100 shell.
const STATE_LIVE = '#42be65'        // green-40
const STATE_STAGED = '#4589ff'      // blue-50
const ALERT_ADVISORY = '#f1c21b'    // yellow-30
const ALERT_CRITICAL = '#fa4d56'    // red-40
const FOCUS_BLUE = '#78a9ff'        // blue-40

export function MatrixCell({
  talker,
  listener,
  route,
  isPending,
  isHovered,
  isFocused,
  isSelected = false,
  onClick,
  onHover,
  onMouseDown,
  onMouseMove,
}: MatrixCellProps) {
  const { state } = useRouting()
  const { data: avbStreamsData } = useAvbStreams()
  const routeFailoverStreams = route ? getRouteStreams(route, avbStreamsData?.streams || []) : []

  const isConnected = route?.state === 'connected'
  const isConnecting = route?.state === 'connecting'
  const isError = route?.state === 'error'
  const isLocked = route?.locked || false

  const isCrossNode = talker.node_id !== listener.node_id
  const talkerNode = state.network.nodes[talker.node_id]
  const listenerNode = state.network.nodes[listener.node_id]
  const talkerColor = talkerNode?.color || STATE_STAGED
  const listenerColor = listenerNode?.color || STATE_STAGED

  const hasWarning =
    talker.sample_rate !== listener.sample_rate ||
    talker.channels !== listener.channels

  // Tooltip body compressed into a single-line title attribute so
  // the DOM stays cheap on large matrices.
  const titleParts: string[] = []
  if (route) {
    titleParts.push(`${talker.device_name} → ${listener.device_name}${isCrossNode ? ' (cross-node)' : ''}`)
    titleParts.push(`State: ${route.state}`)
    if (isCrossNode) {
      titleParts.push(`Cross-Node: ${talkerNode?.name || 'Unknown'} → ${listenerNode?.name || 'Unknown'}`)
    }
    if (route.established_time) {
      titleParts.push(`Connected: ${new Date(route.established_time).toLocaleTimeString()}`)
    }
    if (route.error_message) {
      titleParts.push(`Error: ${route.error_message}`)
    }
    if (isLocked) titleParts.push('Locked')
    if (route.srp_reservation_id) {
      titleParts.push(`SRP: ${route.srp_reservation_id.slice(0, 8)}...`)
    }
    if (routeFailoverStreams.length > 0) {
      titleParts.push(`AVB failover streams: ${routeFailoverStreams.length}`)
      routeFailoverStreams.forEach((stream) => {
        const policy = stream.diagnostics?.effective_config.failover_policy || 'none'
        const candidates = stream.diagnostics?.effective_config.interface_candidates || []
        titleParts.push(
          `  ${stream.stream_id} • policy ${policy} • candidates ${candidates.length > 0 ? candidates.join(', ') : 'none'}`,
        )
      })
    }
  } else if (hasWarning) {
    titleParts.push(`${talker.device_name} → ${listener.device_name}`)
    titleParts.push('Warnings:')
    if (talker.sample_rate !== listener.sample_rate) {
      titleParts.push(`Sample rate mismatch: ${talker.sample_rate}Hz ≠ ${listener.sample_rate}Hz`)
    }
    if (talker.channels !== listener.channels) {
      titleParts.push(`Channel count mismatch: ${talker.channels}ch ≠ ${listener.channels}ch`)
    }
  } else {
    titleParts.push(`${talker.device_name} → ${listener.device_name}`)
    titleParts.push('Click to connect')
    titleParts.push(`${talker.channels}ch @ ${talker.sample_rate / 1000}kHz`)
  }
  const titleAttr = titleParts.join('\n')

  const getBgColor = (): string => {
    if (isConnected) {
      if (isCrossNode) {
        return `linear-gradient(135deg, ${talkerColor}AA 0%, ${listenerColor}AA 100%)`
      }
      return isPending ? ALERT_ADVISORY : STATE_LIVE
    }
    if (isConnecting) {
      return isCrossNode
        ? `linear-gradient(135deg, ${talkerColor}66 0%, ${listenerColor}66 100%)`
        : STATE_STAGED
    }
    if (isError) return ALERT_CRITICAL
    if (isPending) return ALERT_ADVISORY
    if (isHovered) return 'rgba(255, 255, 255, 0.1)'
    return 'transparent'
  }

  const getBorder = (): string => {
    if (isSelected) return `2px solid ${STATE_STAGED}`
    if (isPending) return `2px solid ${ALERT_ADVISORY}`
    if (isCrossNode && (isConnected || isConnecting))
      return '2px dashed rgba(255, 255, 255, 0.5)'
    if (hasWarning && !isConnected) return `1px dashed ${ALERT_ADVISORY}`
    return '1px solid rgba(255, 255, 255, 0.12)'
  }

  const cellContent: ReactNode = (
    <>
      {isConnecting && <span className="matrix-cell__spinner" aria-hidden="true" />}
      {isConnected && <CheckmarkFilled size={24} className="matrix-cell__icon" />}
      {isError && <ErrorFilled size={24} className="matrix-cell__icon" />}
      {isCrossNode && (isConnected || isConnecting) && (
        <span
          role="img"
          aria-label="Cross-node route"
          className="matrix-cell__crossnode"
        >
          <Link size={12} />
        </span>
      )}
      {isLocked && (
        <span className="matrix-cell__lock" aria-label="Locked">
          <Locked size={14} />
        </span>
      )}
      {hasWarning && !isConnected && (
        <span className="matrix-cell__warning-dot" aria-hidden="true" />
      )}
    </>
  )

  return (
    <div
      className="matrix-cell"
      title={titleAttr}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      style={{
        background: getBgColor(),
        border: getBorder(),
        cursor: isLocked ? 'not-allowed' : 'pointer',
        outline: isFocused ? `2px solid ${FOCUS_BLUE}` : 'none',
        outlineOffset: isFocused ? -2 : 0,
        boxShadow: isSelected
          ? `0 0 0 2px rgba(69, 137, 255, 0.4), inset 0 0 8px rgba(69, 137, 255, 0.2)`
          : isFocused
            ? '0 0 0 2px rgba(69, 137, 255, 0.3)'
            : 'none',
      }}
    >
      {cellContent}
    </div>
  )
}

export default MatrixCell
