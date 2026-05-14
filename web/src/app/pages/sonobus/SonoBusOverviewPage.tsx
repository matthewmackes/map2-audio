/**
 * T2521-6 — SonoBusOverviewPage.
 *
 * First page of the `/sonobus` Carbon workspace. Stand-alone for the
 * T2521-6 first slice — the full AVB-template shell (`SonoBusServicesShell`)
 * with multi-tab navigation lands in a later cycle. This page is
 * shape-compatible with `AvbServicesOverviewPage`: status header tag,
 * binding-count tile, daemon-state tile, transport-priority tile.
 *
 * Live data sources:
 *   - `/api/sonobus/status` (5s poll) — authority + daemon + connection
 *     server + transport-priority defaults.
 *   - `/api/sonobus/bindings/count` (5s poll) — total durable bindings.
 *   - `/api/sonobus/bindings/matrix` (5s poll) — binding_kind ×
 *     consumer_type aggregation for the kind-breakdown row.
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusBindingsCount,
  useSonoBusBindingsMatrix,
  useSonoBusStatus,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

type Tone = 'green' | 'red' | 'warm-gray' | 'cool-gray' | 'gray'

function daemonTone(running: boolean, authority_ok: boolean): Tone {
  if (!authority_ok) return 'red'
  return running ? 'green' : 'warm-gray'
}

function connectionServerTone(
  enabled: boolean,
  running: boolean,
): Tone {
  if (!enabled) return 'cool-gray'
  return running ? 'green' : 'warm-gray'
}

function bindingsTone(count: number): Tone {
  return count > 0 ? 'green' : 'gray'
}

interface TileRowProps {
  label: string
  value: string
  tone: Tone
  testId?: string
}

function TileRow({ label, value, tone, testId }: TileRowProps) {
  return (
    <div className="sonobus-overview__row" data-testid={testId}>
      <span className="sonobus-overview__label">{label}</span>
      <Tag type={tone} size="sm">
        {value}
      </Tag>
    </div>
  )
}

export function SonoBusOverviewPage() {
  const status = useSonoBusStatus()
  const bindingsCount = useSonoBusBindingsCount()
  const matrix = useSonoBusBindingsMatrix()

  const statusData = status.data
  const isStatusLoading = status.isLoading
  const isStatusError = status.isError

  const totalBindings = bindingsCount.data ?? statusData?.binding_count ?? 0
  const enabledBindings = statusData?.enabled_binding_count ?? 0

  const daemonRunning = statusData?.daemon_running ?? false
  const authorityOk = statusData?.authority_ok ?? false
  const connServerEnabled = statusData?.connection_server_enabled ?? true
  const connServerRunning = statusData?.connection_server_running ?? false
  const defaultPriority =
    statusData?.default_transport_priority ?? 'avb_preferred'

  const matrixData = matrix.data
  const kindCounts: Record<string, number> = {
    peer: 0,
    group: 0,
    stream: 0,
    client_session: 0,
  }
  if (matrixData) {
    for (const [kind, byConsumer] of Object.entries(matrixData.matrix)) {
      let total = 0
      for (const cell of Object.values(byConsumer)) total += cell.count
      kindCounts[kind] = total
    }
  }

  return (
    <Section className="sonobus-overview" data-testid="sonobus-overview-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus</Heading>
          <p className="sonobus-overview__subtitle">
            Remote-audio transport over AOO (BSD-3). MAP2-to-MAP2 first;
            non-MAP2 SonoBus clients tolerated as degraded peers. AVB is
            preferred automatically — SonoBus serves as fallback or
            standalone for paths AVB cannot cover.
          </p>
          {isStatusLoading && (
            <Tag type="cool-gray" size="sm">
              Loading…
            </Tag>
          )}
          {isStatusError && (
            <Tag type="red" size="sm">
              Status unavailable
            </Tag>
          )}
        </header>
      </Layer>

      <Layer level={1}>
        <div className="sonobus-overview__tiles">
          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-overview-tile-bindings"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Bindings</h3>
              <Tag type={bindingsTone(totalBindings)} size="sm">
                {bindingsCount.isError ? '—' : String(totalBindings)}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Total durable SonoBus bindings; {enabledBindings} enabled.
              Breakdown:
            </p>
            <div className="sonobus-overview__kind-rows">
              <TileRow
                label="Peers"
                value={String(kindCounts.peer)}
                tone={kindCounts.peer > 0 ? 'green' : 'gray'}
                testId="sonobus-kind-peers"
              />
              <TileRow
                label="Groups"
                value={String(kindCounts.group)}
                tone={kindCounts.group > 0 ? 'green' : 'gray'}
                testId="sonobus-kind-groups"
              />
              <TileRow
                label="Streams"
                value={String(kindCounts.stream)}
                tone={kindCounts.stream > 0 ? 'green' : 'gray'}
                testId="sonobus-kind-streams"
              />
              <TileRow
                label="Client sessions"
                value={String(kindCounts.client_session)}
                tone={kindCounts.client_session > 0 ? 'green' : 'gray'}
                testId="sonobus-kind-clients"
              />
            </div>
          </Tile>

          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-overview-tile-daemon"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Daemon</h3>
              <Tag type={daemonTone(daemonRunning, authorityOk)} size="sm">
                {!authorityOk
                  ? 'Authority error'
                  : daemonRunning
                    ? 'Running'
                    : 'Stopped'}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              <strong>map2-sonobus-transport</strong> handles AOO source/sink
              instances and the JACK port handoff. T2521-4 ships the
              binary; until then this tile reads as Stopped.
            </p>
          </Tile>

          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-overview-tile-server"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Connection server</h3>
              <Tag
                type={connectionServerTone(connServerEnabled, connServerRunning)}
                size="sm"
              >
                {!connServerEnabled
                  ? 'Disabled'
                  : connServerRunning
                    ? 'Running'
                    : 'Stopped'}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Self-hosted AOO/SonoBus connection server (Q3 default:
              enabled). Optional once peers are discovered via mDNS or
              cached hole-punch state.
            </p>
          </Tile>

          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-overview-tile-priority"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Transport priority</h3>
              <Tag type="cool-gray" size="sm">
                {defaultPriority.replace('_', ' ')}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Default per-binding routing posture (Q18). AVB wins
              automatically when both transports can carry the same
              intent. Pin a binding to <code>sonobus_preferred</code> or
              <code>sonobus_only</code> per-row to override.
            </p>
          </Tile>
        </div>
      </Layer>
    </Section>
  )
}

export default SonoBusOverviewPage
