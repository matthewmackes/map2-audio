import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { healthApi, servicesApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

export function ClusterScreen() {
  const load = useCallback(async () => {
    const [health, services] = await Promise.all([healthApi.check(), servicesApi.getSummary()])
    return { health, services }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading cluster view" />
  }
  if (error) {
    return <BoxPanel title="Cluster"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  return (
    <BoxPanel title="Cluster / Services">
      <Text>API health: {data.health.status}</Text>
      <Text>Healthy services: {data.services.healthy_services} / {data.services.total_services}</Text>
      <Text>Running: {data.services.by_state.running ?? 0} | Stopped: {data.services.by_state.stopped ?? 0}</Text>
    </BoxPanel>
  )
}
