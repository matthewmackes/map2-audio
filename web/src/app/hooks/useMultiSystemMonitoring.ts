/**
 * useMultiSystemMonitoring Hook - Manage monitoring for multiple host systems
 * Enables side-by-side comparison and aggregated metrics
 */

import { useState, useCallback, useRef } from 'react'
import type { HostMachineInfo, SystemHealthOverview, DiskHealthData } from '@/map2/types'

export interface SystemSnapshot {
  systemId: string
  systemName: string
  hostInfo: HostMachineInfo | null
  health: SystemHealthOverview | null
  disk: DiskHealthData | null
  isConnected: boolean
  lastUpdate: number
  status: 'online' | 'offline' | 'error'
  errorMessage?: string
}

export interface SystemComparison {
  metric: string
  values: Record<string, number>
  unit: string
  highest: { systemId: string; value: number }
  lowest: { systemId: string; value: number }
  average: number
}

export interface MultiSystemStats {
  totalSystems: number
  onlineSystems: number
  offlineSystems: number
  criticalAlerts: number
  warningAlerts: number
  avgCpuUsage: number
  avgMemoryUsage: number
  avgDiskUsage: number
}

/**
 * Hook for managing multiple system monitoring
 */
export function useMultiSystemMonitoring() {
  const [systems, setSystems] = useState<Record<string, SystemSnapshot>>({})
  const updateTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  /**
   * Add or update a system in the monitoring list
   */
  const addSystem = useCallback(
    (systemId: string, systemName: string, initialData?: Partial<SystemSnapshot>) => {
      setSystems((prev) => ({
        ...prev,
        [systemId]: {
          systemId,
          systemName,
          hostInfo: initialData?.hostInfo || null,
          health: initialData?.health || null,
          disk: initialData?.disk || null,
          isConnected: initialData?.isConnected ?? false,
          lastUpdate: Date.now(),
          status: initialData?.status || 'offline',
          errorMessage: initialData?.errorMessage,
        },
      }))
    },
    []
  )

  /**
   * Update system data
   */
  const updateSystem = useCallback(
    (systemId: string, updates: Partial<SystemSnapshot>) => {
      setSystems((prev) => ({
        ...prev,
        [systemId]: {
          ...prev[systemId],
          ...updates,
          lastUpdate: Date.now(),
        },
      }))
    },
    []
  )

  /**
   * Remove a system from monitoring
   */
  const removeSystem = useCallback((systemId: string) => {
    setSystems((prev) => {
      const updated = { ...prev }
      delete updated[systemId]
      return updated
    })
  }, [])

  /**
   * Get all systems
   */
  const getSystems = useCallback(() => Object.values(systems), [systems])

  /**
   * Get a specific system
   */
  const getSystem = useCallback((systemId: string) => systems[systemId], [systems])

  /**
   * Calculate comparison metrics
   */
  const getComparisons = useCallback((): SystemComparison[] => {
    const comparisons: SystemComparison[] = []

    const systemList = Object.values(systems)
    if (systemList.length === 0) return []

    // CPU Usage Comparison
    const cpuValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        cpuValues[sys.systemId] = sys.health.cpu_usage_percent
      }
    })

    if (Object.keys(cpuValues).length > 0) {
      const values = Object.values(cpuValues)
      comparisons.push({
        metric: 'CPU Usage',
        values: cpuValues,
        unit: '%',
        highest: {
          systemId: Object.entries(cpuValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(cpuValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    // Memory Usage Comparison
    const memValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        memValues[sys.systemId] = sys.health.memory_usage_percent
      }
    })

    if (Object.keys(memValues).length > 0) {
      const values = Object.values(memValues)
      comparisons.push({
        metric: 'Memory Usage',
        values: memValues,
        unit: '%',
        highest: {
          systemId: Object.entries(memValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(memValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    // Temperature Comparison
    const tempValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        tempValues[sys.systemId] = sys.health.cpu_temp_celsius
      }
    })

    if (Object.keys(tempValues).length > 0) {
      const values = Object.values(tempValues)
      comparisons.push({
        metric: 'Temperature',
        values: tempValues,
        unit: '°C',
        highest: {
          systemId: Object.entries(tempValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(tempValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    return comparisons
  }, [systems])

  /**
   * Calculate aggregated statistics
   */
  const getStats = useCallback((): MultiSystemStats => {
    const systemList = Object.values(systems)

    const onlineSystems = systemList.filter((s) => s.isConnected).length
    const offlineSystems = systemList.length - onlineSystems

    const healthySystems = systemList.filter((s) => s.health)
    const avgCpuUsage =
      healthySystems.length > 0
        ? healthySystems.reduce((sum, s) => sum + (s.health?.cpu_usage_percent || 0), 0) /
          healthySystems.length
        : 0

    const avgMemoryUsage =
      healthySystems.length > 0
        ? healthySystems.reduce((sum, s) => sum + (s.health?.memory_usage_percent || 0), 0) /
          healthySystems.length
        : 0

    const diskSystems = systemList.filter((s) => s.disk)
    const avgDiskUsage =
      diskSystems.length > 0
        ? diskSystems.reduce((sum, s) => sum + (s.disk?.use_percent || 0), 0) / diskSystems.length
        : 0

    return {
      totalSystems: systemList.length,
      onlineSystems,
      offlineSystems,
      criticalAlerts: 0, // Would be calculated from alert history
      warningAlerts: 0, // Would be calculated from alert history
      avgCpuUsage: Math.round(avgCpuUsage * 10) / 10,
      avgMemoryUsage: Math.round(avgMemoryUsage * 10) / 10,
      avgDiskUsage: Math.round(avgDiskUsage * 10) / 10,
    }
  }, [systems])

  /**
   * Get systems sorted by metric (for ranking)
   */
  const getSystemsRankedBy = useCallback(
    (metric: 'cpu' | 'memory' | 'temperature' | 'disk'): SystemSnapshot[] => {
      const systemList = Object.values(systems)

      return systemList.sort((a, b) => {
        switch (metric) {
          case 'cpu':
            return (b.health?.cpu_usage_percent || 0) - (a.health?.cpu_usage_percent || 0)
          case 'memory':
            return (b.health?.memory_usage_percent || 0) - (a.health?.memory_usage_percent || 0)
          case 'temperature':
            return (b.health?.cpu_temp_celsius || 0) - (a.health?.cpu_temp_celsius || 0)
          case 'disk':
            return (b.disk?.use_percent || 0) - (a.disk?.use_percent || 0)
          default:
            return 0
        }
      })
    },
    [systems]
  )

  /**
   * Export comparison data as CSV
   */
  const exportComparison = useCallback((): string => {
    const comparisons = getComparisons()
    const systemList = Object.values(systems)

    if (systemList.length === 0) return ''

    let csv = 'Multi-System Comparison Report\n'
    csv += `Generated: ${new Date().toLocaleString()}\n\n`

    // Aggregated Stats
    const stats = getStats()
    csv += 'AGGREGATED STATISTICS\n'
    csv += `Total Systems,${stats.totalSystems}\n`
    csv += `Online,${stats.onlineSystems}\n`
    csv += `Offline,${stats.offlineSystems}\n`
    csv += `Avg CPU Usage,${stats.avgCpuUsage}%\n`
    csv += `Avg Memory Usage,${stats.avgMemoryUsage}%\n`
    csv += `Avg Disk Usage,${stats.avgDiskUsage}%\n\n`

    // Comparison Tables
    comparisons.forEach((comparison) => {
      csv += `${comparison.metric} (${comparison.unit})\n`
      csv += 'System,Value,Rank\n'

      const sorted = Object.entries(comparison.values).sort(([, a], [, b]) => b - a)
      sorted.forEach(([systemId, value], index) => {
        const systemName = systemList.find((s) => s.systemId === systemId)?.systemName || systemId
        csv += `${systemName},${value.toFixed(1)},${index + 1}\n`
      })
      csv += `Highest,${comparison.highest.value.toFixed(1)}\n`
      csv += `Lowest,${comparison.lowest.value.toFixed(1)}\n`
      csv += `Average,${comparison.average.toFixed(1)}\n\n`
    })

    return csv
  }, [systems, getComparisons, getStats])

  return {
    systems: getSystems(),
    addSystem,
    updateSystem,
    removeSystem,
    getSystem,
    getComparisons,
    getStats,
    getSystemsRankedBy,
    exportComparison,
  }
}
