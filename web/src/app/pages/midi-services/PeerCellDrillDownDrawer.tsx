/**
 * T2484 loop 20 / iter 191 — PeerCellDrillDownDrawer (T2484-3).
 *
 * Carbon Modal that opens when an operator clicks the iter-187 +N
 * peer badge on a routing matrix cell. Lists which peer node has
 * which count for that (source_type, consumer_type) pair.
 *
 * Per the iter-181 plan D4: drawer is read-only. Each peer row links
 * to the per-node Bindings page via the existing /api/node/{id}/proxy
 * pattern; no inline mutation in the drawer.
 *
 * Iter 197 (T2484-4) extends each peer row with a health Tag.
 */

import { Modal, Tag } from '@carbon/react'

import type {
  BindingConsumerType,
  BindingSourceType,
  ClusterPeerMatrix,
} from '../../../map2/clients/midiBindings'

function healthTone(health: string): 'green' | 'magenta' | 'red' | 'gray' {
  switch (health) {
    case 'ok':
      return 'green'
    case 'warn':
      return 'magenta'
    case 'critical':
      return 'red'
    case 'offline':
    default:
      return 'gray'
  }
}

interface PeerCellDrillDownDrawerProps {
  open: boolean
  onClose: () => void
  /** The (source, consumer) cell whose per-peer breakdown to show. */
  sourceType: BindingSourceType | null
  consumerType: BindingConsumerType | null
  /** Cluster peer slices from the iter-185 useRoutingMatrix sibling
   *  hook (usePeerMatrix's underlying data is aggregated; the page
   *  passes the un-aggregated slices in here for the breakdown).
   */
  peerSlices: ClusterPeerMatrix[]
}

interface PeerRow {
  node_id: string
  hostname: string
  count: number
  enabled_count: number
  health: string
}

function rowsForCell(
  peers: ClusterPeerMatrix[],
  sourceType: BindingSourceType | null,
  consumerType: BindingConsumerType | null,
): PeerRow[] {
  if (!sourceType || !consumerType) return []
  const rows: PeerRow[] = []
  for (const peer of peers) {
    const cell = peer.matrix[sourceType]?.[consumerType]
    if (cell && cell.count > 0) {
      rows.push({
        node_id: peer.node_id,
        hostname: peer.hostname,
        count: cell.count,
        enabled_count: cell.enabled_count,
        health: peer.health ?? 'offline',
      })
    }
  }
  rows.sort((a, b) => b.count - a.count)
  return rows
}

export function PeerCellDrillDownDrawer({
  open,
  onClose,
  sourceType,
  consumerType,
  peerSlices,
}: PeerCellDrillDownDrawerProps) {
  const rows = rowsForCell(peerSlices, sourceType, consumerType)
  const heading =
    sourceType && consumerType
      ? `${sourceType} → ${consumerType} on cluster peers`
      : 'Peer breakdown'

  return (
    <Modal
      open={open}
      modalHeading={heading}
      modalLabel="Routing matrix"
      passiveModal
      onRequestClose={onClose}
      size="sm"
    >
      <div className="midi-services-routing__peer-drawer">
        {rows.length === 0 ? (
          <p className="midi-services-routing__peer-drawer-empty">
            No peers carry bindings for this cell.
          </p>
        ) : (
          <table className="midi-services-routing__peer-drawer-table">
            <thead>
              <tr>
                <th>Peer</th>
                <th>Health</th>
                <th>Bindings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.node_id} data-testid={`peer-row-${row.node_id}`}>
                  <td>
                    <div className="midi-services-routing__peer-name">
                      {row.hostname}
                    </div>
                    <div className="midi-services-routing__peer-id">
                      {row.node_id}
                    </div>
                  </td>
                  <td>
                    <Tag type={healthTone(row.health)} size="sm">
                      {row.health}
                    </Tag>
                  </td>
                  <td>
                    {row.count === row.enabled_count
                      ? row.count
                      : `${row.enabled_count}/${row.count}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}

export default PeerCellDrillDownDrawer
