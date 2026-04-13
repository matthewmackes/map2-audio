import { Button, Tag, Tile } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import {
  resolveOutboardHardwareStandaloneRoute,
  type OutboardHardwareDevice,
  type OutboardHardwareShellContextValue,
} from './OutboardHardwareShell'

function categoryTagType(category: OutboardHardwareDevice['category']): 'red' | 'blue' | 'green' {
  if (category === 'AVB DSP Mixer') return 'red'
  if (category === 'USB Audio Interface') return 'blue'
  return 'green'
}

function OutboardHardwareCard({ device }: { device: OutboardHardwareDevice }) {
  const navigate = useNavigate()
  const dedicatedRoute = resolveOutboardHardwareStandaloneRoute(device.deviceId)

  return (
    <Tile className="outboard-hardware-page__card">
      <div className="outboard-hardware-page__card-head">
        <div>
          <p className="outboard-hardware-page__eyebrow">{device.category}</p>
          <h2>{device.displayName}</h2>
        </div>
        <Tag type={categoryTagType(device.category)}>{device.shortLabel}</Tag>
      </div>
      <p className="outboard-hardware-page__body-copy">{device.description}</p>
      <p className="outboard-hardware-page__body-copy">
        Operator focus: <strong>{device.operatorFocus}</strong>
      </p>
      <div className="outboard-hardware-page__tag-row">
        {device.capabilities.slice(0, 4).map((capability) => (
          <Tag key={`${device.deviceId}-${capability}`} type="cool-gray">
            {capability}
          </Tag>
        ))}
        {dedicatedRoute ? <Tag type="purple">{dedicatedRoute}</Tag> : null}
      </div>
      <div className="outboard-hardware-page__action-row">
        <Button kind="ghost" size="sm" onClick={() => navigate(`/outboard-hardware/${device.deviceId}`)}>
          Open in workspace
        </Button>
        {dedicatedRoute ? (
          <Button kind="secondary" size="sm" onClick={() => navigate(dedicatedRoute)}>
            Open dedicated route
          </Button>
        ) : null}
      </div>
    </Tile>
  )
}

export function OutboardHardwareOverviewPage() {
  const { devices } = useOutletContext<OutboardHardwareShellContextValue>()

  const metrics = useMemo(() => ({
    total: devices.length,
    avbMixers: devices.filter((device) => device.category === 'AVB DSP Mixer').length,
    interfaces: devices.filter((device) => device.category === 'USB Audio Interface').length,
    processors: devices.filter((device) => device.category === 'Multi-FX Processor').length,
  }), [devices])

  return (
    <div className="outboard-hardware-page">
      <PageHeader
        title="Outboard Hardware"
        subtitle="Unified routed shell for rack processors, AVB DSP hardware, and dedicated interface pages."
        actions={<Tag type="blue">{metrics.total} devices</Tag>}
      />

      <div className="outboard-hardware-page__metrics">
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Total devices</p>
          <h2>{metrics.total}</h2>
          <p className="outboard-hardware-page__body-copy">All currently curated outboard units exposed through the shared shell.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">AVB DSP Mixer</p>
          <h2>{metrics.avbMixers}</h2>
          <p className="outboard-hardware-page__body-copy">Networked DSP infrastructure surfaces kept discoverable through one workspace.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">USB Audio Interface</p>
          <h2>{metrics.interfaces}</h2>
          <p className="outboard-hardware-page__body-copy">Interface-specific pages that stay routed directly while leaving the home launcher less crowded.</p>
        </Tile>
        <Tile className="outboard-hardware-page__metric-card">
          <p className="outboard-hardware-page__eyebrow">Multi-FX Processor</p>
          <h2>{metrics.processors}</h2>
          <p className="outboard-hardware-page__body-copy">Dedicated rack processors that keep their deep editor routes intact.</p>
        </Tile>
      </div>

      <Tile className="outboard-hardware-page__card">
        <div className="outboard-hardware-page__card-head">
          <div>
            <p className="outboard-hardware-page__eyebrow">Workspace contract</p>
            <h2>One shell, five preserved routes</h2>
          </div>
        </div>
        <p className="outboard-hardware-page__body-copy">
          Use the shared shell to browse the rack and interface families, then jump into the unchanged dedicated route when you need live status, deep editors, or device-specific workflows.
        </p>
        <div className="outboard-hardware-page__tag-row">
          <Tag type="blue">Home tile grouped</Tag>
          <Tag type="cool-gray">Advanced Menu preserved</Tag>
          <Tag type="green">Dedicated routes intact</Tag>
        </div>
      </Tile>

      <div className="outboard-hardware-page__unit-grid">
        {devices.map((device) => (
          <OutboardHardwareCard key={device.deviceId} device={device} />
        ))}
      </div>
    </div>
  )
}

export default OutboardHardwareOverviewPage
