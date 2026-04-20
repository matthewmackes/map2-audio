/**
 * Metrics History Tracking
 * Stores and manages historical system metrics for analysis and visualization
 */

import { useCallback, useRef } from 'react';
import type { SystemHealthOverview, DiskHealthData, DiskInfo } from '@/map2/types';

export interface HistoricalMetric {
  timestamp: number;
  cpuTemp: number;
  maxTemp: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number[];
}

export interface MetricsHistory {
  metrics: HistoricalMetric[];
  maxSize: number;
  interval: number;
}

/**
 * Hook for tracking metrics history with circular buffer
 * Stores up to maxSize entries, automatically removes oldest when full
 */
export function useMetricsHistory(maxSize: number = 360) {
  const historyRef = useRef<MetricsHistory>({
    metrics: [],
    maxSize,
    interval: 5000, // Default 5 second intervals
  });

  const addMetric = useCallback(
    (healthOverview: SystemHealthOverview | undefined, diskHealth: DiskHealthData | undefined) => {
      if (!healthOverview) return;

      const newMetric: HistoricalMetric = {
        timestamp: Date.now(),
        cpuTemp: healthOverview.cpu_temp_celsius,
        maxTemp: healthOverview.max_temp_celsius,
        cpuUsage: healthOverview.cpu_usage_percent,
        memoryUsage: healthOverview.memory_usage_percent,
        diskUsage: diskHealth?.disks?.map((d) => d.use_percent) || [],
      };

      const metrics = historyRef.current.metrics;

      // Add new metric
      metrics.push(newMetric);

      // Remove oldest if exceeds max size
      if (metrics.length > maxSize) {
        metrics.shift();
      }

      return newMetric;
    },
    [maxSize]
  );

  const getMetrics = useCallback(() => {
    return historyRef.current.metrics;
  }, []);

  const getMetricStats = useCallback((timeWindowMs: number = 3600000) => {
    // Default 1 hour
    const now = Date.now();
    const filtered = historyRef.current.metrics.filter((m) => now - m.timestamp <= timeWindowMs);

    if (filtered.length === 0) {
      return null;
    }

    const temps = filtered.map((m) => m.cpuTemp);
    const cpuUsages = filtered.map((m) => m.cpuUsage);
    const memUsages = filtered.map((m) => m.memoryUsage);

    return {
      temperature: {
        current: filtered[filtered.length - 1].cpuTemp,
        min: Math.min(...temps),
        max: Math.max(...temps),
        avg: temps.reduce((a, b) => a + b) / temps.length,
      },
      cpu: {
        current: filtered[filtered.length - 1].cpuUsage,
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        avg: cpuUsages.reduce((a, b) => a + b) / cpuUsages.length,
      },
      memory: {
        current: filtered[filtered.length - 1].memoryUsage,
        min: Math.min(...memUsages),
        max: Math.max(...memUsages),
        avg: memUsages.reduce((a, b) => a + b) / memUsages.length,
      },
      timeWindowMs,
      dataPoints: filtered.length,
    };
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current.metrics = [];
  }, []);

  return {
    addMetric,
    getMetrics,
    getMetricStats,
    clearHistory,
    historyRef: historyRef.current,
  };
}

/**
 * Hook for managing health thresholds and alarms
 */
export interface HealthThresholds {
  temperatureWarning: number;
  temperatureCritical: number;
  cpuUsageWarning: number;
  cpuUsageCritical: number;
  memoryUsageWarning: number;
  memoryUsageCritical: number;
  diskUsageWarning: number;
  diskUsageCritical: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  temperatureWarning: 70,
  temperatureCritical: 85,
  cpuUsageWarning: 75,
  cpuUsageCritical: 90,
  memoryUsageWarning: 75,
  memoryUsageCritical: 90,
  diskUsageWarning: 80,
  diskUsageCritical: 95,
};

export interface HealthAlert {
  id: string;
  type: 'temperature' | 'cpu' | 'memory' | 'disk';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  value: number;
  threshold: number;
}

type FlatDiskHealth = { device: string; use_percent: number; overall_health?: string }

function diskDisplayName(disk: DiskInfo): string {
  return disk.name || disk.mount_point || 'Disk'
}

function flatDiskHealthToDiskInfo(diskHealth: FlatDiskHealth): DiskInfo {
  return {
    name: diskHealth.device,
    model: '',
    size_gb: 0,
    health_status: diskHealth.overall_health ?? 'unknown',
    temperature_c: null,
    used_percent: diskHealth.use_percent,
    smart_status: 'unknown',
    reallocated_sectors: 0,
    uncorrectable_errors: 0,
    power_on_hours: 0,
    estimated_lifespan_percent: 0,
    use_percent: diskHealth.use_percent,
  }
}

export function useHealthAlarms(thresholds: HealthThresholds = DEFAULT_THRESHOLDS) {
  const alertsRef = useRef<HealthAlert[]>([]);
  const acknowledgedRef = useRef<Set<string>>(new Set());

  const checkHealth = useCallback(
    (healthOverview: SystemHealthOverview | undefined, diskHealth: DiskHealthData | undefined) => {
      const newAlerts: HealthAlert[] = [];

      if (!healthOverview) return newAlerts;

      // Temperature checks
      if (healthOverview.cpu_temp_celsius >= thresholds.temperatureCritical) {
        newAlerts.push({
          id: `temp-critical-${Date.now()}`,
          type: 'temperature',
          severity: 'critical',
          message: `Critical: CPU temperature ${healthOverview.cpu_temp_celsius}°C exceeds ${thresholds.temperatureCritical}°C`,
          timestamp: Date.now(),
          value: healthOverview.cpu_temp_celsius,
          threshold: thresholds.temperatureCritical,
        });
      } else if (healthOverview.cpu_temp_celsius >= thresholds.temperatureWarning) {
        newAlerts.push({
          id: `temp-warning-${Date.now()}`,
          type: 'temperature',
          severity: 'warning',
          message: `Warning: CPU temperature ${healthOverview.cpu_temp_celsius}°C exceeds ${thresholds.temperatureWarning}°C`,
          timestamp: Date.now(),
          value: healthOverview.cpu_temp_celsius,
          threshold: thresholds.temperatureWarning,
        });
      }

      // CPU usage checks
      if (healthOverview.cpu_usage_percent >= thresholds.cpuUsageCritical) {
        newAlerts.push({
          id: `cpu-critical-${Date.now()}`,
          type: 'cpu',
          severity: 'critical',
          message: `Critical: CPU usage ${healthOverview.cpu_usage_percent.toFixed(1)}% exceeds ${thresholds.cpuUsageCritical}%`,
          timestamp: Date.now(),
          value: healthOverview.cpu_usage_percent,
          threshold: thresholds.cpuUsageCritical,
        });
      } else if (healthOverview.cpu_usage_percent >= thresholds.cpuUsageWarning) {
        newAlerts.push({
          id: `cpu-warning-${Date.now()}`,
          type: 'cpu',
          severity: 'warning',
          message: `Warning: CPU usage ${healthOverview.cpu_usage_percent.toFixed(1)}% exceeds ${thresholds.cpuUsageWarning}%`,
          timestamp: Date.now(),
          value: healthOverview.cpu_usage_percent,
          threshold: thresholds.cpuUsageWarning,
        });
      }

      // Memory usage checks
      if (healthOverview.memory_usage_percent >= thresholds.memoryUsageCritical) {
        newAlerts.push({
          id: `mem-critical-${Date.now()}`,
          type: 'memory',
          severity: 'critical',
          message: `Critical: Memory usage ${healthOverview.memory_usage_percent.toFixed(1)}% exceeds ${thresholds.memoryUsageCritical}%`,
          timestamp: Date.now(),
          value: healthOverview.memory_usage_percent,
          threshold: thresholds.memoryUsageCritical,
        });
      } else if (healthOverview.memory_usage_percent >= thresholds.memoryUsageWarning) {
        newAlerts.push({
          id: `mem-warning-${Date.now()}`,
          type: 'memory',
          severity: 'warning',
          message: `Warning: Memory usage ${healthOverview.memory_usage_percent.toFixed(1)}% exceeds ${thresholds.memoryUsageWarning}%`,
          timestamp: Date.now(),
          value: healthOverview.memory_usage_percent,
          threshold: thresholds.memoryUsageWarning,
        });
      }

      // Disk usage checks
      if (diskHealth?.disks) {
        diskHealth.disks.forEach((disk) => {
          const label = diskDisplayName(disk);
          if (disk.use_percent >= thresholds.diskUsageCritical) {
            newAlerts.push({
              id: `disk-critical-${label}-${Date.now()}`,
              type: 'disk',
              severity: 'critical',
              message: `Critical: ${label} usage ${disk.use_percent.toFixed(1)}% exceeds ${thresholds.diskUsageCritical}%`,
              timestamp: Date.now(),
              value: disk.use_percent,
              threshold: thresholds.diskUsageCritical,
            });
          } else if (disk.use_percent >= thresholds.diskUsageWarning) {
            newAlerts.push({
              id: `disk-warning-${label}-${Date.now()}`,
              type: 'disk',
              severity: 'warning',
              message: `Warning: ${label} usage ${disk.use_percent.toFixed(1)}% exceeds ${thresholds.diskUsageWarning}%`,
              timestamp: Date.now(),
              value: disk.use_percent,
              threshold: thresholds.diskUsageWarning,
            });
          }
        });
      }

      // Add new alerts
      newAlerts.forEach((alert) => {
        alertsRef.current.push(alert);
      });

      return newAlerts;
    },
    [thresholds]
  );

  const getActiveAlerts = useCallback(() => {
    return alertsRef.current.filter((alert) => !acknowledgedRef.current.has(alert.id));
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    acknowledgedRef.current.add(alertId);
  }, []);

  const clearAlerts = useCallback(() => {
    alertsRef.current = [];
    acknowledgedRef.current.clear();
  }, []);

  const getCriticalAlerts = useCallback(() => {
    return getActiveAlerts().filter((a) => a.severity === 'critical');
  }, [getActiveAlerts]);

  return {
    checkHealth,
    getActiveAlerts,
    getCriticalAlerts,
    acknowledgeAlert,
    clearAlerts,
  };
}

/**
 * Hook combining both history and alarms
 */
export function useHealthMonitoring(
  thresholdsOrMaxHistorySize: HealthThresholds | number = 360,
  maybeMaxHistorySize?: number
) {
  const thresholds =
    typeof thresholdsOrMaxHistorySize === 'object' && thresholdsOrMaxHistorySize !== null
      ? thresholdsOrMaxHistorySize
      : DEFAULT_THRESHOLDS;

  const maxHistorySize =
    typeof maybeMaxHistorySize === 'number'
      ? maybeMaxHistorySize
      : typeof thresholdsOrMaxHistorySize === 'number'
        ? thresholdsOrMaxHistorySize
        : 360;

  const history = useMetricsHistory(maxHistorySize);
  const alarms = useHealthAlarms(thresholds);

  const getMetricStats = (timeWindow: number | 'all' = 3600000) => {
    const stats = history.getMetricStats(timeWindow === 'all' ? Infinity : timeWindow);
    if (!stats) {
      return stats;
    }

    return {
      ...stats,
      temperature: { ...stats.temperature, count: stats.dataPoints },
      cpu: { ...stats.cpu, count: stats.dataPoints },
      memory: { ...stats.memory, count: stats.dataPoints },
    };
  };

  const checkHealth = (
    healthOverview: SystemHealthOverview | undefined,
    diskHealth: DiskHealthData | FlatDiskHealth | undefined
  ) => {
    let normalizedDiskHealth: DiskHealthData | undefined;
    if (diskHealth && typeof diskHealth === 'object' && Array.isArray((diskHealth as DiskHealthData).disks)) {
      normalizedDiskHealth = diskHealth as DiskHealthData;
    } else if (
      diskHealth &&
      typeof diskHealth === 'object' &&
      typeof (diskHealth as { device?: unknown }).device === 'string' &&
      typeof (diskHealth as { use_percent?: unknown }).use_percent === 'number'
    ) {
      normalizedDiskHealth = { disks: [flatDiskHealthToDiskInfo(diskHealth as FlatDiskHealth)] };
    }

    return alarms.checkHealth(healthOverview, normalizedDiskHealth);
  };

  return {
    history,
    alarms,
    // Backward-compatible flat API for legacy callers/tests.
    addMetric: history.addMetric,
    getMetrics: history.getMetrics,
    getMetricStats,
    clearHistory: history.clearHistory,
    checkHealth,
    getActiveAlerts: alarms.getActiveAlerts,
    getCriticalAlerts: alarms.getCriticalAlerts,
    acknowledgeAlert: alarms.acknowledgeAlert,
    clearAlerts: alarms.clearAlerts,
  };
}
