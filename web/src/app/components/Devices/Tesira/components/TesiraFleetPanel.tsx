import React, { useState } from 'react'
import { Add, Renew } from '@carbon/icons-react'
import { Button, InlineNotification, Tag } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { useTesiraDevices } from '../hooks/useTesiraApi'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceCard } from './TesiraDeviceCard'
import { ManualAddDialog } from './ManualAddDialog'
import { useCluster } from '../../../../contexts/useCluster'
import { EmptyState } from '../../../shared/EmptyState'
import { LoadingState } from '../../../shared/LoadingState'
import './TesiraCarbonChrome.css'

export function TesiraFleetPanel() {
  const { data: devices, isLoading, isError, refetch } = useTesiraDevices()
  const { selectedDeviceId, selectDevice } = useTesiraContext()
  const { localNodeId, setActiveNode } = useCluster()
  const [manualAddOpen, setManualAddOpen] = useState(false)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="tesira-fleet-panel tesira-fleet-panel__loading">
        <LoadingState description="Loading Tesira fleet" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="tesira-fleet-panel">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load Tesira fleet"
          subtitle="The device registry could not be read from the active cluster context."
        />
        <Button size="sm" kind="secondary" renderIcon={Renew} onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="tesira-fleet-panel">
        <div className="tesira-fleet-panel__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Fleet</p>
            <h2 className="tesira-device-header__title">Tesira devices</h2>
          </div>
          <div className="tesira-fleet-panel__actions">
            <Tag type="cool-gray" size="sm">{devices?.length ?? 0} configured</Tag>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Add}
              iconDescription="Add device by IP address"
              onClick={() => setManualAddOpen(true)}
            />
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Renew}
              iconDescription="Refresh Tesira fleet"
              onClick={() => refetch()}
            />
          </div>
        </div>

        {(!devices || devices.length === 0) ? (
          <EmptyState
            className="tesira-fleet-panel__empty"
            title="No Tesira devices configured"
            description="Use add-device or discovery in the toolbar to begin onboarding."
            compact
            align="left"
          />
        ) : (
          <div className="tesira-fleet-panel__list">
            {devices.map((device) => (
              <TesiraDeviceCard
                key={device.device_id}
                device={device}
                selected={selectedDeviceId === device.device_id}
                onSelect={() => {
                  const next = selectedDeviceId === device.device_id ? null : device.device_id
                  const targetNodeId = device.source_node_id ?? null
                  setActiveNode(next && targetNodeId && targetNodeId !== localNodeId ? targetNodeId : null)
                  selectDevice(next)
                  if (next) navigate(`/devices/tesira/${next}/dashboard`)
                  else navigate('/tesira')
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ManualAddDialog open={manualAddOpen} onClose={() => setManualAddOpen(false)} />
    </>
  )
}
