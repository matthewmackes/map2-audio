import React, { useState } from 'react'
import { Button, Tag, Tile } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { useTesiraDevice } from '../hooks/useTesiraApi'
import { LoadingState } from '../../../shared/LoadingState'
import { TesiraFleetHealth } from './TesiraFleetHealth'
import { TesiraPtpTopology } from './TesiraPtpTopology'
import { TesiraDeployDialog } from './TesiraDeployDialog'
import { TesiraQuickCommandPanel } from './TesiraQuickCommandPanel'
import { buildAvbRoutingWorkspaceHref } from '../../../AvbRouting/avbRoutingWorkspaceHref'
import './TesiraCarbonChrome.css'

interface TesiraDeviceDashboardProps {
  deviceId: string
}

export function TesiraDeviceDashboard({ deviceId }: TesiraDeviceDashboardProps) {
  const navigate = useNavigate()
  const { data: device, isLoading } = useTesiraDevice(deviceId)
  const [deployOpen, setDeployOpen] = useState(false)

  if (isLoading || !device) {
    return (
      <div className="tesira-dashboard__loading">
        <LoadingState description="Loading Tesira dashboard" />
      </div>
    )
  }

  const cards = [
    { label: 'Connection', value: device.connected ? 'Online' : 'Offline' },
    { label: 'Faults', value: String(device.fault_count ?? 0) },
    { label: 'AVB Streams', value: String(device.avb_stream_count ?? 0) },
    { label: 'PTP', value: device.ptp_state || 'Unknown' },
  ]
  const talkers = device.avb_streams.filter((stream) => stream.direction === 'talker').length
  const listeners = device.avb_streams.filter((stream) => stream.direction === 'listener').length
  const streamHealth = device.connected ? 'Healthy' : 'Offline'
  const quickRoutes = [
    { label: 'Levels', to: `/devices/tesira/${deviceId}/levels` },
    { label: 'Mixer', to: `/devices/tesira/${deviceId}/mixer` },
    { label: 'EQ', to: `/devices/tesira/${deviceId}/eq` },
    { label: 'Presets', to: `/devices/tesira/${deviceId}/presets` },
    { label: 'Design', to: `/devices/tesira/${deviceId}/design` },
    { label: 'DSP', to: `/devices/tesira/${deviceId}/dsp` },
    { label: 'Settings', to: `/devices/tesira/${deviceId}/settings` },
  ]

  return (
    <div className="tesira-dashboard">
      <div className="tesira-dashboard__hero">
        <div className="tesira-dashboard__hero-meta">
          <div>
            <p className="tesira-dashboard__eyebrow">Operator dashboard</p>
            <h2 className="tesira-dashboard__title">{device.name || device.host}</h2>
            <p className="tesira-dashboard__summary">
              {device.host}:{device.port}
              {device.firmware_version ? ` · fw ${device.firmware_version}` : ''}
            </p>
          </div>
          <div className="tesira-dashboard__hero-meta">
            <Tag type={device.connected ? 'green' : 'warm-gray'}>{device.connected ? 'Runtime ready' : 'Needs reconnect'}</Tag>
            {device.transport ? <Tag type="cool-gray">{device.transport.toUpperCase()}</Tag> : null}
          </div>
        </div>

        <div className="tesira-dashboard__summary-grid">
          {cards.map((card) => (
            <Tile key={card.label} className="tesira-dashboard__summary-tile">
              <p className="tesira-dashboard__stat-label">{card.label}</p>
              <p className="tesira-dashboard__stat-value">{card.value}</p>
            </Tile>
          ))}
        </div>

        <div className="tesira-dashboard__actions">
          {quickRoutes.map((route) => (
            <Button key={route.to} size="sm" kind="secondary" onClick={() => navigate(route.to)}>
              {route.label}
            </Button>
          ))}
          <Button size="sm" kind="secondary" onClick={() => setDeployOpen(true)}>
            Export for SageVue
          </Button>
          <Button
            size="sm"
            kind="tertiary"
            onClick={() => navigate(buildAvbRoutingWorkspaceHref({
              tesiraDeviceId: deviceId,
              nodeId: device.source_node_id ?? null,
            }))}
          >
            AVB Routing
          </Button>
        </div>
      </div>

      <Tile className="tesira-dashboard__stream-tile">
        <div className="tesira-dashboard__stream-copy">
          <p className="tesira-dashboard__stat-label">AVB stream health</p>
          <div className="tesira-dashboard__stream-meta">
            <div className="tesira-dashboard__hero-meta">
              <Tag type={streamHealth === 'Healthy' ? 'green' : 'warm-gray'}>{streamHealth}</Tag>
              <Tag type="cool-gray">Talkers {talkers}</Tag>
              <Tag type="cool-gray">Listeners {listeners}</Tag>
            </div>
            <Button size="sm" kind="tertiary" onClick={() => navigate(`/devices/tesira/${deviceId}/avb`)}>
              View streams
            </Button>
          </div>
        </div>
      </Tile>

      <TesiraQuickCommandPanel deviceId={deviceId} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
        <div>
          <TesiraFleetHealth />
        </div>
        <div>
          <TesiraPtpTopology />
        </div>
      </div>

      <TesiraDeployDialog
        deviceId={deviceId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
      />
    </div>
  )
}
