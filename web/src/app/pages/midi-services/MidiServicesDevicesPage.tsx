/**
 * T2482 loop 10 / iter 98 — /midi/devices Carbon DataTable.
 *
 * INDEX surface for the Devices region of MIDI Services. Per the
 * iter-97 audit, this page is NOT an authoring surface — it lists
 * device-pack profiles + their canonical binding count + a cross-link
 * to the per-device editor (when one exists).
 *
 * Locked column set (iter-97 audit §3):
 *   Device | Vendor | Profile | Bindings | Enabled | Editor
 */

import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  DataTable,
  Heading,
  InlineNotification,
  Layer,
  Link as CarbonLink,
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

import { useDevicePackBindings, type DevicePackProfileRow } from './useDevicePackBindings'
import { resolveDevicePackEditor } from './devicePackEditorRoutes'
import './MidiServicesDevicesPage.css'

interface DeviceTableRow {
  id: string
  device: string
  vendor: string
  profile: string
  bindings: number
  enabled: boolean
  editor: string  // unused — Carbon DataTable requires a property per header key
}

const HEADERS = [
  { key: 'device', header: 'Device' },
  { key: 'vendor', header: 'Vendor' },
  { key: 'profile', header: 'Profile' },
  { key: 'bindings', header: 'Bindings' },
  { key: 'enabled', header: 'Enabled' },
  { key: 'editor', header: 'Editor' },
]

function buildDisplayName(row: DevicePackProfileRow): string {
  // Strip a trailing ".midi" extension for display so the column
  // matches what operators see in the device-pack manifest UI.
  const stripped = row.profile.replace(/\.midi$/i, '')
  return `${row.vendor} / ${stripped}`
}

function rowsFromProfiles(rows: DevicePackProfileRow[]): DeviceTableRow[] {
  return rows.map((r) => ({
    id: r.profileKey,
    device: buildDisplayName(r),
    vendor: r.vendor,
    profile: r.profile,
    bindings: r.bindingCount,
    enabled: r.enabled,
    editor: '',
  }))
}

export function MidiServicesDevicesPage() {
  const { rows, isLoading, isError } = useDevicePackBindings()
  const tableRows = useMemo(() => rowsFromProfiles(rows), [rows])

  return (
    <Section className="midi-services-devices">
      <Layer level={0}>
        <header className="midi-services-devices__header">
          <Heading className="midi-services-devices__title">Devices</Heading>
          <p className="midi-services-devices__subtitle">
            Device-pack profiles registered with the canonical
            <code> device_pack </code> consumer in the MIDI Bindings
            authority. Each row links to its first-party editor when
            one exists, or to a generic read-only stub.
          </p>
        </header>
      </Layer>

      {isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load device-pack bindings"
          subtitle="The /api/midi/bindings endpoint returned an error. Bindings authority may be unreachable."
        />
      ) : null}

      <Layer level={1}>
        <DataTable rows={tableRows} headers={HEADERS}>
          {({
            rows: dtRows,
            headers: dtHeaders,
            getHeaderProps,
            getRowProps,
            getTableProps,
          }) => (
            <TableContainer
              title=""
              description={
                isLoading
                  ? 'Loading device-pack profiles…'
                  : `${tableRows.length} device-pack profile${tableRows.length === 1 ? '' : 's'} registered`
              }
            >
              <Table {...getTableProps()} size="md">
                <TableHead>
                  <TableRow>
                    {dtHeaders.map((h) => (
                      <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                        {h.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dtRows.length === 0 && !isLoading ? (
                    <TableRow>
                      <TableCell colSpan={dtHeaders.length}>
                        <span className="midi-services-devices__empty">
                          No device-pack bindings registered yet.
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    dtRows.map((dtRow) => {
                      const editor = resolveDevicePackEditor(dtRow.id)
                      return (
                        <TableRow key={dtRow.id} {...getRowProps({ row: dtRow })}>
                          {dtRow.cells.map((cell) => {
                            if (cell.info.header === 'enabled') {
                              const enabled = cell.value as boolean
                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={enabled ? 'green' : 'gray'} size="sm">
                                    {enabled ? 'Enabled' : 'Disabled'}
                                  </Tag>
                                </TableCell>
                              )
                            }
                            if (cell.info.header === 'editor') {
                              return (
                                <TableCell key={cell.id}>
                                  <CarbonLink
                                    as={RouterLink}
                                    to={editor.route}
                                    className="midi-services-devices__editor-link"
                                  >
                                    {editor.label}
                                  </CarbonLink>
                                </TableCell>
                              )
                            }
                            return (
                              <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                            )
                          })}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </Layer>
    </Section>
  )
}

export default MidiServicesDevicesPage
