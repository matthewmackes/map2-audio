import React from 'react'
import { Launch } from '@carbon/icons-react'
import { Button, Tag, Tile } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { useTesiraAvbStreams, useTesiraPTP } from '../hooks/useTesiraApi'
import { buildAvbRoutingWorkspaceHref } from '../../AvbRouting/avbRoutingWorkspaceHref'
import './TesiraCarbonChrome.css'

interface TesiraAvbTabProps {
  deviceId: string
}

function ptpTagType(state: string | null | undefined): 'red' | 'green' | 'cool-gray' {
  if (state === 'MASTER') return 'red'
  if (state === 'SLAVE') return 'green'
  return 'cool-gray'
}

export function TesiraAvbTab({ deviceId }: TesiraAvbTabProps) {
  const navigate = useNavigate()
  const { data: streams } = useTesiraAvbStreams(deviceId)
  const { data: ptp } = useTesiraPTP(deviceId)

  return (
    <div className="tesira-avb-tab">
      {ptp ? (
        <Tile className="tesira-avb-tab__tile">
          <div className="tesira-avb-tab__header">
            <div>
              <p className="tesira-dashboard__eyebrow">PTP status</p>
              <h3 className="tesira-dashboard__title">Clock state and grandmaster visibility</h3>
              <p className="tesira-dashboard__summary">
                Use this view to confirm whether the Tesira unit is the PTP master, a slave, or still unaligned before opening AVB routing.
              </p>
            </div>
            <div className="tesira-avb-tab__tags">
              <Tag type={ptpTagType(ptp.state ?? null)} size="sm">
                {`State ${ptp.state ?? 'unknown'}`}
              </Tag>
              {ptp.offset_ns != null ? <Tag type="cool-gray" size="sm">{`Offset ${ptp.offset_ns} ns`}</Tag> : null}
              {ptp.grandmaster_id ? <Tag type="blue" size="sm">{`GM ${ptp.grandmaster_id}`}</Tag> : null}
            </div>
          </div>
        </Tile>
      ) : null}

      <Tile className="tesira-avb-tab__tile">
        <div className="tesira-avb-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">AVB streams</p>
            <h3 className="tesira-dashboard__title">Inspect routable streams from this unit</h3>
            <p className="tesira-dashboard__summary">
              Review talker and listener streams before jumping into the shared AVB routing page with the selected Tesira entity in focus.
            </p>
          </div>
          <div className="tesira-avb-tab__tags">
            <Tag type="cool-gray" size="sm">{`${streams?.length ?? 0} streams`}</Tag>
          </div>
        </div>

        {!streams || streams.length === 0 ? (
          <p className="tesira-presets-tab__empty">No AVB streams discovered.</p>
        ) : (
          <div className="tesira-avb-tab__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira AVB streams">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Name</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Entity ID</th>
                  <th scope="col">Health</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((stream) => (
                  <tr key={`${stream.stream_index}-${stream.direction}`}>
                    <td>{stream.stream_index}</td>
                    <td>{stream.name}</td>
                    <td>
                      <Tag type={stream.direction === 'talker' ? 'blue' : 'teal'} size="sm">
                        {stream.direction}
                      </Tag>
                    </td>
                    <td>{stream.channels}</td>
                    <td>{stream.entity_id ? `${stream.entity_id.substring(0, 12)}…` : '—'}</td>
                    <td>
                      <Tag type={stream.entity_id ? 'green' : 'cool-gray'} size="sm">
                        {stream.entity_id ? 'Ready' : 'Unknown'}
                      </Tag>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        kind="ghost"
                        renderIcon={Launch}
                        onClick={() => navigate(buildAvbRoutingWorkspaceHref({
                          tesiraDeviceId: deviceId,
                          entityId: stream.entity_id || null,
                        }))}
                      >
                        Route
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  )
}
