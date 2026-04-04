import type { LauncherCatalogItem } from '../../data/launcherCatalog'

import './WorkspaceCatalogArtwork.css'

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function toneClass(item: LauncherCatalogItem): string {
  if (item.maturity === 'hardware-blocked') {
    return 'platform-launchers-art--hardware'
  }

  switch (item.category) {
    case 'Audio Interface':
      return 'platform-launchers-art--audio'
    case 'Human Interface':
      return 'platform-launchers-art--human'
    case 'Platform':
    default:
      return 'platform-launchers-art--platform'
  }
}

export function WorkspaceCatalogArtwork({ item }: { item: LauncherCatalogItem }) {
  const seed = hashString(item.route)
  const columns = Array.from({ length: 4 }, (_value, index) => ({
    x: 28 + (index * 66),
    y: 34 + ((seed + (index * 17)) % 28),
    width: 46,
    height: 94 - ((seed + (index * 13)) % 26),
  }))
  const pulses = Array.from({ length: 3 }, (_value, index) => ({
    cx: 56 + (index * 92),
    cy: 130 - ((seed + (index * 19)) % 44),
    r: 10 + ((seed + (index * 11)) % 9),
  }))

  return (
    <div className={`platform-launchers-art ${toneClass(item)}`} aria-hidden="true">
      <svg viewBox="0 0 320 180" focusable="false">
        <rect x="1" y="1" width="318" height="178" rx="18" className="platform-launchers-art__frame" />
        <path
          d={`M24 ${118 - (seed % 18)} C88 ${86 - (seed % 10)}, 136 ${148 - (seed % 16)}, 204 ${112 - (seed % 12)} S278 ${86 - (seed % 9)}, 296 ${74 + (seed % 18)}`}
          className="platform-launchers-art__signal"
        />
        <g className="platform-launchers-art__columns">
          {columns.map((column, index) => (
            <rect
              key={`${item.route}-column-${column.x}`}
              x={column.x}
              y={column.y}
              width={column.width}
              height={column.height}
              rx="12"
              className={index % 2 === 0 ? 'platform-launchers-art__column' : 'platform-launchers-art__column platform-launchers-art__column--alt'}
            />
          ))}
        </g>
        <g className="platform-launchers-art__pulses">
          {pulses.map((pulse) => (
            <circle
              key={`${item.route}-pulse-${pulse.cx}`}
              cx={pulse.cx}
              cy={pulse.cy}
              r={pulse.r}
              className="platform-launchers-art__pulse"
            />
          ))}
        </g>
        <rect x="24" y="24" width="94" height="16" rx="8" className="platform-launchers-art__label" />
        <rect x="24" y="146" width="132" height="12" rx="6" className="platform-launchers-art__label platform-launchers-art__label--wide" />
      </svg>
    </div>
  )
}

export default WorkspaceCatalogArtwork
