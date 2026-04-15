import { useLCDData } from '../hooks/useLCDData'
import { DashboardCard } from './shared/DashboardCard'
import { Tag } from '@carbon/react'
import './LCDDisplay.css'

export function LCDDisplay() {
  const { data, isLoading, isConnected, error } = useLCDData()

  const statusType = isConnected ? 'green' : error ? 'red' : 'gray'
  const statusLabel = isConnected ? 'Live' : error ? 'Error' : 'Loading'

  return (
    <DashboardCard className="hp2-home-shell__lcd-panel">
      <div className="hp2-home-shell__lcd-header dashboard-card__header">
        <div>
          <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">
            Host Display
          </p>
          <h2 className="dashboard-card__title">LCD Display Mirror</h2>
        </div>
        <Tag type={statusType} size="sm">
          {statusLabel}
        </Tag>
      </div>

      {isLoading && !data ? (
        <div className="hp2-home-shell__lcd-content hp2-home-shell__lcd-loading">
          <p>Loading LCD display...</p>
        </div>
      ) : error ? (
        <div className="hp2-home-shell__lcd-content hp2-home-shell__lcd-error">
          <p>Unable to connect to LCD display</p>
          {error && (
            <span className="hp2-home-shell__lcd-error-detail">
              {error.message}
            </span>
          )}
        </div>
      ) : data ? (
        <div className="hp2-home-shell__lcd-content">
          <pre className="hp2-home-shell__lcd-display">{data.output}</pre>
        </div>
      ) : null}

      <div className="hp2-home-shell__lcd-footer">
        <span className="hp2-home-shell__lcd-footer-text">
          {isConnected ? 'Real-time display (1s updates)' : 'Disconnected'}
        </span>
      </div>
    </DashboardCard>
  )
}

export default LCDDisplay
