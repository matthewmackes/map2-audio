/**
 * Disk Health Card - SMART Health Monitoring
 */

import { Tag } from '@carbon/react'
import { DataBase as HardDrive } from '@carbon/icons-react'
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

function statusTagType(status: 'passing' | 'warning' | 'failing' | 'unknown'): 'green' | 'warm-gray' | 'red' | 'gray' {
  if (status === 'passing') return 'green'
  if (status === 'warning') return 'warm-gray'
  if (status === 'failing') return 'red'
  return 'gray'
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
        const usedPct = disk.used_percent ?? disk.use_percent ?? 0
        const usageTone = usedPct > 85 ? 'danger' : usedPct > 75 ? 'warning' : 'success'
        const label = (disk.health_status || diskHealth.overall_health || 'UNKNOWN').toUpperCase()

        return (
          <div key={idx} className="hm-section-card">
            {/* Header */}
            <div className="hm-disk-card__header">
              <div>
                <div className="hm-disk-card__name">
                  <HardDrive size={16} />
                  {(disk.name || disk.device || 'Unknown').toUpperCase()}
                </div>
                {(disk.mount_point || disk.model) && (
                  <div className="hm-disk-card__sub">
                    {disk.mount_point || disk.model}
                  </div>
                )}
              </div>
              <Tag className="hm-status-tag" size="sm" type={statusTagType(status)}>
                {label}
              </Tag>
            </div>

            {/* Capacity bar */}
            <div className="hm-disk-card__capacity">
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
            <table className="hm-info-table hm-disk-card__details">
              <tbody>
                {disk.reallocated_sectors !== undefined && (
                  <tr>
                    <td className="hm-info-table__key">Reallocated sectors</td>
                    <td className="hm-info-table__val">
                      {disk.reallocated_sectors}
                      {disk.reallocated_sectors > 10 && (
                        <span className="hm-disk-card__note hm-disk-card__note--warning">monitor closely</span>
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
                        <span className="hm-disk-card__note hm-disk-card__note--danger">critical</span>
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
                      <span
                        className={`hm-disk-card__lifespan hm-disk-card__lifespan--${
                          disk.estimated_lifespan_percent < 70 ? 'warning' : 'success'
                        }`}
                      >
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
