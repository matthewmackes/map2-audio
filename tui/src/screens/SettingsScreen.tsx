import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { servicesApi, systemApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'

export function SettingsScreen() {
  const load = useCallback(async () => {
    const [realtime, branding, services] = await Promise.all([
      systemApi.getRealtimeStatus(),
      systemApi.getBrandingStatus(),
      servicesApi.getSummary(),
    ])
    return { realtime, branding, services }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading settings" />
  }
  if (error) {
    return <BoxPanel title="Settings"><Text color="red">{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="Realtime">
        <Text>Grade: {data.realtime.summary.grade} | Passed: {data.realtime.summary.passed} / {data.realtime.summary.total}</Text>
        <Text>Warnings: {data.realtime.summary.warnings} | Failed: {data.realtime.summary.failed}</Text>
      </BoxPanel>
      <BoxPanel title="Branding">
        <Text>Installed: {data.branding.installed ? 'Yes' : 'No'} | Source available: {data.branding.source_available ? 'Yes' : 'No'}</Text>
        <Text>Branding dir: {data.branding.branding_dir}</Text>
      </BoxPanel>
      <BoxPanel title="Service Posture">
        <Text>Healthy services: {data.services.healthy_services} / {data.services.total_services}</Text>
        <Text>Health score: {data.services.health_percentage.toFixed(1)}%</Text>
      </BoxPanel>
    </Box>
  )
}
