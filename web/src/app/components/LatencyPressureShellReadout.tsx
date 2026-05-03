import { useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Popover, PopoverContent } from '@carbon/react'

import { useLatencyPressure } from '../hooks/useLatencyPressure'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { SegmentedLedText } from './Displays/SegmentedLedText'
import { NODE_PAGE_KEYS, pageKeyFromPathname } from '../utils/nodeDisplay'

const LATENCY_PRESSURE_WARNING = '#f1c21b'

function resolveShellLatencyPageKey(pathname: string, panel: string | null): string {
  // Nav reorg 2026-05-03 (second pass) — canonical Audio Engine
  // mount is `/node-ops/audio-engine`. Retain `/platforms/audio-engine`
  // for legacy redirect-in-flight URLs.
  if (
    pathname.startsWith('/node-ops/audio-engine')
    || pathname.startsWith('/platforms/audio-engine')
  ) {
    return NODE_PAGE_KEYS.audioEngine
  }

  if (pathname.startsWith('/platform') && panel === 'audio-engine') {
    return NODE_PAGE_KEYS.audioEngine
  }

  return pageKeyFromPathname(pathname) ?? 'global'
}

export function LatencyPressureShellReadout() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const pageKey = useMemo(
    () => resolveShellLatencyPageKey(location.pathname, searchParams.get('panel')),
    [location.pathname, searchParams],
  )
  const { viewedNode } = useNodePageContext(pageKey)
  const nodeId = viewedNode && !viewedNode.is_local ? viewedNode.node_id : null
  const pressure = useLatencyPressure({ nodeId })
  const pressureBand = pressure.status === 'critical' || pressure.status === 'offline'
    ? 'critical'
    : pressure.status === 'watch'
      ? 'warning'
      : 'stable'
  const displayColor = pressureBand === 'warning' ? LATENCY_PRESSURE_WARNING : pressure.toneColor
  const title = pressure.isAvailable
    ? `${pressure.helperText}${viewedNode ? ` · Node ${viewedNode.hostname}` : ''}`
    : 'Latency pressure score is waiting for realtime telemetry.'

  return (
    <Popover align="bottom-end" caret open={open} onRequestClose={() => setOpen(false)}>
      <button
        type="button"
        className={`topbar-pro__latency-pressure topbar-pro__latency-pressure--${pressureBand}`}
        title={title}
        data-testid="shell-latency-pressure-readout"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Latency pressure ${pressure.scoreDisplay}`}
      >
        <span className="topbar-pro__latency-pressure-label" aria-hidden="true">LAT</span>
        <span aria-live="polite" aria-atomic="true">
          <SegmentedLedText
            value={pressure.scoreDisplay}
            size="sm"
            color={displayColor}
            className="topbar-pro__latency-pressure-digits"
          />
        </span>
      </button>
      <PopoverContent className="window-taskbar__popover">
        <div className="window-taskbar__popover-body">
          <p className="window-taskbar__popover-kicker">Latency pressure</p>
          <h3 className="window-taskbar__popover-title">Score {pressure.scoreDisplay}/10</h3>
          <p className="window-taskbar__popover-copy">{pressure.helperText}</p>
          <p className="window-taskbar__popover-copy">
            {viewedNode ? `Scoped to ${viewedNode.hostname}` : 'Using global realtime telemetry.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default LatencyPressureShellReadout
