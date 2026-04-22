import React from 'react'
import { Connect, Unlink } from '@carbon/icons-react'
import { Button, Tag } from '@carbon/react'
import type { TesiraDeviceDetail } from '../types'
import { MapMatrixProcessorIcon } from '../../../icons/map'
import { useConnectDevice, useDisconnectDevice } from '../hooks/useTesiraApi'
import { useCluster } from '../../../../contexts/useCluster'
import './TesiraCarbonChrome.css'

const BIAMP_RED = '#E31837'

interface TesiraDeviceHeaderProps {
  device: TesiraDeviceDetail
}

export function TesiraDeviceHeader({ device }: TesiraDeviceHeaderProps) {
  const { nodes } = useCluster()
  const connect = useConnectDevice()
  const disconnect = useDisconnectDevice()
  const discoveryLabel = (device.discovered_by_node_ids ?? [])
    .map((nodeId) => nodes.find((node) => node.nodeId === nodeId)?.hostname ?? nodeId)
    .join(', ')

  return (
    <div className="tesira-device-header">
      <div className="tesira-device-header__brand">
        <MapMatrixProcessorIcon size={24} color={device.connected ? BIAMP_RED : '#666'} />
        <div className="tesira-device-header__copy">
          <p className="tesira-device-header__eyebrow">{device.connected ? 'Connected unit' : 'Offline unit'}</p>
          <h2 className="tesira-device-header__title">{device.name || device.host}</h2>
          <p className="tesira-device-header__details">
            {device.host}:{device.port}
            {device.transport ? ` · ${device.transport.toUpperCase()}${device.transport_port ? `:${device.transport_port}` : ''}` : ''}
            {device.serial_number && ` · S/N ${device.serial_number}`}
            {device.firmware_version && ` · fw ${device.firmware_version}`}
          </p>
        </div>
      </div>

      <div className="tesira-device-header__actions">
        <Tag type={device.connected ? 'green' : 'warm-gray'}>{device.connected ? 'Online' : 'Offline'}</Tag>
        {device.ptp_state ? <Tag type={device.ptp_state === 'MASTER' ? 'red' : 'blue'}>PTP {device.ptp_state}</Tag> : null}
        {device.fault_count > 0 ? (
          <Tag type="red">
            {device.fault_count} fault{device.fault_count > 1 ? 's' : ''}
          </Tag>
        ) : null}
        {discoveryLabel ? <Tag type="cool-gray">Discovered by {discoveryLabel}</Tag> : null}

        {device.connected ? (
          <Button
            size="sm"
            kind="danger--tertiary"
            renderIcon={Unlink}
            onClick={() => disconnect.mutate(device.device_id)}
            disabled={disconnect.isPending}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            kind="primary"
            renderIcon={Connect}
            onClick={() => connect.mutate(device.device_id)}
            disabled={connect.isPending}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
