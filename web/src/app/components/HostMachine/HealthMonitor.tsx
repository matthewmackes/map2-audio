/**
 * Health Monitor - Real-Time System Health Status
 */

import { Flash as Lightning, TemperatureHot as Thermometer, Windy as Wind } from '@carbon/icons-react'
import type { SystemHealthOverview } from '@/map2/types'

interface HealthMonitorProps {
  healthOverview?: SystemHealthOverview
  nodeId?: string | null
}

function getTempLabel(tempC: number) {
  if (tempC < 50) return { text: 'Excellent — CPU running cool', tone: 'success' }
  if (tempC < 70) return { text: 'Good — Normal operating range', tone: 'success' }
  if (tempC < 80) return { text: 'Warm — Monitor temperature', tone: 'warning' }
  return { text: 'Hot — Check cooling system', tone: 'danger' }
}

export default function HealthMonitor({ healthOverview }: HealthMonitorProps) {
  if (!healthOverview) return null

  const health = healthOverview.overall_health ?? 'unknown'
  const tempC = healthOverview.cpu_temp_celsius ?? 0
  const tempMax = healthOverview.max_temp_celsius ?? 100
  const tempPercent = Math.min((tempC / Math.max(tempMax, 100)) * 100, 100)
  const tempInfo = getTempLabel(tempC)

  const healthTone =
    health === 'excellent' || health === 'good' ? 'success'
    : health === 'warning' ? 'warning'
    : health === 'critical' ? 'danger'
    : 'info'

  return (
    <div className="hm-health-monitor">
      {/* ── Overall status ─────────────────────────────────────────── */}
      <div className="hm-section-card">
        <div className="hm-section-card__header">
          <span className="hm-section-card__icon"><Lightning size={16} /></span>
          <span className="hm-section-card__title">System Health</span>
        </div>

        <div className={`hm-health-status hm-health-status--${healthTone}`}>
          {health.toUpperCase()}
        </div>

        <table className="hm-info-table" style={{ marginTop: 12 }}>
          <tbody>
            {healthOverview.temperature && (
              <tr>
                <td className="hm-info-table__key">Temperature</td>
                <td className="hm-info-table__val">
                  {healthOverview.temperature.cpu_c}°C
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    max {healthOverview.temperature.max_c}°C
                  </span>
                </td>
              </tr>
            )}
            {healthOverview.temperature?.throttling && (
              <tr>
                <td className="hm-info-table__key">Throttling</td>
                <td className="hm-info-table__val" style={{ color: 'var(--danger)' }}>
                  Active — reduce workload
                </td>
              </tr>
            )}
            {healthOverview.fans && healthOverview.fans.length > 0 && (
              <tr>
                <td className="hm-info-table__key">Fans</td>
                <td className="hm-info-table__val">
                  {healthOverview.fans.length} detected
                  {healthOverview.fans.some((f) => f.status !== 'ok') && (
                    <span style={{ color: 'var(--warning)', marginLeft: 8 }}>— check fan status</span>
                  )}
                </td>
              </tr>
            )}
            {healthOverview.power && (
              <tr>
                <td className="hm-info-table__key">Power</td>
                <td className="hm-info-table__val">
                  {healthOverview.power.input_voltage}V @ {healthOverview.power.current_load_percent}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── CPU Temperature ────────────────────────────────────────── */}
      <div className="hm-section-card">
        <div className="hm-section-card__header">
          <span className="hm-section-card__icon"><Thermometer size={16} /></span>
          <span className="hm-section-card__title">CPU Temperature</span>
        </div>

        <div className="hm-temp-display">
          <span className={`hm-temp-display__value hm-temp-display__value--${tempInfo.tone}`}>
            {tempC.toFixed(1)}°C
          </span>
          <span className="hm-temp-display__max">max {tempMax}°C</span>
        </div>

        {/* Progress bar */}
        <div className="hm-progress-track" style={{ marginTop: 12 }}>
          <div
            className={`hm-progress-fill hm-progress-fill--${tempInfo.tone}`}
            style={{ width: `${tempPercent}%` }}
          />
        </div>

        <div className={`hm-temp-label hm-temp-label--${tempInfo.tone}`} style={{ marginTop: 8 }}>
          {tempInfo.text}
        </div>
      </div>

      {/* ── Fan Status ─────────────────────────────────────────────── */}
      {healthOverview.fans && healthOverview.fans.length > 0 && (
        <div className="hm-section-card hm-section-card--wide">
          <div className="hm-section-card__header">
            <span className="hm-section-card__icon"><Wind size={16} /></span>
            <span className="hm-section-card__title">Fan Status</span>
          </div>
          <div className="hm-fan-grid">
            {healthOverview.fans.map((fan, idx) => (
              <div
                key={idx}
                className={`hm-fan-card${fan.status !== 'ok' ? ' hm-fan-card--warn' : ''}`}
              >
                <div className="hm-fan-card__name">{fan.name}</div>
                <div className="hm-fan-card__rpm">{fan.rpm} RPM</div>
                <div className={`hm-fan-card__status${fan.status === 'ok' ? ' hm-fan-card__status--ok' : ' hm-fan-card__status--err'}`}>
                  {fan.status === 'ok' ? 'OK' : fan.status.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
