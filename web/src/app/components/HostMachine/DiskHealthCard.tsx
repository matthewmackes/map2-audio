/**
 * Disk Health Card - SMART Health Monitoring
 */

import { HardDrive, CheckCircle, Warning, WarningCircle } from '@phosphor-icons/react'
import type { DiskHealthData } from '@/map2/types'

interface DiskHealthCardProps {
  diskHealth: DiskHealthData
  nodeId?: string | null
}

function normalizeDiskStatus(raw?: string): 'passing' | 'warning' | 'failing' | 'unknown' {
  if (!raw) return 'unknown'
  const s = raw.toLowerCase()
  if (s === 'excellent' || s === 'good' || s === 'healthy' || s === 'passing') return 'passing'
  if (s === 'warning') return 'warning'
  if (s === 'critical' || s === 'failing' || s === 'failed') return 'failing'
  return 'passing'
}

function statusTone(status: 'passing' | 'warning' | 'failing' | 'unknown') {
  if (status === 'passing') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'failing') return 'danger'
  return 'info'
}

function StatusIcon({ status }: { status: 'passing' | 'warning' | 'failing' | 'unknown' }) {
  if (status === 'passing') return <CheckCircle size={14} weight="duotone" />
  if (status === 'warning') return <WarningCircle size={14} weight="duotone" />
  if (status === 'failing') return <Warning size={14} weight="duotone" />
  return <HardDrive size={14} weight="duotone" />
}

export default function DiskHealthCard({ diskHealth }: DiskHealthCardProps) {
  if (!diskHealth?.disks || diskHealth.disks.length === 0) {
    return <div className="hm-empty">No disk information available</div>
  }

  return (
    <div className="hm-disk-grid">
      {diskHealth.disks.map((disk, idx) => {
        const rawStatus = disk.health_status || diskHealth.overall_health
        const status = normalizeDiskStatus(rawStatus)
        const tone = statusTone(status)
        const usedPct = disk.used_percent ?? disk.use_percent ?? 0
        const usageTone = usedPct > 85 ? 'danger' : usedPct > 75 ? 'warning' : 'success'
        const label = (disk.health_status || diskHealth.overall_health || 'UNKNOWN').toUpperCase()

        return (
          <div key={idx} className="hm-section-card">
            {/* Header */}
            <div className="hm-disk-card__header">
              <div>
                <div className="hm-disk-card__name">
                  <HardDrive size={16} weight="duotone" />
                  {(disk.name || disk.device || 'Unknown').toUpperCase()}
                </div>
                {(disk.mount_point || disk.model) && (
                  <div className="hm-disk-card__sub">
                    {disk.mount_point || disk.model}
                  </div>
                )}
              </div>
              <div className={`hm-badge hm-badge--${tone}`}>
                <StatusIcon status={status} />
                {label}
              </div>
            </div>

            {/* Capacity bar */}
            <div style={{ marginBottom: 16 }}>
              <div className="hm-disk-card__cap-row">
                <span>Capacity</span>
                <span>{usedPct.toFixed(1)}% of {disk.size_gb ?? disk.total_gb ?? '?'} GB used</span>
              </div>
              <div className="hm-progress-track">
                <div
                  className={`hm-progress-fill hm-progress-fill--${usageTone}`}
                  style={{ width: `${Math.min(usedPct, 100)}%` }}
                />
              </div>
            </div>

            {/* SMART metrics */}
            <div className="hm-disk-metrics">
              {disk.temperature_c != null && (
                <div className="hm-disk-metric">
                  <div className="hm-disk-metric__label">Temperature</div>
                  <div className={`hm-disk-metric__value${disk.temperature_c > 50 ? ' hm-disk-metric__value--warn' : ''}`}>
                    {disk.temperature_c}°C
                  </div>
                </div>
              )}
              {disk.smart_status && (
                <div className="hm-disk-metric">
                  <div className="hm-disk-metric__label">SMART</div>
                  <div className={`hm-disk-metric__value${disk.smart_status.includes('PASSED') ? ' hm-disk-metric__value--ok' : ' hm-disk-metric__value--err'}`}>
                    {disk.smart_status.includes('PASSED') ? 'PASSED' : 'FAILED'}
                  </div>
                </div>
              )}
            </div>

            {/* Health indicators */}
            <table className="hm-info-table" style={{ marginTop: 12 }}>
              <tbody>
                {disk.reallocated_sectors !== undefined && (
                  <tr>
                    <td className="hm-info-table__key">Reallocated sectors</td>
                    <td className="hm-info-table__val">
                      {disk.reallocated_sectors}
                      {disk.reallocated_sectors > 10 && (
                        <span style={{ color: 'var(--warning)', marginLeft: 8 }}>monitor closely</span>
                      )}
                    </td>
                  </tr>
                )}
                {disk.uncorrectable_errors !== undefined && (
                  <tr>
                    <td className="hm-info-table__key">Uncorrectable errors</td>
                    <td className="hm-info-table__val">
                      {disk.uncorrectable_errors}
                      {disk.uncorrectable_errors > 0 && (
                        <span style={{ color: 'var(--danger)', marginLeft: 8 }}>critical</span>
                      )}
                    </td>
                  </tr>
                )}
                {disk.power_on_hours !== undefined && (
                  <tr>
                    <td className="hm-info-table__key">Power-on time</td>
                    <td className="hm-info-table__val">
                      {Math.floor(disk.power_on_hours / 24)} days ({disk.power_on_hours} h)
                    </td>
                  </tr>
                )}
                {disk.estimated_lifespan_percent !== undefined && (
                  <tr>
                    <td className="hm-info-table__key">Estimated lifespan</td>
                    <td className="hm-info-table__val">
                      <span style={{ color: disk.estimated_lifespan_percent < 70 ? 'var(--warning)' : 'var(--success)' }}>
                        {disk.estimated_lifespan_percent}%
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
