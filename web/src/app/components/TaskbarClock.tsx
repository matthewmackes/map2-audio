import { Popover, PopoverContent } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'

import { MAP2_PLATFORM_VERSION } from './branding/map2Branding'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'

const CLOCK_REFRESH_MS = 30_000

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const compactDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function formatUptime(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return 'just started'
  }

  const totalMinutes = Math.floor(totalMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

export function TaskbarClock() {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const platformStatus = useHomePlatformStatus()
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const bootedAt = useMemo(() => Date.now(), [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, CLOCK_REFRESH_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const uptime = formatUptime(now.getTime() - bootedAt)

  return (
    <Popover align="bottom-end" caret open={open} onRequestClose={() => setOpen(false)}>
      <button
        type="button"
        className="window-taskbar__clock"
        onClick={() => setOpen((current) => !current)}
        title={dateFormatter.format(now)}
        aria-label={`Open clock details for ${timeFormatter.format(now)}`}
      >
        <span aria-live="polite" aria-atomic="true">
          <span className="window-taskbar__clock-time">{timeFormatter.format(now)}</span>
          <span className="window-taskbar__clock-date">{compactDateFormatter.format(now)}</span>
        </span>
      </button>
      <PopoverContent className="window-taskbar__popover">
        <div className="window-taskbar__popover-body">
          <p className="window-taskbar__popover-kicker">System tray clock</p>
          <h3 className="window-taskbar__popover-title">{dateFormatter.format(now)}</h3>
          <p className="window-taskbar__popover-copy">{hostname}</p>
          <p className="window-taskbar__popover-copy">Uptime: {uptime}</p>
          <p className="window-taskbar__popover-copy">Version: {MAP2_PLATFORM_VERSION}</p>
          <div className="window-taskbar__popover-status-list">
            <span>{platformStatus.avb.label}</span>
            <span>{platformStatus.avdecc.label}</span>
            <span>{platformStatus.nodes.label}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default TaskbarClock
