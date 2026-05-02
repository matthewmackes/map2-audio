/**
 * T2482 loop 12 / iter 118 — /midi/routing matrix page.
 *
 * Replaces the iter-107 30-line scaffold. Real source_type ×
 * consumer_type matrix rendering bound to useRoutingMatrix (iter 117).
 *
 * Per the iter-111 plan D5: cells click through to
 * /midi/bindings?consumer_type=X (the iter-103 list page URL-syncs
 * this and pre-selects the consumer-strategy filter automatically).
 *
 * Per D6: Carbon-only.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heading,
  InlineNotification,
  Layer,
  Section,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'

import {
  BINDING_CONSUMER_TYPES,
  BINDING_SOURCE_TYPES,
  type BindingConsumerType,
  type BindingSourceType,
} from '../../../map2/clients/midiBindings'
import { useRoutingMatrix, type RoutingMatrixCell } from './useRoutingMatrix'
import { usePeerMatrix } from './usePeerMatrix'
import { PeerCellDrillDownDrawer } from './PeerCellDrillDownDrawer'
import './MidiServicesRoutingPage.css'

function cellTone(cell: RoutingMatrixCell): 'green' | 'cool-gray' | 'warm-gray' {
  if (cell.count === 0) return 'warm-gray'
  if (cell.enabledCount === cell.count) return 'green'
  return 'cool-gray'
}

function cellLabel(cell: RoutingMatrixCell): string {
  if (cell.count === 0) return '·'
  if (cell.enabledCount === cell.count) return String(cell.count)
  return `${cell.enabledCount}/${cell.count}`
}

export function MidiServicesRoutingPage() {
  const { matrix, rowTotals, colTotals, totalBindings, isLoading, isError } = useRoutingMatrix()
  const peerMatrix = usePeerMatrix()
  const navigate = useNavigate()
  // T2484-3 iter 192 — drill-down drawer state.
  const [drillDown, setDrillDown] = useState<{
    sourceType: BindingSourceType
    consumerType: BindingConsumerType
  } | null>(null)

  const goToCell = (sourceType: BindingSourceType, consumerType: BindingConsumerType) => {
    // T2483-4B iter 157 — preserve source_type so the iter-103 list page
    // pre-narrows by the matrix-cell's source.
    navigate(
      `/midi/bindings?consumer_type=${encodeURIComponent(consumerType)}&source_type=${encodeURIComponent(sourceType)}`,
    )
  }

  const goToColumn = (consumerType: BindingConsumerType) => {
    navigate(`/midi/bindings?consumer_type=${encodeURIComponent(consumerType)}`)
  }

  return (
    <Section className="midi-services-routing">
      <Layer level={0}>
        <header className="midi-services-routing__header">
          <Heading className="midi-services-routing__title">Routing</Heading>
          <p className="midi-services-routing__subtitle">
            Source type × consumer type matrix of every MIDI binding in the
            canonical authority. Click a cell to filter the Bindings page by
            that consumer type. Cell counts are <strong>enabled / total</strong>{' '}
            when a row mixes states, just <strong>count</strong> when all
            bindings in the cell are enabled.
          </p>
        </header>
      </Layer>

      {isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load routing matrix"
          subtitle="One or more /api/midi/bindings consumer-type queries returned an error. The matrix may be partially populated."
        />
      ) : null}

      <Layer level={1}>
        <TableContainer
          title=""
          description={
            isLoading
              ? 'Loading routing matrix…'
              : `${totalBindings} binding${totalBindings === 1 ? '' : 's'} across ${BINDING_SOURCE_TYPES.length} source types and ${BINDING_CONSUMER_TYPES.length} consumer types`
          }
        >
          <Table size="md" useStaticWidth>
            <TableHead>
              <TableRow>
                <TableHeader className="midi-services-routing__corner">
                  source ↓ / consumer →
                </TableHeader>
                {BINDING_CONSUMER_TYPES.map((cons) => (
                  <TableHeader
                    key={cons}
                    className="midi-services-routing__col-header"
                    onClick={() => goToColumn(cons)}
                    title={`Open Bindings filtered by ${cons} (${colTotals[cons] ?? 0} bindings)`}
                  >
                    {cons}
                  </TableHeader>
                ))}
                <TableHeader className="midi-services-routing__row-total">
                  Σ
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {BINDING_SOURCE_TYPES.map((src) => (
                <TableRow key={src}>
                  <TableCell className="midi-services-routing__row-header">
                    {src}
                  </TableCell>
                  {BINDING_CONSUMER_TYPES.map((cons) => {
                    const cell = matrix[src]?.[cons] ?? { count: 0, enabledCount: 0 }
                    const isClickable = cell.count > 0
                    const peerCount = peerMatrix.peers[src]?.[cons] ?? 0
                    return (
                      <TableCell
                        key={cons}
                        className={`midi-services-routing__cell${isClickable ? ' midi-services-routing__cell--clickable' : ''}`}
                        onClick={() => {
                          if (isClickable) goToCell(src, cons)
                        }}
                        title={
                          isClickable
                            ? `${cell.enabledCount}/${cell.count} enabled${peerCount > 0 ? ` + ${peerCount} on peers` : ''}. Open Bindings filtered by ${cons}.`
                            : 'No bindings'
                        }
                      >
                        <Tag type={cellTone(cell)} size="sm">
                          {cellLabel(cell)}
                        </Tag>
                        {peerCount > 0 ? (
                          <button
                            type="button"
                            className="midi-services-routing__peer-badge-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDrillDown({ sourceType: src, consumerType: cons })
                            }}
                            aria-label={`Show peer breakdown for ${src} → ${cons}`}
                          >
                            <Tag
                              type="purple"
                              size="sm"
                              className="midi-services-routing__peer-badge"
                            >
                              +{peerCount}
                            </Tag>
                          </button>
                        ) : null}
                      </TableCell>
                    )
                  })}
                  <TableCell className="midi-services-routing__row-total">
                    <Tag type="cool-gray" size="sm">{rowTotals[src] ?? 0}</Tag>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Layer>

      <PeerCellDrillDownDrawer
        open={drillDown !== null}
        onClose={() => setDrillDown(null)}
        sourceType={drillDown?.sourceType ?? null}
        consumerType={drillDown?.consumerType ?? null}
        peerSlices={peerMatrix.peerSlices}
      />
    </Section>
  )
}

export default MidiServicesRoutingPage
