/* NodeIdentityIcon — compact identity-pill that replaces the V4-A3 NodeIdentityCard
   in the global navigation rail. Renders a hexagon glyph with a health-tinted ring,
   the node display name, and the role (mode) chip. Clicking navigates to
   /node/:nodeId where the full NodeIdentityCard body lives.

   Health roll-up (worst-of-N → ring color):
     - 'critical'/dropouts                                         → danger (red)
     - 'warn' / 'watch' / cpu>=85 / mem>=85 / latency>=10ms        → warning (amber)
     - 'ok' + 'stable'                                             → success (green)
     - 'offline' / 'waiting'                                        → muted   (gray)

   The fill stays neutral identity tint; the ring carries the alert (per the
   chosen "color + ring/border severity" encoding). */

import { Link } from 'react-router-dom'

import type { NodeSummary } from '../../types/node'
import { formatNodeDisplayName, getNodeRoleLabel, getNodeStatusLabel } from '../../utils/nodeDisplay'
import './NodeIdentityIcon.css'

interface NodeIdentityIconProps {
  node: NodeSummary | null
  loadingLabel?: string
}

type HealthTone = 'success' | 'warning' | 'danger' | 'muted'

export function NodeIdentityIcon({ node, loadingLabel }: NodeIdentityIconProps) {
  if (!node) {
    return (
      <Link
        to="/node"
        className="node-id-icon"
        data-health="muted"
        aria-label="Node discovery unavailable. Open node detail."
      >
        <NodeHexGlyph tone="muted" />
        <span className="node-id-icon__text">
          <span className="node-id-icon__name">—</span>
          <span className="node-id-icon__role">{loadingLabel ?? 'UNAVAILABLE'}</span>
        </span>
      </Link>
    )
  }

  const tone = rollUpHealth(node)
  const displayName = formatNodeDisplayName(node)
  const roleLabel = getNodeRoleLabel(node.role).toUpperCase()
  const statusLabel = getNodeStatusLabel(node.status)

  return (
    <Link
      to={`/node/${encodeURIComponent(node.node_id)}`}
      className="node-id-icon"
      data-health={tone}
      aria-label={`Node ${displayName}, status ${statusLabel}. Open node detail.`}
    >
      <NodeHexGlyph tone={tone} />
      <span className="node-id-icon__text">
        <span className="node-id-icon__name">{displayName}</span>
        <span className="node-id-icon__role">{roleLabel}</span>
      </span>
    </Link>
  )
}

interface NodeHexGlyphProps {
  tone: HealthTone
}

function NodeHexGlyph({ tone }: NodeHexGlyphProps) {
  return (
    <svg
      className="node-id-icon__hex"
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden
      data-tone={tone}
    >
      {/* Pointy-top hexagon, centered on (16,16), circumscribed radius ~14. */}
      <polygon
        className="node-id-icon__hex-fill"
        points="16,2 28.12,9 28.12,23 16,30 3.88,23 3.88,9"
      />
      <polygon
        className="node-id-icon__hex-ring"
        points="16,2 28.12,9 28.12,23 16,30 3.88,23 3.88,9"
      />
      {/* Inner glyph — three small dots arranged as a node-graph cue. */}
      <circle className="node-id-icon__hex-dot" cx="16" cy="11" r="1.6" />
      <circle className="node-id-icon__hex-dot" cx="11" cy="20" r="1.6" />
      <circle className="node-id-icon__hex-dot" cx="21" cy="20" r="1.6" />
    </svg>
  )
}

function rollUpHealth(node: NodeSummary): HealthTone {
  if (node.status === 'offline') return 'muted'
  if (node.status === 'critical') return 'danger'
  if ((node.xrun_count ?? 0) > 0) return 'danger'
  if (node.latency_pressure_status === 'critical') return 'danger'
  if (node.latency_pressure_status === 'waiting') return 'muted'
  if (node.status === 'warn') return 'warning'
  if (node.latency_pressure_status === 'watch') return 'warning'
  if ((node.cpu_percent ?? 0) >= 85) return 'warning'
  if ((node.memory_percent ?? 0) >= 85) return 'warning'
  if ((node.audio_latency_ms ?? 0) >= 10) return 'warning'
  return 'success'
}

export default NodeIdentityIcon
