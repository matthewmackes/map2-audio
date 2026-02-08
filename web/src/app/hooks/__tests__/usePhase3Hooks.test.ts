/**
 * Unit tests for Phase 3 hooks
 * Tests for useHealthMonitoring, useMetricsStream, and localStorage hooks
 */

import { renderHook, act } from '@testing-library/react'
import { useHealthMonitoring } from '@/app/hooks/useHealthMonitoring'
import {
  useHealthSettings,
  useAlertHistory,
  useLocalStorage,
  defaultHealthSettings,
} from '@/app/hooks/useLocalStorage'

describe('useHealthMonitoring', () => {
  it('should initialize with empty metrics', () => {
    const { result } = renderHook(() => useHealthMonitoring())
    const { getMetrics } = result.current

    expect(getMetrics()).toEqual([])
  })

  it('should add metrics to history', () => {
    const { result } = renderHook(() => useHealthMonitoring())
    const { addMetric, getMetrics } = result.current

    act(() => {
      addMetric(
        { cpu_temp_celsius: 65, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 45, overall_health: 'good' }
      )
    })

    const metrics = result.current.getMetrics()
    expect(metrics.length).toBe(1)
    expect(metrics[0].cpuTemp).toBe(65)
  })

  it('should calculate statistics correctly', () => {
    const { result } = renderHook(() => useHealthMonitoring())
    const { addMetric, getMetricStats } = result.current

    act(() => {
      addMetric(
        { cpu_temp_celsius: 60, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 30, overall_health: 'good' }
      )
      addMetric(
        { cpu_temp_celsius: 70, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 40, overall_health: 'good' }
      )
      addMetric(
        { cpu_temp_celsius: 80, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 50, overall_health: 'good' }
      )
    })

    const stats = result.current.getMetricStats('all')
    expect(stats.temperature.min).toBe(60)
    expect(stats.temperature.max).toBe(80)
    expect(stats.temperature.avg).toBeCloseTo(70, 1)
    expect(stats.temperature.count).toBe(3)
  })

  it('should check health and generate alerts', () => {
    const { result } = renderHook(() => useHealthMonitoring({
      temperatureWarning: 70,
      temperatureCritical: 85,
      cpuUsageWarning: 75,
      cpuUsageCritical: 90,
      memoryUsageWarning: 75,
      memoryUsageCritical: 90,
      diskUsageWarning: 80,
      diskUsageCritical: 95,
    }))

    act(() => {
      result.current.checkHealth(
        { cpu_temp_celsius: 80, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 85, overall_health: 'good' }
      )
    })

    const alerts = result.current.getActiveAlerts()
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.some((a) => a.type === 'temperature' && a.severity === 'warning')).toBe(true)
    expect(alerts.some((a) => a.type === 'disk' && a.severity === 'warning')).toBe(true)
  })

  it('should generate critical alerts for severe conditions', () => {
    const { result } = renderHook(() => useHealthMonitoring({
      temperatureWarning: 70,
      temperatureCritical: 85,
      cpuUsageWarning: 75,
      cpuUsageCritical: 90,
      memoryUsageWarning: 75,
      memoryUsageCritical: 90,
      diskUsageWarning: 80,
      diskUsageCritical: 95,
    }))

    act(() => {
      result.current.checkHealth(
        { cpu_temp_celsius: 88, max_temp_celsius: 95, health_status: 'warning' },
        { device: 'sda', use_percent: 96, overall_health: 'warning' }
      )
    })

    const criticalAlerts = result.current.getCriticalAlerts()
    expect(criticalAlerts.length).toBeGreaterThan(0)
    expect(criticalAlerts.every((a) => a.severity === 'critical')).toBe(true)
  })

  it('should acknowledge alerts', () => {
    const { result } = renderHook(() => useHealthMonitoring({
      temperatureWarning: 70,
      temperatureCritical: 85,
      cpuUsageWarning: 75,
      cpuUsageCritical: 90,
      memoryUsageWarning: 75,
      memoryUsageCritical: 90,
      diskUsageWarning: 80,
      diskUsageCritical: 95,
    }))

    act(() => {
      result.current.checkHealth(
        { cpu_temp_celsius: 78, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 50, overall_health: 'good' }
      )
    })

    const alerts = result.current.getActiveAlerts()
    const firstAlertId = alerts[0].id

    act(() => {
      result.current.acknowledgeAlert(firstAlertId)
    })

    const activeAfter = result.current.getActiveAlerts()
    expect(activeAfter.some((a) => a.id === firstAlertId)).toBe(false)
  })

  it('should handle circular buffer overflow', () => {
    const { result } = renderHook(() => useHealthMonitoring(undefined, 10)) // Small buffer for testing

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.addMetric(
          {
            cpu_temp_celsius: 60 + i,
            max_temp_celsius: 95,
            health_status: 'good',
          },
          { device: 'sda', use_percent: 30 + i, overall_health: 'good' }
        )
      }
    })

    const metrics = result.current.getMetrics()
    expect(metrics.length).toBeLessThanOrEqual(10)
  })

  it('should clear history', () => {
    const { result } = renderHook(() => useHealthMonitoring())

    act(() => {
      result.current.addMetric(
        { cpu_temp_celsius: 65, max_temp_celsius: 95, health_status: 'good' },
        { device: 'sda', use_percent: 45, overall_health: 'good' }
      )
    })

    expect(result.current.getMetrics().length).toBe(1)

    act(() => {
      result.current.clearHistory()
    })

    expect(result.current.getMetrics()).toEqual([])
  })
})

describe('useHealthSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('should initialize with default settings', () => {
    const { result } = renderHook(() => useHealthSettings())

    expect(result.current.settings).toEqual(defaultHealthSettings)
  })

  it('should update individual settings', () => {
    const { result } = renderHook(() => useHealthSettings())

    act(() => {
      result.current.updateSettings({ tempWarning: 75 })
    })

    expect(result.current.settings.tempWarning).toBe(75)
    expect(result.current.settings.tempCritical).toBe(defaultHealthSettings.tempCritical)
  })

  it('should reset to defaults', () => {
    const { result } = renderHook(() => useHealthSettings())

    act(() => {
      result.current.updateSettings({ tempWarning: 80, cpuWarning: 85 })
    })

    act(() => {
      result.current.resetToDefaults()
    })

    expect(result.current.settings).toEqual(defaultHealthSettings)
  })

  it('should persist settings to localStorage', () => {
    const { result } = renderHook(() => useHealthSettings())

    act(() => {
      result.current.updateSettings({ tempWarning: 72 })
    })

    const stored = JSON.parse(
      window.localStorage.getItem('host_machine_health_settings') || '{}'
    )
    expect(stored.tempWarning).toBe(72)
  })
})

describe('useAlertHistory', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('should initialize with empty alerts', () => {
    const { result } = renderHook(() => useAlertHistory())

    expect(result.current.alerts).toEqual([])
  })

  it('should add alerts with unique IDs and timestamps', () => {
    const { result } = renderHook(() => useAlertHistory())

    let alertId1: string
    let alertId2: string

    act(() => {
      alertId1 = result.current.addAlert({
        type: 'temperature',
        severity: 'warning',
        value: 75,
        threshold: 70,
        acknowledged: false,
      })
      alertId2 = result.current.addAlert({
        type: 'cpu',
        severity: 'critical',
        value: 92,
        threshold: 90,
        acknowledged: false,
      })
    })

    expect(alertId1).not.toBe(alertId2)
    expect(result.current.alerts.length).toBe(2)
    expect(result.current.alerts[0].timestamp).toBeGreaterThan(0)
  })

  it('should acknowledge alerts', () => {
    const { result } = renderHook(() => useAlertHistory())

    let alertId: string

    act(() => {
      alertId = result.current.addAlert({
        type: 'temperature',
        severity: 'warning',
        value: 75,
        threshold: 70,
        acknowledged: false,
      })
    })

    act(() => {
      result.current.acknowledgeAlert(alertId)
    })

    expect(result.current.alerts[0].acknowledged).toBe(true)
  })

  it('should count unacknowledged alerts', () => {
    const { result } = renderHook(() => useAlertHistory())

    act(() => {
      result.current.addAlert({
        type: 'temperature',
        severity: 'warning',
        value: 75,
        threshold: 70,
        acknowledged: false,
      })
      result.current.addAlert({
        type: 'cpu',
        severity: 'warning',
        value: 78,
        threshold: 75,
        acknowledged: false,
      })
    })

    expect(result.current.getUnacknowledgedCount()).toBe(2)
  })

  it('should count critical alerts', () => {
    const { result } = renderHook(() => useAlertHistory())

    act(() => {
      result.current.addAlert({
        type: 'temperature',
        severity: 'warning',
        value: 75,
        threshold: 70,
        acknowledged: false,
      })
      result.current.addAlert({
        type: 'cpu',
        severity: 'critical',
        value: 92,
        threshold: 90,
        acknowledged: false,
      })
    })

    expect(result.current.getCriticalCount()).toBe(1)
  })

  it('should respect max alerts limit', () => {
    const { result } = renderHook(() => useAlertHistory(5))

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.addAlert({
          type: 'temperature',
          severity: 'warning',
          value: 70 + i,
          threshold: 70,
          acknowledged: false,
        })
      }
    })

    expect(result.current.alerts.length).toBeLessThanOrEqual(5)
  })

  it('should clear acknowledged alerts', () => {
    const { result } = renderHook(() => useAlertHistory())

    let id1: string, id2: string

    act(() => {
      id1 = result.current.addAlert({
        type: 'temperature',
        severity: 'warning',
        value: 75,
        threshold: 70,
        acknowledged: false,
      })
      id2 = result.current.addAlert({
        type: 'cpu',
        severity: 'warning',
        value: 78,
        threshold: 75,
        acknowledged: false,
      })
    })

    act(() => {
      result.current.acknowledgeAlert(id1)
      result.current.clearAcknowledged()
    })

    expect(result.current.alerts.length).toBe(1)
    expect(result.current.alerts[0].id).toBe(id2)
  })
})

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('should save and retrieve values', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

    expect(result.current[0]).toBe('default')

    act(() => {
      result.current[1]('new-value')
    })

    expect(result.current[0]).toBe('new-value')
  })

  it('should handle complex objects', () => {
    const defaultValue = { count: 0, items: [] }
    const { result } = renderHook(() => useLocalStorage('test-obj', defaultValue))

    act(() => {
      result.current[1]({ count: 5, items: ['a', 'b', 'c'] })
    })

    expect(result.current[0].count).toBe(5)
    expect(result.current[0].items).toEqual(['a', 'b', 'c'])
  })

  it('should persist across hook instances', () => {
    const { result: result1 } = renderHook(() => useLocalStorage('test-persist', 'initial'))

    act(() => {
      result1.current[1]('updated')
    })

    const { result: result2 } = renderHook(() => useLocalStorage('test-persist', 'initial'))

    expect(result2.current[0]).toBe('updated')
  })
})
