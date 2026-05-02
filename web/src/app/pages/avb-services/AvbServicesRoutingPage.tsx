/**
 * T2490-8 — AvbServicesRoutingPage.
 *
 * Operator-visible routing matrix. Pulls the canonical
 * `/api/avb/bindings/matrix?include_router=true` aggregation (T2490-2b
 * + T2490-3a) and renders source_type × consumer_type as a Carbon
 * Tile grid (small enough that a full HTML table is overkill;
 * highlights the live cell counts at a glance).
 */

import { useMemo } from 'react'
import {
  Heading,
  InlineNotification,
  Layer,
  Section,
  Tag,
} from '@carbon/react'

import {
  useAvbBindingsMatrix,
  type AvbMatrixCell,
} from './useAvbBindings'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'
import './AvbServicesRoutingPage.css'

const SOURCE_TYPES_ORDER = [
  'avdecc_talker',
  'avdecc_listener',
  'tesira_subscription',
  'engine_signal',
] as const

const CONSUMER_TYPES_ORDER = [
  'avdecc_stream',
  'tesira_preset',
  'tesira_block',
  'cluster_route',
  'srp_reservation',
] as const

interface MatrixGridCell {
  sourceType: string
  consumerType: string
  count: number
  enabled_count: number
}

function flattenMatrix(
  matrix: Record<string, Record<string, AvbMatrixCell>>,
): MatrixGridCell[] {
  // Compose the row × column ordering deterministically: known types
  // first (in the canonical order), then any unexpected types after,
  // alphabetically. This keeps the grid stable as new vocabularies are
  // added in T2490-3b+ without breaking existing layouts.
  const observedSources = new Set(Object.keys(matrix))
  const knownSources = SOURCE_TYPES_ORDER.filter((s) => observedSources.has(s))
  const extraSources = [...observedSources]
    .filter((s) => !SOURCE_TYPES_ORDER.includes(s as any))
    .sort()
  const sourceOrder = [...knownSources, ...extraSources]

  const observedConsumers = new Set<string>()
  for (const row of Object.values(matrix)) {
    for (const k of Object.keys(row)) observedConsumers.add(k)
  }
  const knownConsumers = CONSUMER_TYPES_ORDER.filter((c) =>
    observedConsumers.has(c),
  )
  const extraConsumers = [...observedConsumers]
    .filter((c) => !CONSUMER_TYPES_ORDER.includes(c as any))
    .sort()
  const consumerOrder = [...knownConsumers, ...extraConsumers]

  const cells: MatrixGridCell[] = []
  for (const s of sourceOrder) {
    for (const c of consumerOrder) {
      const cell = matrix[s]?.[c]
      cells.push({
        sourceType: s,
        consumerType: c,
        count: cell?.count ?? 0,
        enabled_count: cell?.enabled_count ?? 0,
      })
    }
  }
  return cells
}

export function AvbServicesRoutingPage() {
  useAvbServicesShellWindow(
    'Routing',
    'Talker × Listener cross-reference matrix sourced from the canonical AvbBindingAuthority.',
  )

  const matrixQuery = useAvbBindingsMatrix({ includeRouter: true })

  const matrix = matrixQuery.data?.matrix ?? {}
  const total = matrixQuery.data?.total_bindings ?? 0
  const cells = useMemo(() => flattenMatrix(matrix), [matrix])

  // Group cells back into rows (sourceType) for the visual grid.
  const rows = useMemo(() => {
    const grouped: Record<string, MatrixGridCell[]> = {}
    for (const c of cells) {
      ;(grouped[c.sourceType] = grouped[c.sourceType] ?? []).push(c)
    }
    return Object.entries(grouped)
  }, [cells])

  return (
    <Section className="avb-services-region" data-testid="avb-services-routing-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Routing</Heading>
          <p className="avb-services-region__subtitle">
            Source × consumer cross-reference matrix, aggregated server-side
            from the canonical <code>AvbBindingAuthority</code> via
            <code> /api/avb/bindings/matrix?include_router=true</code>.
          </p>
          <div>
            <Tag type="cool-gray">{total} total bindings</Tag>
            <Tag type="blue">5s poll</Tag>
          </div>
        </header>
      </Layer>

      {matrixQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load routing matrix"
          subtitle="Confirm the backend service is reachable on port 8080."
        />
      ) : null}

      <Layer level={1}>
        {rows.length === 0 ? (
          <div className="avb-services-region__placeholder">
            No bindings to render. Once T2490-3b starts writing live AvbRouter
            connections through the binding authority — or once an operator
            POSTs to <code>/api/avb/bindings</code> — cells will populate here
            with live counts.
          </div>
        ) : (
          <div className="avb-routing-matrix">
            {rows.map(([source, sourceCells]) => (
              <div key={source} className="avb-routing-matrix__row">
                <div className="avb-routing-matrix__row-label">{source}</div>
                <div className="avb-routing-matrix__row-cells">
                  {sourceCells.map((c) => {
                    const empty = c.count === 0
                    return (
                      <div
                        key={c.consumerType}
                        className={`avb-routing-matrix__cell${empty ? ' avb-routing-matrix__cell--empty' : ''}`}
                        title={`${c.sourceType} → ${c.consumerType}: ${c.count} bindings (${c.enabled_count} enabled)`}
                      >
                        <div className="avb-routing-matrix__cell-target">
                          {c.consumerType}
                        </div>
                        <div className="avb-routing-matrix__cell-count">
                          {c.count}
                        </div>
                        {c.enabled_count !== c.count ? (
                          <div className="avb-routing-matrix__cell-meta">
                            {c.enabled_count} on
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Layer>
    </Section>
  )
}

export default AvbServicesRoutingPage
