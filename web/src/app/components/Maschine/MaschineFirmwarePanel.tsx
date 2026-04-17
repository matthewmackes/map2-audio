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

export function MaschineFirmwarePanel({
  status,
  onRefresh,
}: {
  status: MaschineDaemonStatus | null
  onRefresh: () => void
}) {
  const rows = [
    ['USB VID:PID', `${String(status?.hid_device?.vendor_id ?? '17cc')}:${String(status?.hid_device?.product_id ?? '0808')}`],
    ['Protocol Version', String(status?.protocol_version ?? status?.capabilities?.protocol_version ?? 'n/a')],
    ['Daemon Version', String(status?.daemon_version ?? 'n/a')],
    ['Transport', String(status?.transport?.transport_id ?? 'none')],
    ['LED Slots', String(status?.led_slots ?? status?.capabilities?.led_slots ?? 62)],
    ['Encoders', String(status?.encoders ?? status?.capabilities?.encoders ?? 11)],
    ['Pad Count', String(status?.pad_count ?? 16)],
    ['Virtual Port Name', String(status?.virtual_port_name ?? 'n/a')],
    ['Registered At', String(status?.registered_at ?? 'n/a')],
    ['Last Seen', String(status?.last_seen_at ?? 'n/a')],
  ] as const

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-firmware-panel">
      <div className="maschine-page__panel-head">
        <h2>Firmware Info</h2>
        <div className="maschine-page__tag-row">
          <Tag type="cool-gray">Device details</Tag>
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
