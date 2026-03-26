import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { midiApi, midiClusterApi, midiHubApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

export function MidiHubScreen() {
  const load = useCallback(async () => {
    const [engine, hub, cluster] = await Promise.all([
      midiApi.getDevices(),
      midiHubApi.getStatus(),
      midiClusterApi.getSummary(),
    ])
    return { engine, hub, cluster }
  }, [])

  const { data, error, loading } = usePollingResource(load, 3000)

  if (loading && !data) {
    return <Spinner label="Loading MIDI hub" />
  }

  if (error) {
    return <BoxPanel title="MIDI Hub"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  const portCount = typeof data.hub.port_count === 'number' ? data.hub.port_count : 0
  const routeCount = typeof data.hub.route_count === 'number' ? data.hub.route_count : 0
  const clusterEndpoints = typeof data.cluster.endpoint_count === 'number' ? data.cluster.endpoint_count : 0
  const clusterStrategy = typeof data.cluster.clock?.strategy === 'string' ? data.cluster.clock.strategy : 'n/a'
  const ports = Array.isArray(data.hub.ports) ? data.hub.ports : []
  return (
    <Box flexDirection="column">
      <BoxPanel title="Hub Status">
        <Text>Visible endpoints: {(data.engine.inputs?.length ?? 0) + (data.engine.outputs?.length ?? 0)} | Hub running: {data.hub.running ? 'Yes' : 'No'}</Text>
        <Text>Ports: {portCount} | Routes: {routeCount} | Cluster endpoints: {clusterEndpoints}</Text>
        <Text>Cluster clock strategy: {clusterStrategy} | Enabled: {data.cluster.enabled ? 'Yes' : 'No'}</Text>
      </BoxPanel>
      <BoxPanel title="Ports">
        <DataTable
          columns={['Name', 'Dir', 'Kind']}
          rows={ports.slice(0, 8).map((port: { name: string; direction: string; kind: string }) => [port.name, port.direction, port.kind])}
        />
      </BoxPanel>
    </Box>
  )
}
