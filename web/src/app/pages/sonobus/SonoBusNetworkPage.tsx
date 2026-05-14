/**
 * T2521-6c — SonoBusNetworkPage.
 *
 * Operator Network workspace for /sonobus/network. Live runtime
 * fields (bind interface, NAT/STUN state, mDNS state, connection
 * server lifecycle) land with the T2521-4 daemon; this page surfaces
 * what `/api/sonobus/status` already exposes plus the Q3 + Q15 + Q17
 * locked-decision context.
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import { useSonoBusStatus } from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

export function SonoBusNetworkPage() {
  const status = useSonoBusStatus()
  const data = status.data

  return (
    <Section className="sonobus-overview" data-testid="sonobus-network-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Network</Heading>
          <p className="sonobus-overview__subtitle">
            Bind interfaces, UDP ports, mDNS state, and the
            MAP2-hosted connection-server lifecycle. Live values land
            with the T2521-4 daemon; locked-decision context is shown
            now.
          </p>
          {status.isError && (
            <Tag type="red" size="sm">
              Status query failed
            </Tag>
          )}
        </header>
      </Layer>

      <Layer level={1}>
        <div className="sonobus-overview__tiles">
          <Tile className="sonobus-overview__tile" data-testid="sonobus-net-server-tile">
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Connection server</h3>
              <Tag
                type={
                  data?.connection_server_enabled
                    ? data?.connection_server_running
                      ? 'green'
                      : 'warm-gray'
                    : 'cool-gray'
                }
                size="sm"
              >
                {!data?.connection_server_enabled
                  ? 'Disabled'
                  : data?.connection_server_running
                    ? 'Running'
                    : 'Stopped'}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Q3 default: MAP2 hosts its own AOO/SonoBus connection
              server. Set <code>MAP2_SONOBUS_CONNECTION_SERVER=0</code>
              in <code>/etc/map2/sonobus.env</code> to disable.
            </p>
          </Tile>

          <Tile className="sonobus-overview__tile" data-testid="sonobus-net-ports-tile">
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">UDP ports</h3>
              <Tag type="cool-gray" size="sm">
                10000–10100
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Default port range used by the AOO source/sink runtime.
              Firewalld zone fragment at
              <code> /etc/firewalld/services/map2-sonobus.xml</code>
              opens the same range.
            </p>
          </Tile>

          <Tile className="sonobus-overview__tile" data-testid="sonobus-net-mdns-tile">
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">mDNS discovery</h3>
              <Tag type="cool-gray" size="sm">
                Q17
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Cluster/node negotiation mirrors AVB: mDNS peer discovery,
              cluster peer matrix, per-node transport capabilities, and
              authority-backed bindings. Live state ships in T2521-4.
            </p>
          </Tile>

          <Tile className="sonobus-overview__tile" data-testid="sonobus-net-defaults-tile">
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Defaults</h3>
              <Tag type="cool-gray" size="sm">
                Q1 / Q15 / Q18
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Default-on (Q15), AVB-preferred fallback (Q18), MAP2-owned
              AOO daemon (Q1). The systemd unit
              <code> map2-sonobus-transport.service</code> reads these
              from its <code>EnvironmentFile=</code> chain.
            </p>
          </Tile>
        </div>
      </Layer>
    </Section>
  )
}

export default SonoBusNetworkPage
