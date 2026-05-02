/**
 * T2490-5 — AvbServicesDevicesPage.
 *
 * Operator-visible Devices index. Two co-located Carbon DataTables:
 *   - "Discovered AVB nodes" — sourced from /api/avb/discovery
 *     (talker / listener summary per node, refreshed every 5s).
 *   - "AVDECC entities" — sourced from /api/avb/avdecc/entities
 *     (one row per entity reported by the la_avdecc-backed controller).
 *
 * Cross-link to /avb/devices/tesira lands in T2490-6 once the Tesira
 * fold-in is in place; for now the page surfaces a one-line note that
 * Tesira fleet members will appear here after the fold-in.
 */

import { useMemo } from 'react'
import {
  DataTable,
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

import { useAvdeccEntities, useAvbDiscovery } from './useAvbDevices'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

interface NodeRow {
  id: string
  hostname: string
  role: string
  ip: string
  talkers: number
  listeners: number
  state: string
}

interface EntityRow {
  id: string
  name: string
  vendor: string
  model: string
  firmware: string
  talkers: number
  listeners: number
  online: 'yes' | 'no'
}

const NODE_HEADERS: { key: keyof NodeRow; header: string }[] = [
  { key: 'hostname', header: 'Hostname' },
  { key: 'role',     header: 'Role' },
  { key: 'ip',       header: 'IP' },
  { key: 'talkers',  header: 'Talkers' },
  { key: 'listeners', header: 'Listeners' },
  { key: 'state',    header: 'State' },
]

const ENTITY_HEADERS: { key: keyof EntityRow; header: string }[] = [
  { key: 'name',      header: 'Entity name' },
  { key: 'vendor',    header: 'Vendor' },
  { key: 'model',     header: 'Model' },
  { key: 'firmware',  header: 'Firmware' },
  { key: 'talkers',   header: 'Talker streams' },
  { key: 'listeners', header: 'Listener streams' },
  { key: 'online',    header: 'Online' },
]

export function AvbServicesDevicesPage() {
  useAvbServicesShellWindow(
    'Devices',
    'AVDECC entities, discovered AVB nodes, and registered AVB device profiles.',
  )

  const discoveryQuery = useAvbDiscovery()
  const entitiesQuery = useAvdeccEntities()

  const nodeRows = useMemo<NodeRow[]>(() => {
    const nodes = discoveryQuery.data?.nodes ?? []
    return nodes.map((n, idx) => ({
      id: n.node_id || `node-${idx}`,
      hostname: n.hostname ?? n.node_id ?? '—',
      role: n.role ?? '—',
      ip: n.ip_address ?? '—',
      talkers: n.talkers ?? 0,
      listeners: n.listeners ?? 0,
      state: n.state ?? '—',
    }))
  }, [discoveryQuery.data])

  const entityRows = useMemo<EntityRow[]>(() => {
    const entities = entitiesQuery.data?.entities ?? []
    return entities.map((e) => ({
      id: e.entity_id,
      name: e.entity_name ?? e.entity_id,
      vendor: e.vendor_name ?? '—',
      model: e.model_name ?? '—',
      firmware: e.firmware_version ?? '—',
      talkers: e.talker_streams ?? 0,
      listeners: e.listener_streams ?? 0,
      online: e.online === false ? 'no' : 'yes',
    }))
  }, [entitiesQuery.data])

  const discoveryEnabled = discoveryQuery.data?.enabled ?? true
  const entityError = entitiesQuery.data?.error ?? null

  return (
    <Section className="avb-services-region" data-testid="avb-services-devices-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Devices</Heading>
          <p className="avb-services-region__subtitle">
            Discovered AVB nodes and AVDECC entities. The Tesira fleet
            workspace lives at <code>/avb/devices/tesira</code> (legacy
            <code>/devices/tesira</code> + <code>/tesira</code> hard-redirect
            there).
          </p>
          <div>
            <Tag type="cool-gray">
              {(discoveryQuery.data?.total_discovered ?? 0)} nodes
            </Tag>
            <Tag type="cool-gray">
              {(entitiesQuery.data?.entities.length ?? 0)} AVDECC entities
            </Tag>
            {entityError ? (
              <Tag type="warm-gray" title={entityError}>
                AVDECC: {entityError}
              </Tag>
            ) : null}
          </div>
        </header>
      </Layer>

      {!discoveryEnabled ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="AVB discovery disabled"
          subtitle="Enable AVB in the host configuration to populate this list."
        />
      ) : null}

      <Layer level={1}>
        {nodeRows.length === 0 ? (
          <div className="avb-services-region__placeholder">
            No AVB nodes discovered on the local segment.
          </div>
        ) : (
          <DataTable rows={nodeRows} headers={NODE_HEADERS}>
            {({ rows: tRows, headers, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer
                title="Discovered AVB nodes"
                description="One row per node reported by /api/avb/discovery."
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tRows.map((r) => (
                      <TableRow {...getRowProps({ row: r })} key={r.id}>
                        {r.cells.map((c) => (
                          <TableCell key={c.id}>{c.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Layer>

      <Layer level={1}>
        {entityRows.length === 0 ? (
          <div className="avb-services-region__placeholder">
            No AVDECC entities reported. The la_avdecc-backed controller
            initializes lazily on first use; activating an AVDECC stream
            (or running <code>POST /api/avb/avdecc/discover</code>) will
            populate this list.
          </div>
        ) : (
          <DataTable rows={entityRows} headers={ENTITY_HEADERS}>
            {({ rows: tRows, headers, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer
                title="AVDECC entities"
                description="One row per entity reported by the la_avdecc-backed controller."
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tRows.map((r) => (
                      <TableRow {...getRowProps({ row: r })} key={r.id}>
                        {r.cells.map((c) => (
                          <TableCell key={c.id}>{c.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Layer>
    </Section>
  )
}

export default AvbServicesDevicesPage
