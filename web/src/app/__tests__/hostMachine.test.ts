/**
 * Host Machine Page - Test Suite
 * Comprehensive testing for hooks, components, and integrations
 */

import { renderHook, act } from '@testing-library/react'
import type { HistoricalMetric, HealthThresholds, HealthAlert } from '@/app/hooks/useHealthMonitoring'
import {
  useHealthMonitoring,
  useHealthAlarms,
  useMetricsHistory,
  DEFAULT_THRESHOLDS,
} from '@/app/hooks/useHealthMonitoring'
import {
  usePersistedThresholds,
  usePersistedAlertHistory,
  usePersistedPreferences,
} from '@/app/hooks/useLocalStorage'

// Mock data generators
const createMockHealthOverview = (overrides?: any) => ({
  cpu_temp_celsius: 45.5,
  max_temp_celsius: 52.0,
  cpu_usage_percent: 30,
  memory_usage_percent: 55,
  ...overrides,
})

const createMockDiskHealth = (overrides?: any) => ({
  disks: [
    {
      device: '/dev/sda',
      size_mb: 256000,
      used_mb: 180000,
      available_mb: 76000,
      use_percent: 70.3,
      overall_health: 'good',
    },
  ],
  ...overrides,
})

// Test Suites

describe('useMetricsHistory Hook', () => {
  it('should initialize with empty metrics', () => {
    const { result } = renderHook(() => useMetricsHistory(10))
    expect(result.current.getMetrics()).toEqual([])
  })

  it('should add metrics to history', () => {
    const { result } = renderHook(() => useMetricsHistory(10))
    const health = createMockHealthOverview()
    const disk = createMockDiskHealth()

    act(() => {
      result.current.addMetric(health, disk)
    })

    const metrics = result.current.getMetrics()
    expect(metrics.length).toBe(1)
    expect(metrics[0].cpuTemp).toBe(45.5)
  })

  it('should respect max size limit', () => {
    const { result } = renderHook(() => useMetricsHistory(5))
    const health = createMockHealthOverview()
    const disk = createMockDiskHealth()

    // Add 10 metrics
    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.addMetric(health, disk)
      })
    }

    // Should only keep 5
    const metrics = result.current.getMetrics()
    expect(metrics.length).toBe(5)
  })

  it('should calculate statistics correctly', () => {
    const { result } = renderHook(() => useMetricsHistory(10))

    // Add multiple metrics with varying temps
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.addMetric(
          createMockHealthOverview({ cpu_temp_celsius: 40 + i * 2 }),
          createMockDiskHealth()
        )
      })
    }

    const stats = result.current.getMetricStats(Infinity)
    expect(stats).not.toBeNull()
    expect(stats!.temperature.avg).toBeGreaterThan(0)
    expect(stats!.temperature.min).toBeLessThan(stats!.temperature.max)
  })

  it('should clear history', () => {
    const { result } = renderHook(() => useMetricsHistory(10))
    const health = createMockHealthOverview()
    const disk = createMockDiskHealth()

    act(() => {
      result.current.addMetric(health, disk)
    })

    expect(result.current.getMetrics().length).toBeGreaterThan(0)

    act(() => {
      result.current.clearHistory()
    })

    expect(result.current.getMetrics().length).toBe(0)
  })
})

describe('useHealthAlarms Hook', () => {
  it('should not generate alerts when within thresholds', () => {
    const { result } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const health = createMockHealthOverview({ cpu_temp_celsius: 50 })
    const disk = createMockDiskHealth({ disks: [{ ...createMockDiskHealth().disks[0], use_percent: 50 }] })

    let alerts = [] as HealthAlert[]
    act(() => {
      alerts = result.current.checkHealth(health, disk)
    })

    expect(alerts).toEqual([])
  })

  it('should generate warning alert when threshold exceeded', () => {
    const { result } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const health = createMockHealthOverview({ cpu_temp_celsius: 72 }) // Above warning of 70
    const disk = createMockDiskHealth()

    let alerts = [] as HealthAlert[]
    act(() => {
      alerts = result.current.checkHealth(health, disk)
    })

    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0].severity).toBe('warning')
  })

  it('should generate critical alert when critical threshold exceeded', () => {
    const { result } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const health = createMockHealthOverview({ cpu_temp_celsius: 87 }) // Above critical of 85
    const disk = createMockDiskHealth()

    let alerts = [] as HealthAlert[]
    act(() => {
      alerts = result.current.checkHealth(health, disk)
    })

    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0].severity).toBe('critical')
  })

  it('should acknowledge alerts', () => {
    const { result } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const health = createMockHealthOverview({ cpu_temp_celsius: 72 })
    const disk = createMockDiskHealth()

    let alerts = [] as HealthAlert[]
    act(() => {
      alerts = result.current.checkHealth(health, disk)
    })

    if (alerts.length > 0) {
      act(() => {
        result.current.acknowledgeAlert(alerts[0].id)
      })

      const activeAlerts = result.current.getActiveAlerts()
      expect(activeAlerts.find((a) => a.id === alerts[0].id)).toBeUndefined()
    }
  })

  it('should filter critical alerts', () => {
    const { result } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const health = createMockHealthOverview({ cpu_temp_celsius: 87 })
    const disk = createMockDiskHealth()

    act(() => {
      result.current.checkHealth(health, disk)
    })

    const critical = result.current.getCriticalAlerts()
    expect(critical.length).toBeGreaterThan(0)
    expect(critical.every((a) => a.severity === 'critical')).toBe(true)
  })
})

describe('useHealthMonitoring Hook', () => {
  it('should combine history and alarms', () => {
    const { result } = renderHook(() => useHealthMonitoring(10))

    expect(result.current.history.getMetrics).toBeDefined()
    expect(result.current.alarms.checkHealth).toBeDefined()
  })

  it('should track metrics and generate alerts simultaneously', () => {
    const { result } = renderHook(() => useHealthMonitoring(10))
    const health = createMockHealthOverview({ cpu_temp_celsius: 87 })
    const disk = createMockDiskHealth()

    let alerts = [] as HealthAlert[]
    act(() => {
      result.current.history.addMetric(health, disk)
      alerts = result.current.alarms.checkHealth(health, disk)
    })

    expect(result.current.history.getMetrics().length).toBe(1)
    expect(alerts.length).toBeGreaterThan(0)
  })
})

describe('usePersistedThresholds Hook', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should load from localStorage if available', () => {
    const customThresholds = { ...DEFAULT_THRESHOLDS, temperatureWarning: 75 }
    localStorage.setItem('host_machine_health_settings', JSON.stringify(customThresholds))

    const { result } = renderHook(() => usePersistedThresholds(DEFAULT_THRESHOLDS))

    // Should load custom thresholds
    expect(result.current.thresholds.temperatureWarning).toBe(75)
  })

  it('should save thresholds to localStorage', () => {
    const { result } = renderHook(() => usePersistedThresholds(DEFAULT_THRESHOLDS))
    const newThresholds = { ...DEFAULT_THRESHOLDS, temperatureCritical: 80 }

    act(() => {
      result.current.saveThresholds(newThresholds)
    })

    const stored = JSON.parse(localStorage.getItem('host_machine_health_settings') || '{}')
    expect(stored.temperatureCritical).toBe(80)
  })

  it('should reset to defaults', () => {
    const { result } = renderHook(() => usePersistedThresholds(DEFAULT_THRESHOLDS))

    act(() => {
      result.current.saveThresholds({ ...DEFAULT_THRESHOLDS, temperatureWarning: 75 })
    })

    act(() => {
      result.current.resetThresholds()
    })

    expect(result.current.thresholds.temperatureWarning).toBe(DEFAULT_THRESHOLDS.temperatureWarning)
  })
})

describe('usePersistedAlertHistory Hook', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should add and retrieve alerts', () => {
    const { result } = renderHook(() => usePersistedAlertHistory(10))

    const alert: HealthAlert = {
      id: 'test-1',
      type: 'temperature',
      severity: 'warning',
      message: 'High temperature',
      timestamp: Date.now(),
      value: 75,
      threshold: 70,
    }

    act(() => {
      result.current.addAlert(alert)
    })

    expect(result.current.alerts.length).toBe(1)
    expect(result.current.alerts[0].id).toBe('test-1')
  })

  it('should respect max alerts limit', () => {
    const { result } = renderHook(() => usePersistedAlertHistory(5))

    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.addAlert({
          id: `alert-${i}`,
          type: 'temperature',
          severity: 'warning',
          message: 'Test',
          timestamp: Date.now() + i,
          value: 75,
          threshold: 70,
        })
      })
    }

    expect(result.current.alerts.length).toBe(5)
  })

  it('should clear history', () => {
    const { result } = renderHook(() => usePersistedAlertHistory(10))

    act(() => {
      result.current.addAlert({
        id: 'test-1',
        type: 'temperature',
        severity: 'warning',
        message: 'Test',
        timestamp: Date.now(),
        value: 75,
        threshold: 70,
      })
    })

    expect(result.current.alerts.length).toBeGreaterThan(0)

    act(() => {
      result.current.clearHistory()
    })

    expect(result.current.alerts.length).toBe(0)
  })
})

describe('usePersistedPreferences Hook', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should have default preferences on first load', () => {
    const { result } = renderHook(() => usePersistedPreferences())

    expect(result.current.preferences.autoRefresh).toBe(true)
    expect(result.current.preferences.useWebSocket).toBe(true)
  })

  it('should save and load preferences', () => {
    const { result: result1 } = renderHook(() => usePersistedPreferences())

    act(() => {
      result1.current.savePreferences({ autoRefresh: false })
    })

    // New hook instance should load saved preferences
    const { result: result2 } = renderHook(() => usePersistedPreferences())

    expect(result2.current.preferences.autoRefresh).toBe(false)
  })

  it('should reset preferences to defaults', () => {
    const { result } = renderHook(() => usePersistedPreferences())

    act(() => {
      result.current.savePreferences({ darkMode: true })
    })

    expect(result.current.preferences.darkMode).toBe(true)

    act(() => {
      result.current.resetPreferences()
    })

    expect(result.current.preferences.darkMode).toBe(false)
  })
})

describe('Integration Tests', () => {
  it('should integrate metrics history with thresholds and alarms', () => {
    const { result: historyResult } = renderHook(() => useMetricsHistory(10))
    const { result: alarmsResult } = renderHook(() => useHealthAlarms(DEFAULT_THRESHOLDS))
    const { result: prefsResult } = renderHook(() => usePersistedPreferences())

    const criticalHealth = createMockHealthOverview({ cpu_temp_celsius: 87 })
    const disk = createMockDiskHealth()

    // Track metric
    act(() => {
      historyResult.current.addMetric(criticalHealth, disk)
    })

    // Check for alerts
    let alerts = [] as HealthAlert[]
    act(() => {
      alerts = alarmsResult.current.checkHealth(criticalHealth, disk)
    })

    // Verify integration
    expect(historyResult.current.getMetrics().length).toBe(1)
    expect(alerts.length).toBeGreaterThan(0)
    expect(prefsResult.current.preferences.autoRefresh).toBe(true)
  })
})
