import React from 'react'
import { Renew } from '@carbon/icons-react'
import { Button, InlineNotification, Tag, Tile } from '@carbon/react'
import { useTesiraFleetHealth } from '../hooks/useTesiraApi'
import { LoadingState } from '../../shared/LoadingState'
import './TesiraCarbonChrome.css'

export function TesiraFleetHealth() {
  const { data: health, error, isLoading: loading, refetch } = useTesiraFleetHealth()

  return (
    <div className="tesira-fleet-health">
      <Tile className="tesira-fleet-health__tile">
        <div className="tesira-fleet-health__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Fleet health</p>
            <h3 className="tesira-dashboard__title">Tesira connection posture</h3>
            <p className="tesira-dashboard__summary">
              Track overall fleet connectivity before onboarding, deployment, or runtime control work.
            </p>
          </div>
          <div className="tesira-fleet-health__actions">
            {health ? (
              <Tag type={health.status === 'healthy' ? 'green' : 'red'} size="sm">
                {health.status === 'healthy' ? 'Healthy' : 'Degraded'}
              </Tag>
            ) : null}
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                refetch().catch(() => undefined)
              }}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Fleet health unavailable"
            subtitle={(error as Error).message || 'Unable to compute fleet connectivity state.'}
          />
        ) : null}

        {loading && !health ? (
          <div className="tesira-fleet-health__loading">
            <LoadingState description="Loading fleet health" />
          </div>
        ) : (
          <div className="tesira-fleet-health__stats">
            <div className="tesira-fleet-health__stat">
              <p className="tesira-dashboard__stat-label">Online</p>
              <p className="tesira-dashboard__stat-value">{health ? `${health.connected_devices}/${health.total_devices}` : '—'}</p>
            </div>
            <div className="tesira-fleet-health__stat">
              <p className="tesira-dashboard__stat-label">Offline</p>
              <p className="tesira-dashboard__stat-value">{health?.offline_devices ?? '—'}</p>
            </div>
            <div className="tesira-fleet-health__stat">
              <p className="tesira-dashboard__stat-label">Connected ratio</p>
              <p className="tesira-dashboard__stat-value">
                {health ? `${Math.round(health.connected_ratio * 100)}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </Tile>
    </div>
  )
}
