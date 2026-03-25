import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { historyApi, metricsApi, servicesApi, wwwApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'

export function DiagnosticsScreen() {
  const load = useCallback(async () => {
    const [history, metrics, services, accessLogs] = await Promise.all([
      historyApi.getStatus(),
      metricsApi.getSummary(),
      servicesApi.getStatus(),
      wwwApi.getAccessLogs(5),
    ])
    return { history, metrics, services, accessLogs }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading diagnostics" />
  }
  if (error) {
    return <BoxPanel title="Diagnostics"><Text color="red">{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  const serviceRows = Object.values(data.services.services)
    .slice(0, 6)
    .map((service) => [service.display_name, service.state, service.health?.message || ''])
  const logRows = data.accessLogs.logs.slice(0, 5).map((entry) => [
    entry.timestamp || '',
    entry.method || '',
    entry.path || '',
  ])

  return (
    <Box flexDirection="column">
      <BoxPanel title="History / Metrics">
        <Text>Undo: {data.history.can_undo ? 'Yes' : 'No'} | Redo: {data.history.can_redo ? 'Yes' : 'No'}</Text>
        <Text>Undo stack: {data.history.undo_stack_size} | Redo stack: {data.history.redo_stack_size}</Text>
        <Text>CPU avg/latest: {data.metrics.cpu.avg.toFixed(1)} / {data.metrics.cpu.latest.toFixed(1)}</Text>
        <Text>Memory avg/latest: {data.metrics.memory.avg.toFixed(1)} / {data.metrics.memory.latest.toFixed(1)}</Text>
      </BoxPanel>
      <BoxPanel title="Services">
        <DataTable columns={['Service', 'State', 'Health']} rows={serviceRows} />
      </BoxPanel>
      <BoxPanel title="Access Logs">
        {logRows.length ? <DataTable columns={['Time', 'Method', 'Path']} rows={logRows} /> : <Text color="gray">No recent access logs.</Text>}
      </BoxPanel>
    </Box>
  )
}
