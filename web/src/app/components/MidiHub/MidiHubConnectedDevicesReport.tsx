import { useState } from 'react'
import {
  DataTable,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import type { MidiHubRoute } from '../../../map2/api'
import type { HubPort } from './portUtils'
import { isUnknownDevicePort } from './portUtils'
import { MidiHubSurface } from './MidiHubHelpPrimitives'
import {
  DevicePackGeneratorModal,
  type DevicePackGeneratorTriggerDevice,
} from '../DevicePackGenerator/DevicePackGeneratorModal'

type MidiHubConnectedDevicesReportProps = {
  ports: HubPort[]
  routes: MidiHubRoute[]
  clockOutputPorts?: string[]
}

type DeviceReportRow = {
  id: string
  device: string
  direction: string
  kind: string
  status: string
  application: string
  unknown: boolean
  vendor_id?: string
  product_id?: string
}

const HEADERS = [
  { key: 'device', header: 'Device' },
  { key: 'direction', header: 'Direction' },
  { key: 'kind', header: 'Kind' },
  { key: 'status', header: 'Status' },
  { key: 'application', header: 'Application' },
] as const

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summarizePortNames(portNames: string[]): string {
  if (portNames.length === 0) return 'none'
  if (portNames.length <= 2) return portNames.join(', ')
  return `${portNames.slice(0, 2).join(', ')} +${portNames.length - 2} more`
}

function uniquePortNames(portIds: string[], portsById: Map<string, HubPort>): string[] {
  return [...new Set(portIds.map((portId) => portsById.get(portId)?.name ?? portId))]
}

function statusTagType(status: string): 'green' | 'blue' | 'warm-gray' {
  if (status === 'Applied') return 'green'
  if (status === 'Configured') return 'blue'
  return 'warm-gray'
}

export function MidiHubConnectedDevicesReport({
  ports,
  routes,
  clockOutputPorts = [],
}: MidiHubConnectedDevicesReportProps) {
  // T2492-2 — wizard pre-population state for "Unknown device" Tag
  // clicks. The Tag renders inline next to the device name; clicking
  // opens DevicePackGeneratorModal with the port's USB descriptor.
  const [wizardDevice, setWizardDevice] = useState<DevicePackGeneratorTriggerDevice | null>(null)
  const handleUnknownDeviceClick = (port: HubPort) => {
    if (!port.vendor_id || !port.product_id) return
    setWizardDevice({
      vid: port.vendor_id,
      pid: port.product_id,
      alsa_name: port.name,
    })
  }

  if (ports.length === 0) {
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="No connected MIDI devices"
        subtitle="Connect a USB, DIN, network, or virtual MIDI port to populate the live device report."
      />
    )
  }

  const portsById = new Map(ports.map((port) => [port.port_id, port]))
  const rows: DeviceReportRow[] = ports.map((port) => {
    const sourceRoutes = routes.filter((route) => route.source_port === port.port_id)
    const destinationRoutes = routes.filter((route) => route.destination_ports.includes(port.port_id))
    const activeSourceRoutes = sourceRoutes.filter((route) => route.enabled)
    const activeDestinationRoutes = destinationRoutes.filter((route) => route.enabled)
    const disabledRouteCount =
      sourceRoutes.filter((route) => !route.enabled).length +
      destinationRoutes.filter((route) => !route.enabled).length
    const clockApplied = clockOutputPorts.includes(port.port_id)

    const applicationParts: string[] = []
    if (activeSourceRoutes.length > 0) {
      const destinations = uniquePortNames(
        activeSourceRoutes.flatMap((route) => route.destination_ports),
        portsById,
      )
      applicationParts.push(`Sends to ${summarizePortNames(destinations)}`)
    }
    if (activeDestinationRoutes.length > 0) {
      const sources = uniquePortNames(
        activeDestinationRoutes.map((route) => route.source_port),
        portsById,
      )
      applicationParts.push(`Receives from ${summarizePortNames(sources)}`)
    }
    if (clockApplied) {
      applicationParts.push('Clock output enabled')
    }
    if (applicationParts.length === 0 && disabledRouteCount > 0) {
      applicationParts.push(`Configured in ${disabledRouteCount} disabled route${disabledRouteCount === 1 ? '' : 's'}`)
    }
    if (applicationParts.length === 0) {
      applicationParts.push('Detected but idle')
    }

    const status =
      activeSourceRoutes.length > 0 || activeDestinationRoutes.length > 0 || clockApplied
        ? 'Applied'
        : disabledRouteCount > 0
          ? 'Configured'
          : 'Idle'

    return {
      id: port.port_id,
      device: port.name,
      direction: titleCase(port.direction),
      kind: titleCase(port.kind),
      status,
      application: applicationParts.join('. '),
      unknown: isUnknownDevicePort(port),
      vendor_id: port.vendor_id,
      product_id: port.product_id,
    }
  })
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  return (
    <MidiHubSurface className="midi-hub-connections-surface" tone="raised">
      <DataTable rows={rows} headers={[...HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Connected MIDI devices"
            description="Live port inventory with the current routing and timing roles applied on this node."
            className="midi-hub-connections-table"
          >
            <Table {...getTableProps()} aria-label="Connected MIDI devices report">
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _key, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  const meta = rowsById.get(row.id)
                  const matchingPort = meta?.unknown
                    ? ports.find((port) => port.port_id === row.id)
                    : undefined
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'device' && matchingPort) {
                          return (
                            <TableCell key={cell.id}>
                              <span
                                className="midi-hub-connections__device-cell"
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                              >
                                {String(cell.value)}
                                <button
                                  type="button"
                                  className="midi-hub-connections__unknown-trigger"
                                  onClick={() => handleUnknownDeviceClick(matchingPort)}
                                  aria-label={`Generate device-pack for ${matchingPort.name}`}
                                  style={{
                                    background: 'none',
                                    border: 0,
                                    padding: 0,
                                    marginLeft: '0.5rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Tag type="warm-gray">Unknown device</Tag>
                                </button>
                              </span>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'direction') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type="cool-gray">{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'kind') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type="blue">{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'status') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={statusTagType(String(cell.value))}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      <DevicePackGeneratorModal
        open={wizardDevice !== null}
        device={wizardDevice}
        onClose={() => setWizardDevice(null)}
      />
    </MidiHubSurface>
  )
}

export default MidiHubConnectedDevicesReport
