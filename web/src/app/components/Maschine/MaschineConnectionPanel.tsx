import { Layer, Tag } from '@carbon/react'
import type { MaschineDaemonStatus } from '../../../map2/types'

function daemonTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  if (status.connected && status.websocket_connected) return 'green'
  if (status.connected) return 'warm-gray'
  return 'red'
}

function hidTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  return Boolean(status.transport?.connected) ? 'green' : status.hid_device && Object.keys(status.hid_device).length > 0 ? 'warm-gray' : 'red'
}

function alsaTagType(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  return status.virtual_port_name ? 'green' : 'red'
}

export function MaschineConnectionPanel({ status }: { status: MaschineDaemonStatus | null }) {
  return (
    <Layer className="maschine-page__panel" data-testid="maschine-connection-panel">
      <div className="maschine-page__panel-head">
        <h2>Connection</h2>
        <Tag type={daemonTagType(status)}>{status?.status ?? 'unknown'}</Tag>
      </div>
      <p className="maschine-page__panel-copy">
        Rich transport availability, daemon registration, and ALSA virtual-port state are refreshed every two seconds and reinforced by the dedicated Maschine websocket.
      </p>
      <div className="maschine-page__tag-row">
        <Tag type={hidTagType(status)}>
          Transport {status?.transport?.connected ? String(status.transport?.transport_id ?? 'online') : status?.hid_device && Object.keys(status.hid_device).length > 0 ? 'detected' : 'offline'}
        </Tag>
        <Tag type={daemonTagType(status)}>Daemon {status?.connected ? 'connected' : 'offline'}</Tag>
        <Tag type={alsaTagType(status)}>ALSA {status?.virtual_port_name ? 'ready' : 'missing'}</Tag>
      </div>
      <dl className="maschine-page__kv-grid">
        <div>
          <dt>Selected transport</dt>
          <dd>{String(status?.transport?.transport_id ?? 'none')}</dd>
        </div>
        <div>
          <dt>Virtual port</dt>
          <dd>{status?.virtual_port_name ?? 'n/a'}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{status?.last_seen_at ?? 'n/a'}</dd>
        </div>
        <div>
          <dt>Daemon version</dt>
          <dd>{String(status?.daemon_version ?? 'n/a')}</dd>
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
