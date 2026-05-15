/**
 * T2521-7 — SonoBusRoutingPage.
 *
 * Talker × Listener routing matrix mirror of `/avb/routing`. Aggregates
 * the canonical SonoBus binding list by `(talker_node_id,
 * listener_node_id)` so the operator can see which peer pairs have
 * active streams routed over the AOO transport.
 *
 * Read-only in this slice; the cell-click writer + drag-route editor
 * land alongside the daemon (T2521-4). Until then the page surfaces
 * the existing authority projection so a snapshot publish, manual
 * binding create, or cluster sync immediately shows up here.
 */

import { Heading, Layer, Section, Tag, Tile } from '@carbon/react'
import { useMemo } from 'react'

import {
  useSonoBusBindings,
  type SonoBusBindingRecord,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

interface RoutingMatrixCell {
  talker: string
  listener: string
  bindings: SonoBusBindingRecord[]
}

function aggregateBindings(
  bindings: SonoBusBindingRecord[],
): {
  talkers: string[]
  listeners: string[]
  cells: Map<string, RoutingMatrixCell>
} {
  const talkers = new Set<string>()
  const listeners = new Set<string>()
  const cells = new Map<string, RoutingMatrixCell>()
  for (const binding of bindings) {
    const talker = binding.talker_node_id ?? '—'
    const listener = binding.listener_node_id ?? '—'
    talkers.add(talker)
    listeners.add(listener)
    const key = `${talker}::${listener}`
    const cell = cells.get(key) ?? { talker, listener, bindings: [] }
    cell.bindings.push(binding)
    cells.set(key, cell)
  }
  return {
    talkers: Array.from(talkers).sort(),
    listeners: Array.from(listeners).sort(),
    cells,
  }
}

function cellTone(cell: RoutingMatrixCell | undefined): 'green' | 'cool-gray' | 'red' {
  if (!cell || cell.bindings.length === 0) return 'cool-gray'
  const enabled = cell.bindings.some((b) => b.enabled)
  if (!enabled) return 'red'
  return 'green'
}

export function SonoBusRoutingPage() {
  const query = useSonoBusBindings()
  const bindings = query.data ?? []
  const { talkers, listeners, cells } = useMemo(
    () => aggregateBindings(bindings),
    [bindings],
  )

  return (
    <Section className="sonobus-overview" data-testid="sonobus-routing-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Routing</Heading>
          <p className="sonobus-overview__subtitle">
            Talker × Listener matrix derived from the SonoBus binding
            authority. Cell tone reflects the enabled state of every
            binding in the pair: green = at least one enabled stream,
            red = all disabled, gray = none. Drag-route editing
            lands with T2521-4.
          </p>
          {query.isError ? (
            <Tag type="red" size="sm">Bindings query failed</Tag>
          ) : null}
          {query.isLoading ? (
            <Tag type="cool-gray" size="sm">Loading…</Tag>
          ) : null}
        </header>
      </Layer>
      <Layer level={1}>
        {bindings.length === 0 ? (
          <Tile className="sonobus-overview__tile" data-testid="sonobus-routing-empty">
            <p className="sonobus-overview__tile-body">
              No SonoBus bindings have a talker/listener pair yet.
              Publish a snapshot with a SonoBus interface assignment,
              or POST to <code>/api/sonobus/bindings</code> to seed one.
            </p>
          </Tile>
        ) : (
          <div className="sonobus-routing__matrix" data-testid="sonobus-routing-matrix">
            <table className="sonobus-routing__table">
              <thead>
                <tr>
                  <th scope="col" className="sonobus-routing__corner">
                    Talker ↓ / Listener →
                  </th>
                  {listeners.map((listener) => (
                    <th key={listener} scope="col" className="sonobus-routing__listener">
                      {listener}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {talkers.map((talker) => (
                  <tr key={talker}>
                    <th scope="row" className="sonobus-routing__talker">
                      {talker}
                    </th>
                    {listeners.map((listener) => {
                      const cell = cells.get(`${talker}::${listener}`)
                      const count = cell?.bindings.length ?? 0
                      const enabledCount = cell?.bindings.filter((b) => b.enabled).length ?? 0
                      return (
                        <td
                          key={listener}
                          className="sonobus-routing__cell"
                          data-testid={`sonobus-routing-cell-${talker}-${listener}`}
                        >
                          {count === 0 ? (
                            <span className="sonobus-routing__cell-empty">—</span>
                          ) : (
                            <Tag type={cellTone(cell)} size="sm">
                              {`${enabledCount}/${count}`}
                            </Tag>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Layer>
    </Section>
  )
}

export default SonoBusRoutingPage
