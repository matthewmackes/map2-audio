import { Layer, Tag } from '@carbon/react'
import type { MaschineDaemonStatus } from '../../../map2/types'

function daemonTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  if (status.connected && status.websocket_connected) return 'green'
  if (status.connected) return 'warm-gray'
  return 'red'
}

function transportTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  return status.transport?.connected ? 'green' : 'red'
}

function alsaTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  return status.virtual_port_name ? 'green' : 'red'
}

export function MaschineConnectionPanel({ status }: { status: MaschineDaemonStatus | null }) {
  const protocolVersion = status?.protocol_version ?? status?.capabilities?.protocol_version ?? null
  const ledSlots = status?.led_slots ?? status?.capabilities?.led_slots ?? 62
  const encoders = status?.encoders ?? status?.capabilities?.encoders ?? 11

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-connection-panel">
      <div className="maschine-page__panel-head">
        <h2>Connection</h2>
        <Tag type={daemonTagType(status)}>{status?.status ?? 'unknown'}</Tag>
      </div>
      <p className="maschine-page__panel-copy">
        USB bulk transport (cabl-derived protocol), daemon registration, and ALSA virtual-port state.
      </p>
      <div className="maschine-page__tag-row">
        <Tag type={transportTagType(status)}>
          USB {status?.transport?.connected ? 'connected' : 'offline'}
        </Tag>
        <Tag type={daemonTagType(status)}>Daemon {status?.connected ? 'online' : 'offline'}</Tag>
        <Tag type={alsaTagType(status)}>ALSA {status?.virtual_port_name ? 'ready' : 'missing'}</Tag>
        {protocolVersion ? <Tag type="blue">{String(protocolVersion)}</Tag> : null}
      </div>
      <dl className="maschine-page__kv-grid">
        <div>
          <dt>Transport</dt>
          <dd>{String(status?.transport?.transport_id ?? 'none')}</dd>
        </div>
        <div>
          <dt>Virtual port</dt>
          <dd>{status?.virtual_port_name ?? 'n/a'}</dd>
        </div>
        <div>
          <dt>Daemon version</dt>
          <dd>{String(status?.daemon_version ?? 'n/a')}</dd>
        </div>
        <div>
          <dt>LED slots</dt>
          <dd>{String(ledSlots)}</dd>
        </div>
        <div>
          <dt>Encoders</dt>
          <dd>{String(encoders)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{status?.last_seen_at ?? 'n/a'}</dd>
        </div>
        <div>
          <dt>USB VID:PID</dt>
          <dd>{status?.hid_device?.vendor_id && status?.hid_device?.product_id
            ? `${String(status.hid_device.vendor_id)}:${String(status.hid_device.product_id)}`
            : '17cc:0808'}</dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>{status?.last_event_type ?? 'n/a'}</dd>
        </div>
      </dl>
    </Layer>
  )
}

export default MaschineConnectionPanel
