import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { useLatencyPressure } from '../hooks/useLatencyPressure'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { SegmentedLedText } from './Displays/SegmentedLedText'
import { NODE_PAGE_KEYS, pageKeyFromPathname } from '../utils/nodeDisplay'

function resolveShellLatencyPageKey(pathname: string, panel: string | null): string {
  if (pathname.startsWith('/platform') && panel === 'audio-engine') {
    return NODE_PAGE_KEYS.audioEngine
  }

  return pageKeyFromPathname(pathname) ?? 'global'
}

export function LatencyPressureShellReadout() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const pageKey = useMemo(
    () => resolveShellLatencyPageKey(location.pathname, searchParams.get('panel')),
    [location.pathname, searchParams],
  )
  const { viewedNode } = useNodePageContext(pageKey)
  const nodeId = viewedNode && !viewedNode.is_local ? viewedNode.node_id : null
  const pressure = useLatencyPressure({ nodeId })
  const title = pressure.isAvailable
    ? `${pressure.helperText}${viewedNode ? ` · Node ${viewedNode.hostname}` : ''}`
    : 'Latency pressure score is waiting for realtime telemetry.'

  return (
    <div
      className={`topbar-pro__latency-pressure topbar-pro__latency-pressure--${pressure.tone === 'red' ? 'critical' : 'stable'}`}
      title={title}
      data-testid="shell-latency-pressure-readout"
    >
      <span className="topbar-pro__latency-pressure-label" aria-hidden="true">LAT</span>
      <SegmentedLedText
        value={pressure.scoreDisplay}
        size="md"
        color={pressure.toneColor}
        className="topbar-pro__latency-pressure-digits"
      />
    </div>
  )
}

export default LatencyPressureShellReadout
