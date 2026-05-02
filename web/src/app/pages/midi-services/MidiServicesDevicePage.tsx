/**
 * T2482 loop 10 / iter 99 — /midi/devices/:profileKey detail stub.
 * T2483 loop 16 / iter 152 — added Edit row action via OverflowMenu
 *   wired to the iter-105 BindingEditDrawer (closes the loop-10
 *   limitation that the detail page was read-only).
 *
 * Per the iter-97 audit §4:
 *   - Header: vendor + model + Enabled/Disabled Tag.
 *   - Bindings list: every binding row matching the profile_key.
 *   - Cross-link banner: if a per-device editor route is known
 *     (resolveDevicePackEditor), render an InlineNotification linking
 *     to the canonical editor.
 */

import { useMemo, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  DataTable,
  Heading,
  InlineNotification,
  Layer,
  Link as CarbonLink,
  OverflowMenu,
  OverflowMenuItem,
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
  useDevicePackBindings,
  type DevicePackBindingRecord,
} from './useDevicePackBindings'
import { resolveDevicePackEditor } from './devicePackEditorRoutes'
import { BindingEditDrawer } from './BindingEditDrawer'
import './MidiServicesDevicePage.css'

const HEADERS = [
  { key: 'binding_id', header: 'Binding ID' },
  { key: 'source_type', header: 'Source' },
  { key: 'target_type', header: 'Target' },
  { key: 'scope', header: 'Scope' },
  { key: 'device_id', header: 'Device' },
  { key: 'enabled', header: 'Enabled' },
  { key: 'actions', header: '' },  // T2483-1A iter 152
]

interface BindingTableRow {
  id: string
  binding_id: string
  source_type: string
  target_type: string
  scope: string
  device_id: string
  enabled: boolean
  actions: string  // T2483-1A unused, Carbon DataTable contract
}

function rowsForProfile(
  bindings: DevicePackBindingRecord[],
  profileKey: string,
): BindingTableRow[] {
  return bindings
    .filter((b) => b.consumer_id === profileKey)
    .map((b) => ({
      id: b.binding_id,
      binding_id: b.binding_id,
      source_type: b.source_type,
      target_type: b.target_type,
      scope: b.scope_id ? `${b.scope}/${b.scope_id}` : b.scope,
      device_id: b.device_id ?? '—',
      enabled: b.enabled,
      actions: '',
    }))
}

export function MidiServicesDevicePage() {
  const { profileKey: rawProfileKey } = useParams<{ profileKey: string }>()
  const profileKey = rawProfileKey ? decodeURIComponent(rawProfileKey) : ''
  const { rawBindings, isLoading, isError } = useDevicePackBindings()
  const [editId, setEditId] = useState<string | null>(null)

  const tableRows = useMemo(
    () => rowsForProfile(rawBindings, profileKey),
    [rawBindings, profileKey],
  )

  const slashIdx = profileKey.indexOf('/')
  const vendor = slashIdx >= 0 ? profileKey.slice(0, slashIdx) : '(unknown)'
  const profile = slashIdx >= 0 ? profileKey.slice(slashIdx + 1) : profileKey
  const profileDisplay = profile.replace(/\.midi$/i, '')
  const anyEnabled = tableRows.some((r) => r.enabled)
  const editor = resolveDevicePackEditor(profileKey)

  return (
    <Section className="midi-services-device">
      <Layer level={0}>
        <Breadcrumb noTrailingSlash className="midi-services-device__crumbs">
          <BreadcrumbItem>
            <CarbonLink as={RouterLink} to="/midi/devices">
              Devices
            </CarbonLink>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{profileDisplay}</BreadcrumbItem>
        </Breadcrumb>
        <header className="midi-services-device__header">
          <Heading className="midi-services-device__title">
            {vendor} / {profileDisplay}
          </Heading>
          <div className="midi-services-device__tags">
            <Tag type={anyEnabled ? 'green' : 'gray'} size="sm">
              {anyEnabled ? 'Enabled' : 'Disabled'}
            </Tag>
            <Tag type="cool-gray" size="sm">
              {tableRows.length} binding{tableRows.length === 1 ? '' : 's'}
            </Tag>
          </div>
        </header>
      </Layer>

      {editor.isCanonical ? (
        <div className="midi-services-device__editor-banner">
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Per-device editor available"
            subtitle={`This profile has a first-party editor at ${editor.route}.`}
          />
          <CarbonLink
            as={RouterLink}
            to={editor.route}
            className="midi-services-device__editor-link"
          >
            Open {editor.label} editor →
          </CarbonLink>
        </div>
      ) : (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="No first-party editor for this profile"
          subtitle="This is a generic read-only view of the device-pack bindings. Per-row override authoring lands in a future iter."
        />
      )}

      {isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load bindings for this profile"
          subtitle="The /api/midi/bindings endpoint returned an error."
        />
      ) : null}

      <Layer level={1}>
        <DataTable rows={tableRows} headers={HEADERS}>
          {({ rows: dtRows, headers: dtHeaders, getHeaderProps, getRowProps, getTableProps }) => (
            <TableContainer
              title="Bindings"
              description={
                isLoading
                  ? 'Loading bindings…'
                  : tableRows.length === 0
                    ? 'No bindings registered for this profile.'
                    : `${tableRows.length} binding${tableRows.length === 1 ? '' : 's'} registered`
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
                  {dtRows.map((dtRow) => (
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
                        if (cell.info.header === 'actions') {
                          return (
                            <TableCell key={cell.id} className="midi-services-device__actions-cell">
                              <OverflowMenu
                                iconDescription="Row actions"
                                size="sm"
                                flipped
                              >
                                <OverflowMenuItem
                                  itemText="Edit"
                                  onClick={() => setEditId(dtRow.id)}
                                />
                              </OverflowMenu>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </Layer>

      <BindingEditDrawer
        bindingId={editId}
        open={editId !== null}
        onClose={() => setEditId(null)}
      />
    </Section>
  )
}

export default MidiServicesDevicePage
