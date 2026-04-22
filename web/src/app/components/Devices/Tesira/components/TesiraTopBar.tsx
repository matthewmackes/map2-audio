import React, { useState } from 'react'
import { Search } from '@carbon/icons-react'
import { Button, InlineLoading, Tag } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { MapMatrixProcessorIcon } from '../../../icons/map'
import { useTesiraDevices, useDiscoveryStatus } from '../hooks/useTesiraApi'
import { DiscoveryDialog } from './DiscoveryDialog'
import './TesiraCarbonChrome.css'

const BIAMP_RED = '#E31837'

export function TesiraTopBar() {
  const navigate = useNavigate()
  const { data: devices } = useTesiraDevices()
  const { data: discoveryStatus } = useDiscoveryStatus()
  const [discoveryOpen, setDiscoveryOpen] = useState(false)

  const connectedCount = devices?.filter((d) => d.connected).length ?? 0
  const totalCount = devices?.length ?? 0
  const anyMaster = devices?.some((d) => d.ptp_state === 'MASTER')
  const isScanning = discoveryStatus?.is_scanning ?? false

  return (
    <>
      <div className="tesira-carbon-bar">
        <div className="tesira-carbon-bar__brand">
          <MapMatrixProcessorIcon size={22} color={BIAMP_RED} />
          <div className="tesira-carbon-bar__copy">
            <p className="tesira-carbon-bar__eyebrow">Biamp control</p>
            <h1 className="tesira-carbon-bar__title">Tesira AVB Fleet</h1>
          </div>
        </div>

        <div className="tesira-carbon-bar__meta">
          <Button size="sm" kind="primary" onClick={() => navigate('/tesira')}>
            Onboarding wizard
          </Button>

          <Tag type={connectedCount === totalCount && totalCount > 0 ? 'green' : connectedCount > 0 ? 'warm-gray' : 'red'}>
            {connectedCount}/{totalCount} online
          </Tag>

          {anyMaster ? (
            <Tag type="red" title="A Tesira unit is PTP master, so MAP2 must slave to it.">
              PTP slaved
            </Tag>
          ) : null}

          <Button size="sm" kind="ghost" renderIcon={Search} onClick={() => setDiscoveryOpen(true)}>
            {isScanning ? 'Scanning…' : 'Discover'}
          </Button>
          {isScanning ? <InlineLoading description="" status="active" /> : null}
        </div>
      </div>

      <DiscoveryDialog open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
    </>
  )
}
