import {
  Button,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { useMemo, useState } from 'react'

import type { MidiClusterConnection, MidiClusterEndpoint } from '../../../map2/api'
import { useConnectMidiCluster, useDisconnectMidiCluster } from '../../hooks/useMidiCluster'
import './MidiClusterConnectionMatrix.css'

interface Props {
  endpoints: MidiClusterEndpoint[]
  connections: MidiClusterConnection[]
}

const transportOptions = [
  { value: 'rtp-midi', label: 'RTP-MIDI' },
  { value: 'http-mesh', label: 'HTTP Mesh' },
  { value: 'udp-raw', label: 'UDP Raw' },
] as const

type TransportValue = (typeof transportOptions)[number]['value']

function formatEndpointLabel(endpoint: MidiClusterEndpoint): string {
  return `${endpoint.node_id}: ${endpoint.port_name}`
}

function transportTagType(transport: string): 'blue' | 'teal' | 'purple' | 'gray' {
  if (transport === 'rtp-midi') return 'blue'
  if (transport === 'http-mesh') return 'teal'
  if (transport === 'udp-raw') return 'purple'
  return 'gray'
}

function transportLabel(transport: string): string {
  const match = transportOptions.find((option) => option.value === transport)
  return match?.label ?? transport
}

export function MidiClusterConnectionMatrix({ endpoints, connections }: Props) {
  const outputs = useMemo(() => endpoints.filter((endpoint) => endpoint.direction === 'output'), [endpoints])
  const inputs = useMemo(() => endpoints.filter((endpoint) => endpoint.direction === 'input'), [endpoints])

  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [transport, setTransport] = useState<TransportValue>('rtp-midi')

  const connect = useConnectMidiCluster()
  const disconnect = useDisconnectMidiCluster()
  const pendingUpdate = connect.isPending || disconnect.isPending

  const connectionKey = (src: string, dst: string) => `${src}=>${dst}`
  const active = useMemo(() => {
    const matrix = new Map<string, MidiClusterConnection>()
    connections.forEach((connection) => {
      matrix.set(connectionKey(connection.source.endpoint_id, connection.destination.endpoint_id), connection)
    })
    return matrix
  }, [connections])

  const selectedConnection =
    sourceId && destinationId ? active.get(connectionKey(sourceId, destinationId)) : undefined

  const handleToggle = (srcId: string, dstId: string) => {
    const key = connectionKey(srcId, dstId)
    const existing = active.get(key)
    if (existing) {
      void disconnect.mutateAsync(existing.connection_id)
      return
    }
    void connect.mutateAsync({ source_endpoint_id: srcId, destination_endpoint_id: dstId, transport })
  }

  return (
    <section className="midi-cluster-connection-matrix" aria-label="MIDI cluster connection matrix">
      <div className="midi-cluster-connection-matrix__controls">
        <Select
          id="midi-cluster-source-select"
          labelText="Output endpoint"
          size="sm"
          value={sourceId}
          onChange={(event) => setSourceId(event.currentTarget.value)}
        >
          <SelectItem value="" text="Select output endpoint" disabled hidden />
          {outputs.map((output) => (
            <SelectItem
              key={output.endpoint_id}
              value={output.endpoint_id}
              text={formatEndpointLabel(output)}
            />
          ))}
        </Select>

        <Select
          id="midi-cluster-destination-select"
          labelText="Input endpoint"
          size="sm"
          value={destinationId}
          onChange={(event) => setDestinationId(event.currentTarget.value)}
        >
          <SelectItem value="" text="Select input endpoint" disabled hidden />
          {inputs.map((input) => (
            <SelectItem
              key={input.endpoint_id}
              value={input.endpoint_id}
              text={formatEndpointLabel(input)}
            />
          ))}
        </Select>

        <Select
          id="midi-cluster-transport-select"
          labelText="Transport"
          size="sm"
          value={transport}
          onChange={(event) => setTransport(event.currentTarget.value as TransportValue)}
        >
          {transportOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} text={option.label} />
          ))}
        </Select>

        <Button
          kind={selectedConnection ? 'secondary' : 'primary'}
          size="sm"
          className="midi-cluster-connection-matrix__selection-action"
          disabled={!sourceId || !destinationId || pendingUpdate}
          onClick={() => handleToggle(sourceId, destinationId)}
        >
          {selectedConnection ? 'Disconnect selection' : 'Connect selection'}
        </Button>
      </div>

      {outputs.length === 0 || inputs.length === 0 ? (
        <div className="midi-cluster-connection-matrix__empty-table" role="status">
          No matrix endpoints detected yet. Connect at least one MIDI output and input to configure routing.
        </div>
      ) : (
        <div className="midi-cluster-connection-matrix__table-wrap">
          <TableContainer
            title="Connection matrix"
            description="Toggle links between each output and input endpoint."
          >
            <Table
              size="sm"
              useZebraStyles
              aria-label="MIDI cluster output to input connection matrix"
            >
              <TableHead>
                <TableRow>
                  <TableHeader className="midi-cluster-connection-matrix__column-header">
                    Output / Input
                  </TableHeader>
                  {inputs.map((input) => (
                    <TableHeader
                      key={input.endpoint_id}
                      className="midi-cluster-connection-matrix__column-header"
                    >
                      {formatEndpointLabel(input)}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {outputs.map((output) => (
                  <TableRow key={output.endpoint_id}>
                    <TableCell className="midi-cluster-connection-matrix__row-header">
                      {formatEndpointLabel(output)}
                    </TableCell>
                    {inputs.map((input) => {
                      const key = connectionKey(output.endpoint_id, input.endpoint_id)
                      const connection = active.get(key)

                      return (
                        <TableCell key={key}>
                          <div className="midi-cluster-connection-matrix__cell-actions">
                            <Button
                              kind={connection ? 'tertiary' : 'ghost'}
                              size="sm"
                              disabled={pendingUpdate}
                              onClick={() => handleToggle(output.endpoint_id, input.endpoint_id)}
                            >
                              {connection ? 'Disconnect' : 'Connect'}
                            </Button>
                            {connection ? (
                              <Tag size="sm" type={transportTagType(connection.transport)}>
                                {transportLabel(connection.transport)}
                              </Tag>
                            ) : (
                              <span className="midi-cluster-connection-matrix__empty-state">
                                Not connected
                              </span>
                            )}
                          </div>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </section>
  )
}

export default MidiClusterConnectionMatrix
