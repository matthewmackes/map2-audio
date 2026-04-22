import React, { useState, useCallback } from 'react'
import { Renew, WarningAltFilled, Wifi, WifiOff } from '@carbon/icons-react'
import { ClickableTile, Tag } from '@carbon/react'
import type { TesiraDeviceSummary } from '../types'
import { MapMatrixProcessorIcon } from '../../../icons/map'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'
import { useCluster } from '../../../../contexts/useCluster'
import './TesiraCarbonChrome.css'

interface TesiraDeviceCardProps {
  device: TesiraDeviceSummary
  selected: boolean
  onSelect: () => void
}

export function TesiraDeviceCard({ device, selected, onSelect }: TesiraDeviceCardProps) {
  const { nodes } = useCluster()
  const [reconnecting, setReconnecting] = useState(false)
  const [nextRetryS, setNextRetryS] = useState<number | null>(null)
  const discoveryLabel = (device.discovered_by_node_ids ?? [])
    .map((nodeId) => nodes.find((node) => node.nodeId === nodeId)?.hostname ?? nodeId)
    .join(', ')

  useTesiraDeviceState(
    useCallback((event) => {
      if (event.device_id !== device.device_id) return
      if (event.event === 'reconnecting') {
        setReconnecting(true)
        setNextRetryS(event.next_retry_s ?? null)
      } else if (event.event === 'connected') {
        setReconnecting(false)
        setNextRetryS(null)
      } else if (event.event === 'disconnected') {
        setReconnecting(false)
      }
    }, [device.device_id]),
  )

  return (
    <ClickableTile
      className={[
        'tesira-device-card',
        selected ? 'tesira-device-card--selected' : '',
        device.connected ? 'tesira-device-card--online' : 'tesira-device-card--offline',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <div className="tesira-device-card__header">
        <div className="tesira-device-card__identity">
          <span className="tesira-device-card__icon" aria-hidden>
            <MapMatrixProcessorIcon
              size={18}
              color={device.connected ? 'var(--cds-support-error)' : 'var(--cds-icon-secondary)'}
            />
          </span>
          <div className="tesira-device-card__copy">
            <h3 className="tesira-device-card__title">{device.name || device.host}</h3>
            <p className="tesira-device-card__meta">{device.host}:{device.port}</p>
          </div>
        </div>

        <div className="tesira-device-card__signals">
          {device.connected ? (
            <Wifi size={14} className="tesira-device-card__signal tesira-device-card__signal--online" />
          ) : reconnecting ? (
            <span
              className="tesira-device-card__signal tesira-device-card__signal--reconnecting"
              title={nextRetryS != null ? `Retrying in ${nextRetryS}s` : 'Reconnecting…'}
            >
              <Renew size={14} />
            </span>
          ) : (
            <WifiOff size={14} className="tesira-device-card__signal tesira-device-card__signal--offline" />
          )}
          {device.fault_count > 0 ? (
            <WarningAltFilled
              size={14}
              className="tesira-device-card__signal tesira-device-card__signal--fault"
              title={`${device.fault_count} fault(s)`}
            />
          ) : null}
        </div>
      </div>

      <div className="tesira-device-card__tags">
        <Tag type={device.connected ? 'green' : reconnecting ? 'gray' : 'warm-gray'} size="sm">
          {device.connected ? 'Online' : reconnecting ? (nextRetryS != null ? `Retry in ${nextRetryS}s` : 'Reconnecting…') : 'Offline'}
        </Tag>
        {device.avb_stream_count > 0 ? <Tag type="cool-gray" size="sm">{device.avb_stream_count} AVB</Tag> : null}
        {device.ptp_state ? <Tag type={device.ptp_state === 'MASTER' ? 'red' : 'cool-gray'} size="sm">PTP {device.ptp_state}</Tag> : null}
        {discoveryLabel ? <Tag type="purple" size="sm">Seen by {discoveryLabel}</Tag> : null}
        {device.firmware_version ? <Tag type="warm-gray" size="sm">fw {device.firmware_version}</Tag> : null}
      </div>
    </ClickableTile>
  )
}
