// Sticky Headers — talker (top) and listener (left) headers for the
// routing matrix. T2475 (E1) Carbon migration:
//   Box/Stack       → semantic divs
//   Typography      → spans
//   Tooltip (MUI)   → native title attribute (Carbon Tooltip
//                     eagerly renders its label and would clutter
//                     the DOM with one tooltip body per endpoint
//                     in large matrices)
//   Chip/Stack      → unused, dropped from imports
// Per-node accent color preserved as inline style — node identity
// is the dominant visual signal in the routing grid.

import { Devices, DotMark, Pin, Router } from '@carbon/icons-react'

import { useRouting } from '../../context/RoutingContext'
import type { Endpoint } from '../../types'
import './StickyHeaders.css'

interface StickyHeadersProps {
  talkers: Endpoint[]
  listeners: Endpoint[]
  cellWidth: number
  cellHeight: number
  headerWidth: number
  headerHeight: number
}

export function StickyHeaders({
  talkers,
  listeners,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
}: StickyHeadersProps) {
  const { state } = useRouting()

  const getNodeColor = (endpoint: Endpoint): string => {
    const node = state.network.nodes[endpoint.node_id]
    return node?.color || '#4589ff' // Default Carbon blue-50
  }

  return (
    <>
      <div
        className="sticky-headers__corner"
        style={{ width: headerWidth, height: headerHeight }}
      >
        <span className="sticky-headers__corner-label">
          Talkers →<br />↓ Listeners
        </span>
      </div>

      <div
        className="sticky-headers__top"
        style={{ left: headerWidth, height: headerHeight }}
      >
        {talkers.map((talker) => (
          <TalkerHeader
            key={talker.endpoint_id}
            talker={talker}
            width={cellWidth}
            height={headerHeight}
            nodeColor={getNodeColor(talker)}
          />
        ))}
      </div>

      <div
        className="sticky-headers__left"
        style={{ top: headerHeight, width: headerWidth }}
      >
        {listeners.map((listener) => (
          <ListenerHeader
            key={listener.endpoint_id}
            listener={listener}
            width={headerWidth}
            height={cellHeight}
            nodeColor={getNodeColor(listener)}
          />
        ))}
      </div>
    </>
  )
}

function endpointTitle(endpoint: Endpoint): string {
  const lines = [
    endpoint.device_name,
    `ID: ${endpoint.endpoint_id}`,
    `Type: ${endpoint.device_type.toUpperCase()}`,
    `${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}kHz`,
    `Format: ${endpoint.format}`,
    endpoint.mac_address ? `MAC: ${endpoint.mac_address}` : null,
    `Status: ${endpoint.available ? 'Available' : 'Offline'}`,
    endpoint.tags.length > 0 ? `Tags: ${endpoint.tags.join(', ')}` : null,
  ].filter(Boolean)
  return lines.join(' • ')
}

function TalkerHeader({
  talker,
  width,
  height,
  nodeColor,
}: {
  talker: Endpoint
  width: number
  height: number
  nodeColor: string
}) {
  const DeviceIcon = talker.device_type === 'map2' ? Devices : Router
  const statusToneClass = talker.available
    ? 'sticky-headers__status-dot--ok'
    : 'sticky-headers__status-dot--offline'

  return (
    <div
      className="sticky-headers__talker"
      title={endpointTitle(talker)}
      style={{
        width,
        height,
        minWidth: width,
        background: `${nodeColor}15`,
        borderTop: `3px solid ${nodeColor}`,
      }}
    >
      <div className="sticky-headers__icon-row">
        <DeviceIcon size={14} />
        <DotMark size={12} className={`sticky-headers__status-dot ${statusToneClass}`} />
      </div>
      <span
        className="sticky-headers__talker-name"
        style={{ maxHeight: height - 40 }}
      >
        {talker.device_name}
      </span>
      {talker.pinned && <Pin size={10} />}
    </div>
  )
}

function ListenerHeader({
  listener,
  width,
  height,
  nodeColor,
}: {
  listener: Endpoint
  width: number
  height: number
  nodeColor: string
}) {
  const DeviceIcon = listener.device_type === 'map2' ? Devices : Router
  const statusToneClass = listener.available
    ? 'sticky-headers__status-dot--ok'
    : 'sticky-headers__status-dot--offline'

  return (
    <div
      className="sticky-headers__listener"
      title={endpointTitle(listener)}
      style={{
        width,
        height,
        minHeight: height,
        background: `${nodeColor}15`,
        borderLeft: `3px solid ${nodeColor}`,
      }}
    >
      <div className="sticky-headers__listener-icon-col">
        <DeviceIcon size={14} />
        <DotMark size={12} className={`sticky-headers__status-dot ${statusToneClass}`} />
      </div>
      <span className="sticky-headers__listener-name">{listener.device_name}</span>
      {listener.pinned && <Pin size={12} />}
    </div>
  )
}

export default StickyHeaders
