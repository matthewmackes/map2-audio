import { Renew } from '@carbon/icons-react'
import {
  IconButton,
  Layer,
  StructuredListBody,
  StructuredListCell,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
} from '@carbon/react'
import type { MaschineDaemonStatus } from '../../../map2/types'

function preferredBulkPair(status: MaschineDaemonStatus | null): string {
  const selectedTransport = status?.transport?.selected_transport
  const selectedWrite = typeof selectedTransport?.write_endpoint_address_hex === 'string'
    ? selectedTransport.write_endpoint_address_hex
    : null
  const selectedRead = typeof selectedTransport?.read_endpoint_address_hex === 'string'
    ? selectedTransport.read_endpoint_address_hex
    : null
  if (selectedWrite && selectedRead) {
    return `${selectedWrite} -> ${selectedRead}`
  }
  const bulkCandidate = Array.isArray(status?.transport_candidates)
    ? status.transport_candidates.find((candidate) => candidate.transport_id === 'pyusb-bulk')
    : null
  const candidateWrite = typeof bulkCandidate?.write_endpoint_address_hex === 'string'
    ? bulkCandidate.write_endpoint_address_hex
    : null
  const candidateRead = typeof bulkCandidate?.read_endpoint_address_hex === 'string'
    ? bulkCandidate.read_endpoint_address_hex
    : null
  return candidateWrite && candidateRead ? `${candidateWrite} -> ${candidateRead}` : 'n/a'
}

export function MaschineFirmwarePanel({
  status,
  onRefresh,
}: {
  status: MaschineDaemonStatus | null
  onRefresh: () => void
}) {
  const rows = [
    ['MK1 Firmware Version', String(status?.firmware_info?.version ?? 'n/a')],
    ['USB VID:PID', `${String(status?.hid_device?.vendor_id ?? 'n/a')}:${String(status?.hid_device?.product_id ?? 'n/a')}`],
    ['Selected Transport', String(status?.transport?.transport_id ?? 'none')],
    ['Transport Preference', String(status?.transport?.preference ?? status?.capabilities?.transport_preference ?? 'n/a')],
    ['Transport Candidates', String(Array.isArray(status?.transport_candidates) ? status?.transport_candidates.length : 0)],
    ['Preferred Bulk Pair', preferredBulkPair(status)],
    ['NHL Protocol Version', String(status?.capabilities?.protocol_version ?? 'n/a')],
    ['Daemon Version', String(status?.daemon_version ?? 'n/a')],
    ['Virtual Port Name', String(status?.virtual_port_name ?? 'n/a')],
    ['Last Seen', String(status?.last_seen_at ?? 'n/a')],
  ] as const

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-firmware-panel">
      <div className="maschine-page__panel-head">
        <h2>Firmware Info</h2>
        <div className="maschine-page__tag-row">
          <Tag type="cool-gray">Structured list</Tag>
          <IconButton label="Refresh firmware info" kind="ghost" size="sm" onClick={onRefresh}>
            <Renew />
          </IconButton>
        </div>
      </div>
      <StructuredListWrapper aria-label="Maschine firmware info">
        <StructuredListBody>
          {rows.map(([label, value]) => (
            <StructuredListRow key={label}>
              <StructuredListCell>{label}</StructuredListCell>
              <StructuredListCell>{value}</StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </Layer>
  )
}

export default MaschineFirmwarePanel
