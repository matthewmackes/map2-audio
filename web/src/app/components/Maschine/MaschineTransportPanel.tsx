import { Button, Layer, Select, SelectItem, Tag, Toggle } from '@carbon/react'
import type { MaschineDaemonStatus } from '../../../map2/types'
import type { MaschineTransportConfig } from '../../../map2/clients/maschine'

function candidateTagType(connectable: unknown, deviceVisible: unknown): 'green' | 'blue' | 'red' | 'cool-gray' {
  if (connectable) return 'green'
  if (deviceVisible) return 'blue'
  return 'cool-gray'
}

function candidateText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function MaschineTransportPanel({
  status,
  config,
  isSaving,
  onChangePreference,
  onToggleKernelDetach,
  onRefresh,
}: {
  status: MaschineDaemonStatus | null
  config: MaschineTransportConfig | null
  isSaving: boolean
  onChangePreference: (value: 'auto' | 'hidapi' | 'pyusb-bulk') => void
  onToggleKernelDetach: (value: boolean) => void
  onRefresh: () => void
}) {
  const candidates = Array.isArray(status?.transport_candidates) ? status.transport_candidates : []

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-transport-panel">
      <div className="maschine-page__panel-head">
        <h2>Transport Policy</h2>
        <div className="maschine-page__tag-row">
          <Tag type="blue">{String(status?.transport?.transport_id ?? 'none')}</Tag>
          <Button kind="ghost" size="sm" onClick={onRefresh} disabled={isSaving}>
            Refresh
          </Button>
        </div>
      </div>
      <p className="maschine-page__panel-copy">
        Select the richer MK1 transport policy for this host. Runtime config changes apply on the next reconnect or daemon start.
      </p>
      <div className="maschine-page__toolbar">
        <Select
          id="maschine-transport-preference"
          labelText="Transport preference"
          size="sm"
          value={config?.transport_preference ?? 'auto'}
          onChange={(event) => onChangePreference(event.currentTarget.value as 'auto' | 'hidapi' | 'pyusb-bulk')}
          disabled={isSaving}
        >
          <SelectItem value="auto" text="Auto" />
          <SelectItem value="hidapi" text="HIDAPI" />
          <SelectItem value="pyusb-bulk" text="PyUSB Bulk" />
        </Select>
        <Toggle
          id="maschine-kernel-detach"
          labelText="Allow kernel detach for vendor bulk transport"
          labelA="Off"
          labelB="On"
          size="sm"
          toggled={Boolean(config?.allow_kernel_detach)}
          onToggle={(value: boolean) => onToggleKernelDetach(value)}
          disabled={isSaving}
        />
      </div>
      <div className="maschine-page__tag-row">
        <Tag type="cool-gray">Applies on: {config?.applies_on ?? 'next-reconnect-or-daemon-start'}</Tag>
      </div>
      <ul className="maschine-page__candidate-list">
        {candidates.length ? candidates.map((candidate, index) => (
          <li key={`${String(candidate.transport_id ?? 'candidate')}-${index}`} className="maschine-page__candidate-card">
            <div className="maschine-page__panel-head">
              <strong>{String(candidate.transport_id ?? 'candidate')}</strong>
              <Tag type={candidateTagType(candidate.connectable, candidate.device_visible)}>
                {candidate.connectable ? 'connectable' : candidate.device_visible ? 'detected' : 'offline'}
              </Tag>
            </div>
            <p className="maschine-page__panel-copy">
              {String(candidate.note ?? candidate.error ?? 'No candidate note available.')}
            </p>
            <div className="maschine-page__tag-row">
              <Tag type="cool-gray">module {candidate.module_available ? 'ready' : 'missing'}</Tag>
              <Tag type="cool-gray">device {candidate.device_visible ? 'visible' : 'hidden'}</Tag>
              {candidateText(candidate.interface_number) ? (
                <Tag type="cool-gray">if {candidateText(candidate.interface_number)}</Tag>
              ) : null}
              {candidateText(candidate.alternate_setting) ? (
                <Tag type="cool-gray">alt {candidateText(candidate.alternate_setting)}</Tag>
              ) : null}
              {candidateText(candidate.write_endpoint_address_hex) ? (
                <Tag type="cool-gray">out {candidateText(candidate.write_endpoint_address_hex)}</Tag>
              ) : null}
              {candidateText(candidate.read_endpoint_address_hex) ? (
                <Tag type="cool-gray">in {candidateText(candidate.read_endpoint_address_hex)}</Tag>
              ) : null}
            </div>
          </li>
        )) : <li className="maschine-page__candidate-card">No transport candidates were reported by the daemon.</li>}
      </ul>
    </Layer>
  )
}

export default MaschineTransportPanel
