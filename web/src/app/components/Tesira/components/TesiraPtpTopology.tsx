import React from 'react'
import { Renew } from '@carbon/icons-react'
import { Button, InlineNotification, Tag, Tile } from '@carbon/react'
import { useTesiraPtpTopology } from '../hooks/useTesiraApi'
import { LoadingState } from '../../shared/LoadingState'
import './TesiraCarbonChrome.css'

function ptpStateTag(state: string) {
  const normalized = state.toLowerCase()
  if (normalized.includes('master') || normalized.includes('slave') || normalized.includes('locked')) {
    return <Tag type="green" size="sm">{state}</Tag>
  }
  if (normalized.includes('listen') || normalized.includes('acquiring')) {
    return <Tag type="warm-gray" size="sm">{state}</Tag>
  }
  return <Tag type="red" size="sm">{state}</Tag>
}

export function TesiraPtpTopology() {
  const { data, error, isLoading: loading, refetch } = useTesiraPtpTopology()
  const topologyNodes = Array.isArray(data?.nodes) ? data.nodes : []

  return (
    <div className="tesira-ptp-topology">
      <Tile className="tesira-ptp-topology__tile">
        <div className="tesira-ptp-topology__header">
          <div>
            <p className="tesira-dashboard__eyebrow">PTP topology</p>
            <h3 className="tesira-dashboard__title">Fleet timing map</h3>
            <p className="tesira-dashboard__summary">
              Review node source, lock state, and offset to confirm the Tesira fleet is time-aligned before AVB routing or compile/deploy work.
            </p>
          </div>
          <div className="tesira-ptp-topology__actions">
            <Tag type="cool-gray" size="sm">{`${data?.node_count ?? 0} nodes`}</Tag>
            <Tag type="warm-gray" size="sm">{`${data?.grandmaster_ids.length ?? 0} grandmasters`}</Tag>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                refetch().catch(() => undefined)
              }}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="PTP topology unavailable"
            subtitle={(error as Error).message || 'Unable to read PTP topology from the Tesira fleet.'}
          />
        ) : null}

        {loading && !data ? (
          <div className="tesira-ptp-topology__loading">
            <LoadingState description="Loading PTP topology" />
          </div>
        ) : (
          <div className="tesira-ptp-topology__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira PTP topology">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Node</th>
                  <th scope="col">State</th>
                  <th scope="col">Offset (ns)</th>
                </tr>
              </thead>
              <tbody>
                {topologyNodes.map((node) => (
                  <tr key={node.device_id}>
                    <td>
                      <div className="tesira-ptp-topology__device-copy">
                        <span className="tesira-ptp-topology__device-name">{node.name || node.host}</span>
                        <span className="tesira-ptp-topology__device-meta">{node.host}</span>
                      </div>
                    </td>
                    <td>{node.source_node_id ?? 'local'}</td>
                    <td>{ptpStateTag(node.ptp_state)}</td>
                    <td>{node.offset_ns ?? '—'}</td>
                  </tr>
                ))}
                {topologyNodes.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <p className="tesira-presets-tab__empty">No topology data.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  )
}
