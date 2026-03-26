import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { cpuMetricsApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { ProgressBar } from '../components/ProgressBar'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'
import { formatMillis, formatPercent } from '../utils/formatters'

export function CpuScreen() {
  const { data, error, loading } = usePollingResource(useCallback(() => cpuMetricsApi.getMetrics(), []), 1500)

  if (loading && !data) {
    return <Spinner label="Loading CPU metrics" />
  }

  if (error) {
    return <BoxPanel title="CPU"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  const pluginRows = Object.entries(data.perPluginPercent ?? {})
    .slice(0, 8)
    .map(([pluginId, percent]) => [pluginId, formatPercent(typeof percent === 'number' ? percent : null)])

  return (
    <Box flexDirection="column">
      <BoxPanel title="Engine Load">
        <ProgressBar label="Total" value={(data.totalCpuPercent ?? 0) / 100} />
        <ProgressBar label="Audio" value={(data.audioCallbackPercent ?? 0) / 100} />
        <ProgressBar label="Headroom" value={(data.headroomPercent ?? 0) / 100} />
        <Text color={oledPalette.muted}>
          Budget {formatMillis(data.budgetMs)} | Callback {formatMillis(data.currentCallbackMs)} | XRuns {data.xrunCount ?? 0}
        </Text>
      </BoxPanel>

      <BoxPanel title="Per-Plugin CPU">
        {pluginRows.length ? <DataTable columns={['Plugin', 'CPU']} rows={pluginRows} /> : <Text color={oledPalette.muted}>No per-plugin CPU samples yet.</Text>}
      </BoxPanel>
    </Box>
  )
}
