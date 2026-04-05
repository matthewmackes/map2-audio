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

function truncateLabel(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`
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

function previewModeLabel(category: LauncherCatalogItem['category']): string {
  switch (category) {
    case 'Audio Interface':
      return 'I/O'
    case 'Human Interface':
      return 'CTRL'
    case 'Platform':
    default:
      return 'OPS'
  }
}

function previewStateLabel(maturity: LauncherCatalogItem['maturity']): string {
  switch (maturity) {
    case 'production':
      return 'LIVE'
    case 'qualified-with-waiver':
      return 'READY'
    case 'beta':
      return 'BETA'
    case 'experimental':
      return 'LAB'
    case 'hardware-blocked':
    default:
      return 'HOLD'
  }
}

function buildSparkline(seed: number, x: number, y: number, width: number, height: number, offset: number): string {
  const step = width / 6

  return Array.from({ length: 7 }, (_value, index) => {
    const sample = ((seed + offset + (index * 17)) % 100) / 100
    const pointX = x + (index * step)
    const pointY = y + height - (sample * height)
    return `${index === 0 ? 'M' : 'L'} ${pointX.toFixed(1)} ${pointY.toFixed(1)}`
  }).join(' ')
}

function renderPreviewScene(seed: number) {
  const layoutVariant = seed % 3

  if (layoutVariant === 0) {
    const dots = Array.from({ length: 3 }, (_value, index) => ({
      cx: 112 + (index * 22),
      cy: 121 - ((seed + (index * 19)) % 26),
    }))

    return (
      <>
        <g className="platform-launchers-art__grid">
          {Array.from({ length: 4 }, (_value, index) => (
            <line
              key={`chart-grid-row-${index}`}
              x1="92"
              y1={93 + (index * 10)}
              x2="194"
              y2={93 + (index * 10)}
              className="platform-launchers-art__grid-line"
            />
          ))}
        </g>
        <path d={buildSparkline(seed, 94, 90, 96, 36, 11)} className="platform-launchers-art__line" />
        <path d={buildSparkline(seed, 94, 96, 96, 24, 43)} className="platform-launchers-art__line platform-launchers-art__line--secondary" />
        {dots.map((dot, index) => (
          <circle
            key={`chart-dot-${index}`}
            cx={dot.cx}
            cy={dot.cy}
            r="3.2"
            className="platform-launchers-art__node platform-launchers-art__node--accent"
          />
        ))}
      </>
    )
  }

  if (layoutVariant === 1) {
    const nodes = [
      { x: 108, y: 96, width: 24, height: 14 },
      { x: 152, y: 84, width: 28, height: 16 },
      { x: 144, y: 120, width: 26, height: 14 },
      { x: 186, y: 102, width: 22, height: 14 },
    ]

    const edges = [
      { x1: 132, y1: 103, x2: 152, y2: 92 },
      { x1: 132, y1: 103, x2: 144, y2: 127 },
      { x1: 180, y1: 92, x2: 186, y2: 109 },
      { x1: 170, y1: 127, x2: 186, y2: 109 },
    ]

    return (
      <>
        {edges.map((edge, index) => (
          <line
            key={`edge-${index}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            className="platform-launchers-art__connector"
          />
        ))}
        {nodes.map((node, index) => (
          <rect
            key={`node-${index}`}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx="6"
            className={index === 1 ? 'platform-launchers-art__node-block platform-launchers-art__node-block--active' : 'platform-launchers-art__node-block'}
          />
        ))}
        <circle cx="120" cy="103" r="3" className="platform-launchers-art__node platform-launchers-art__node--accent" />
        <circle cx="166" cy="92" r="3" className="platform-launchers-art__node" />
        <circle cx="157" cy="127" r="3" className="platform-launchers-art__node" />
        <circle cx="197" cy="109" r="3" className="platform-launchers-art__node" />
      </>
    )
  }

  const meters = Array.from({ length: 6 }, (_value, index) => ({
    x: 104 + (index * 14),
    y: 96,
    levelHeight: 12 + ((seed + (index * 13)) % 28),
  }))

  return (
    <>
      {meters.map((meter, index) => (
        <g key={`meter-${index}`}>
          <rect x={meter.x} y={meter.y} width="8" height="42" rx="4" className="platform-launchers-art__meter-track" />
          <rect
            x={meter.x}
            y={meter.y + 42 - meter.levelHeight}
            width="8"
            height={meter.levelHeight}
            rx="4"
            className={index % 2 === 0 ? 'platform-launchers-art__meter-level' : 'platform-launchers-art__meter-level platform-launchers-art__meter-level--alt'}
          />
        </g>
      ))}
      <path d={buildSparkline(seed, 190, 94, 26, 32, 29)} className="platform-launchers-art__line platform-launchers-art__line--secondary" />
    </>
  )
}

export function WorkspaceCatalogArtwork({ item }: { item: LauncherCatalogItem }) {
  const seed = hashString(item.route)
  const activeNavIndex = seed % 5
  const navSlots = Array.from({ length: 5 }, (_value, index) => ({
    y: 52 + (index * 20),
    width: 18 + ((seed + (index * 11)) % 22),
    active: index === activeNavIndex,
  }))
  const metricCards = [
    {
      x: 92,
      label: item.category === 'Audio Interface' ? 'Inputs' : item.category === 'Human Interface' ? 'Scenes' : 'Nodes',
      value: `${2 + (seed % 8)}`,
    },
    {
      x: 156,
      label: 'Docs',
      value: `${item.documentLinks.length}`.padStart(2, '0'),
    },
    {
      x: 220,
      label: 'Specs',
      value: `${item.technicalSpecs.length}`.padStart(2, '0'),
    },
  ]
  const detailRows = Array.from({ length: 4 }, (_value, index) => ({
    y: 96 + (index * 11),
    width: 28 + ((seed + (index * 17)) % 32),
    active: index === 0,
  }))
  const footerSteps = Array.from({ length: 7 }, (_value, index) => ({
    x: 172 + (index * 16),
    width: 10 + ((seed + (index * 7)) % 6),
  }))
  const title = truncateLabel(item.shortLabel ?? item.heroTitle, 18)
  const routeLabel = truncateLabel(item.route.replace('/platforms/', 'platforms/').replace(/^\//, ''), 18)

  return (
    <div className={`platform-launchers-art ${toneClass(item)}`} aria-hidden="true">
      <svg viewBox="0 0 320 180" focusable="false">
        <rect x="10" y="14" width="300" height="154" rx="20" className="platform-launchers-art__shadow" />
        <rect x="12" y="12" width="296" height="156" rx="20" className="platform-launchers-art__surface" />
        <rect x="12" y="12" width="296" height="28" rx="20" className="platform-launchers-art__chrome" />

        <circle cx="30" cy="26" r="4" className="platform-launchers-art__traffic" />
        <circle cx="44" cy="26" r="4" className="platform-launchers-art__traffic platform-launchers-art__traffic--muted" />
        <circle cx="58" cy="26" r="4" className="platform-launchers-art__traffic platform-launchers-art__traffic--muted" />

        <text x="76" y="27" className="platform-launchers-art__title">{title}</text>
        <text x="76" y="35" className="platform-launchers-art__subtitle">{previewModeLabel(item.category)} workspace preview</text>

        <rect x="246" y="18" width="48" height="14" rx="7" className="platform-launchers-art__chip" />
        <text x="270" y="28" textAnchor="middle" className="platform-launchers-art__chip-text">{previewStateLabel(item.maturity)}</text>

        <rect x="20" y="46" width="56" height="112" rx="14" className="platform-launchers-art__sidebar" />
        <text x="30" y="61" className="platform-launchers-art__sidebar-label">{previewModeLabel(item.category)}</text>
        {navSlots.map((slot, index) => (
          <rect
            key={`nav-slot-${index}`}
            x="30"
            y={slot.y}
            width={slot.width}
            height="6"
            rx="3"
            className={slot.active ? 'platform-launchers-art__nav-slot platform-launchers-art__nav-slot--active' : 'platform-launchers-art__nav-slot'}
          />
        ))}
        <rect x="30" y="148" width="36" height="4" rx="2" className="platform-launchers-art__nav-slot" />

        <rect x="84" y="46" width="216" height="112" rx="14" className="platform-launchers-art__canvas" />
        {metricCards.map((metric) => (
          <g key={`metric-${metric.label}`}>
            <rect x={metric.x} y="54" width="52" height="24" rx="8" className="platform-launchers-art__metric-card" />
            <text x={metric.x + 8} y="63" className="platform-launchers-art__metric-label">{metric.label}</text>
            <text x={metric.x + 8} y="73" className="platform-launchers-art__metric-value">{metric.value}</text>
          </g>
        ))}

        <rect x="92" y="86" width="116" height="54" rx="10" className="platform-launchers-art__panel" />
        {renderPreviewScene(seed)}

        <rect x="216" y="86" width="72" height="54" rx="10" className="platform-launchers-art__panel platform-launchers-art__panel--secondary" />
        <text x="226" y="97" className="platform-launchers-art__panel-label">Signals</text>
        {detailRows.map((row, index) => (
          <rect
            key={`detail-row-${index}`}
            x="226"
            y={row.y}
            width={row.width}
            height="5"
            rx="2.5"
            className={row.active ? 'platform-launchers-art__detail-row platform-launchers-art__detail-row--active' : 'platform-launchers-art__detail-row'}
          />
        ))}
        <rect x="226" y="136" width="28" height="4" rx="2" className="platform-launchers-art__detail-row" />

        <rect x="92" y="146" width="196" height="8" rx="4" className="platform-launchers-art__footer-bar" />
        <text x="98" y="152" className="platform-launchers-art__footer-label">{routeLabel}</text>
        {footerSteps.map((step, index) => (
          <rect
            key={`footer-step-${index}`}
            x={step.x}
            y="148"
            width={step.width}
            height="4"
            rx="2"
            className={index === footerSteps.length - 1 ? 'platform-launchers-art__footer-step platform-launchers-art__footer-step--active' : 'platform-launchers-art__footer-step'}
          />
        ))}
      </svg>
    </div>
  )
}

export default WorkspaceCatalogArtwork
