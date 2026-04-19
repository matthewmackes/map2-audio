import { Button, Layer, Tag, Toggle } from '@carbon/react'
import type { MaschineDaemonStatus } from '../../../map2/types'
import type { MaschineTransportConfig } from '../../../map2/clients/maschine'

const USB_ENDPOINTS = [
  { label: 'EP 0x01 OUT', desc: 'LED control + primer' },
  { label: 'EP 0x08 OUT', desc: 'LCD frame data' },
  { label: 'EP 0x81 IN', desc: 'Buttons / encoders' },
  { label: 'EP 0x84 IN', desc: 'Pad pressure (12-bit)' },
] as const

export function MaschineTransportPanel({
  status,
  config,
  isSaving,
  onToggleKernelDetach,
  onRefresh,
}: {
  status: MaschineDaemonStatus | null
  config: MaschineTransportConfig | null
  isSaving: boolean
  onChangePreference?: (value: string) => void
  onToggleKernelDetach: (value: boolean) => void
  onRefresh: () => void
}) {
  const transportId = status?.transport?.transport_id ?? 'none'
  const isConnected = Boolean(status?.transport?.connected)

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-transport-panel">
      <div className="maschine-page__panel-head">
        <h2>USB Protocol</h2>
        <div className="maschine-page__tag-row">
          <Tag type={isConnected ? 'green' : 'red'}>{transportId}</Tag>
          <Button kind="ghost" size="sm" onClick={onRefresh} disabled={isSaving}>
            Refresh
          </Button>
        </div>
      </div>
      <p className="maschine-page__panel-copy">
        Raw USB bulk transport using cabl-derived MK1 protocol. VID 0x17CC, PID 0x0808. Interface 0, alt setting 1.
      </p>
      <div className="maschine-page__tag-row">
        {USB_ENDPOINTS.map((ep) => (
          <Tag key={ep.label} type="cool-gray" title={ep.desc}>{ep.label}</Tag>
        ))}
      </div>
      <div className="maschine-page__toolbar">
        <Toggle
          id="maschine-kernel-detach"
          labelText="Auto-detach snd_usb_caiaq kernel driver"
          labelA="Off"
          labelB="On"
          size="sm"
          toggled={Boolean(config?.allow_kernel_detach)}
          onToggle={(value: boolean) => onToggleKernelDetach(value)}
          disabled={isSaving}
        />
      </div>
      <dl className="maschine-page__kv-grid">
        <div>
          <dt>Protocol</dt>
          <dd>cabl-mk1-v1 (USB bulk)</dd>
        </div>
        <div>
          <dt>LED scheme</dt>
          <dd>2 × 33B packets, 62 slots mono</dd>
        </div>
        <div>
          <dt>LCD</dt>
          <dd>255×64 5bpp KS0713, 10,880B/display</dd>
        </div>
        <div>
          <dt>Pad input</dt>
          <dd>16 pads × 12-bit pressure (0–4095)</dd>
        </div>
        <div>
          <dt>Buttons</dt>
          <dd>42 buttons (7-byte bitmap)</dd>
        </div>
        <div>
          <dt>Encoders</dt>
          <dd>11 × 16-bit counters</dd>
        </div>
      </dl>
    </Layer>
  )
}

export default MaschineTransportPanel
