/**
 * T2521-6c — SonoBusDiagnosticsPage.
 *
 * Operator Diagnostics workspace for /sonobus/diagnostics. Real-time
 * per-binding metrics (RTT, loss%, jitter ms, resends/s, observed
 * latency, packet-loss sparkline) land with the T2521-4 daemon's
 * metrics endpoint. Until then the page surfaces authority-side
 * state + the locked validation gates from
 * docs/architecture/SONOBUS_AOO_TRANSPORT.md §7.
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusStatus,
  useSonoBusBindingsMatrix,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

const VALIDATION_GATES: Array<{ label: string; criterion: string }> = [
  {
    label: 'Two-node LAN PCM 24-bit / 48 kHz',
    criterion: '< 8 ms one-way at 0% loss; 0 xruns over 10 min',
  },
  {
    label: 'Impairment: 0.1% loss + 2 ms jitter',
    criterion: '< 15 ms one-way (adaptive jitter); < 1 audible dropout / min',
  },
  {
    label: 'Impairment: 1% loss + 5 ms jitter',
    criterion: '< 30 ms one-way; documented dropout rate',
  },
  {
    label: 'Cluster matrix fan-out',
    criterion: 'All peers respond < 2 s with timeout enforcement',
  },
  {
    label: 'Recorder exclusion regression (Q12)',
    criterion: 'All recorder code paths reject sonobus: IDs with 422',
  },
]

export function SonoBusDiagnosticsPage() {
  const status = useSonoBusStatus()
  const matrix = useSonoBusBindingsMatrix()

  const authorityTone = status.data?.authority_ok ? 'green' : 'red'
  const daemonTone = status.data?.daemon_running ? 'green' : 'warm-gray'

  return (
    <Section className="sonobus-overview" data-testid="sonobus-diagnostics-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Diagnostics</Heading>
          <p className="sonobus-overview__subtitle">
            Authority + daemon + validation-gate snapshot. Per-binding
            live metrics (RTT, loss%, jitter, resends/s) ship with the
            T2521-4 daemon's metrics endpoint.
          </p>
        </header>
      </Layer>

      <Layer level={1}>
        <div className="sonobus-overview__tiles">
          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-diag-authority-tile"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Authority</h3>
              <Tag type={authorityTone} size="sm">
                {status.data?.authority_ok ? 'OK' : 'Error'}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              {status.data?.binding_count ?? 0} bindings ·{' '}
              {status.data?.enabled_binding_count ?? 0} enabled · table_present={' '}
              {String(status.data?.table_present ?? false)}
            </p>
          </Tile>

          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-diag-daemon-tile"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Daemon</h3>
              <Tag type={daemonTone} size="sm">
                {status.data?.daemon_running ? 'Running' : 'Stopped'}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              <code>map2-sonobus-transport</code> · endpoint{' '}
              {status.data?.daemon_endpoint ?? '—'}. T2521-4 delivers
              the binary.
            </p>
          </Tile>

          <Tile
            className="sonobus-overview__tile"
            data-testid="sonobus-diag-matrix-tile"
          >
            <header className="sonobus-overview__tile-header">
              <h3 className="sonobus-overview__tile-title">Matrix</h3>
              <Tag type="cool-gray" size="sm">
                {matrix.data?.total_bindings ?? 0}
              </Tag>
            </header>
            <p className="sonobus-overview__tile-body">
              Server-side aggregation feeding{' '}
              <code>/sonobus/connections</code> and the cluster matrix
              endpoint. 5 s poll.
            </p>
          </Tile>
        </div>
      </Layer>

      <Layer level={1}>
        <Tile
          className="sonobus-overview__tile"
          data-testid="sonobus-diag-validation-tile"
        >
          <h3 className="sonobus-overview__tile-title">Validation gates</h3>
          <p className="sonobus-overview__tile-body">
            Targets locked in <code>SONOBUS_AOO_TRANSPORT.md §7</code>.
            T2521-10 ships the actual soak run.
          </p>
          <div className="sonobus-overview__kind-rows">
            {VALIDATION_GATES.map((gate) => (
              <div
                key={gate.label}
                className="sonobus-overview__row"
                data-testid={`sonobus-diag-gate-${gate.label}`}
              >
                <span className="sonobus-overview__label">{gate.label}</span>
                <Tag type="cool-gray" size="sm">
                  {gate.criterion}
                </Tag>
              </div>
            ))}
          </div>
        </Tile>
      </Layer>
    </Section>
  )
}

export default SonoBusDiagnosticsPage
