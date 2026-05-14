/**
 * T2521-6c — SonoBusPeersPage.
 *
 * Operator Peers workspace for /sonobus/peers. Read-only projection
 * derived from `/api/sonobus/peers` (aggregates bindings by listener).
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusPeers,
  type SonoBusPeerSummary,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

type CarbonTagTone = 'green' | 'red' | 'cool-gray' | 'warm-gray' | 'magenta'

function capabilityTone(cap: string | null): CarbonTagTone {
  switch (cap) {
    case 'map2':
      return 'green'
    case 'sonobus_native':
      return 'cool-gray'
    case 'aoo_native':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function PeerCard({ peer }: { peer: SonoBusPeerSummary }) {
  return (
    <Tile
      className="sonobus-overview__tile"
      data-testid={`sonobus-peer-${peer.peer_id}`}
    >
      <header className="sonobus-overview__tile-header">
        <h3 className="sonobus-overview__tile-title">
          {peer.listener_node_id || peer.listener_endpoint || peer.peer_id}
        </h3>
        <Tag type={capabilityTone(peer.listener_capability)} size="sm">
          {peer.listener_capability ?? '—'}
        </Tag>
      </header>
      <div className="sonobus-overview__kind-rows">
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Endpoint</span>
          <span>{peer.listener_endpoint ?? '—'}</span>
        </div>
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Bindings</span>
          <Tag type="cool-gray" size="sm">
            {`${peer.enabled_binding_count} / ${peer.binding_count}`}
          </Tag>
        </div>
      </div>
    </Tile>
  )
}

export function SonoBusPeersPage() {
  const peers = useSonoBusPeers()
  const peerList = peers.data ?? []

  return (
    <Section className="sonobus-overview" data-testid="sonobus-peers-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Peers</Heading>
          <p className="sonobus-overview__subtitle">
            Peer view derived from the SonoBus binding authority. Each
            unique listener (node, endpoint, capability) is a peer.
            Live mDNS discovery + connection-server peer cache land
            with the T2521-4 daemon.
          </p>
          {peers.isError && (
            <Tag type="red" size="sm">
              Peers query failed
            </Tag>
          )}
          {peers.isLoading && (
            <Tag type="cool-gray" size="sm">
              Loading…
            </Tag>
          )}
        </header>
      </Layer>

      <Layer level={1}>
        <div className="sonobus-overview__tiles" data-testid="sonobus-peers-grid">
          {peerList.length === 0 ? (
            <Tile
              className="sonobus-overview__tile"
              data-testid="sonobus-peers-empty"
            >
              <p className="sonobus-overview__tile-body">
                No peers yet. Once one or more SonoBus bindings are
                created with a listener, they will appear here.
              </p>
            </Tile>
          ) : (
            peerList.map((p) => <PeerCard key={p.peer_id} peer={p} />)
          )}
        </div>
      </Layer>
    </Section>
  )
}

export default SonoBusPeersPage
