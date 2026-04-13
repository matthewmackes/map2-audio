import { Button, Tag, Tile } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import {
  resolveOutboardHardwareStandaloneRoute,
  type OutboardHardwareShellContextValue,
} from './OutboardHardwareShell'
import { buildOutboardHardwarePath } from './outboardHardwareRoutes'

function categoryTagType(category: string): 'red' | 'blue' | 'green' {
  if (category === 'AVB DSP Mixer') return 'red'
  if (category === 'USB Audio Interface') return 'blue'
  return 'green'
}

export function OutboardHardwareDevicePage({
  buildDevicePath = buildOutboardHardwarePath,
}: {
  buildDevicePath?: (deviceId?: string | null) => string
}) {
  const navigate = useNavigate()
  const { deviceId } = useParams<{ deviceId: string }>()
  const { devices } = useOutletContext<OutboardHardwareShellContextValue>()

  const device = useMemo(
    () => devices.find((item) => item.deviceId === deviceId) ?? null,
    [deviceId, devices],
  )

  if (!device) {
    return (
      <div className="outboard-hardware-page">
        <PageHeader
          title="Outboard Hardware Unit Not Found"
          subtitle="The requested device is not part of the routed outboard-hardware catalog."
        />
        <Tile className="outboard-hardware-page__card">
          <p className="outboard-hardware-page__body-copy">
            Return to the overview to choose one of the routed outboard-hardware entries.
          </p>
          <div className="outboard-hardware-page__action-row">
            <Button kind="secondary" size="sm" onClick={() => navigate(buildDevicePath())}>
              Back to overview
            </Button>
          </div>
        </Tile>
      </div>
    )
  }

  const dedicatedRoute = resolveOutboardHardwareStandaloneRoute(device.deviceId)

  return (
    <div className="outboard-hardware-page">
      <PageHeader
        title={device.displayName}
        subtitle="Shared identity and routing page inside the Outboard Hardware workspace."
        actions={<Tag type={categoryTagType(device.category)}>{device.category}</Tag>}
      />

      <div className="outboard-hardware-page__metrics">
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Hardware class</p>
          <h2>{device.category}</h2>
          <p className="outboard-hardware-page__body-copy">{device.operatorFocus}</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Dedicated route</p>
          <h2>{dedicatedRoute ?? 'None'}</h2>
          <p className="outboard-hardware-page__body-copy">The specialized route remains the canonical live-control surface for this device family.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Protocols</p>
          <h2>{device.protocols.length}</h2>
          <p className="outboard-hardware-page__body-copy">{device.connectionModel}</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Capabilities</p>
          <h2>{device.capabilities.length}</h2>
          <p className="outboard-hardware-page__body-copy">{device.capabilitySummary}</p>
        </Tile>
      </div>

      <div className="outboard-hardware-page__dual-grid">
        <Tile className="outboard-hardware-page__card">
          <div className="outboard-hardware-page__card-head">
            <div>
              <p className="outboard-hardware-page__eyebrow">Connection model</p>
              <h2>Operational posture</h2>
            </div>
            <Tag type={categoryTagType(device.category)}>{device.shortLabel}</Tag>
          </div>
          <p className="outboard-hardware-page__body-copy">{device.description}</p>
          <p className="outboard-hardware-page__body-copy">{device.connectionModel}</p>
          <div className="outboard-hardware-page__tag-row">
            {device.protocols.map((protocol) => (
              <Tag key={`${device.deviceId}-${protocol}`} type="cool-gray">
                {protocol}
              </Tag>
            ))}
          </div>
          <div className="outboard-hardware-page__action-row">
            {dedicatedRoute ? (
              <Button kind="secondary" size="sm" onClick={() => navigate(dedicatedRoute)}>
                Open dedicated route
              </Button>
            ) : null}
            <Button kind="ghost" size="sm" onClick={() => navigate(buildDevicePath())}>
              Back to overview
            </Button>
          </div>
        </Tile>

        <Tile className="outboard-hardware-page__card">
          <div className="outboard-hardware-page__card-head">
            <div>
              <p className="outboard-hardware-page__eyebrow">Family scope</p>
              <h2>Capabilities</h2>
            </div>
          </div>
          <div className="outboard-hardware-page__tag-row">
            {device.capabilities.map((capability) => (
              <Tag key={`${device.deviceId}-${capability}`} type="cool-gray">
                {capability}
              </Tag>
            ))}
          </div>
        </Tile>
      </div>

      <Tile className="outboard-hardware-page__card">
        <div className="outboard-hardware-page__card-head">
          <div>
            <p className="outboard-hardware-page__eyebrow">Spec sheet</p>
            <h2>Identity and routing metadata</h2>
          </div>
        </div>
        <ul className="outboard-hardware-page__detail-list">
          {device.specs.map((spec) => (
            <li key={`${device.deviceId}-${spec.label}`}>
              <strong>{spec.label}</strong>
              <span>{spec.value}</span>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  )
}

export default OutboardHardwareDevicePage
