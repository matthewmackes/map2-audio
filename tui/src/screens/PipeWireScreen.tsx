import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { pipewireApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

export function PipeWireScreen() {
  const load = useCallback(async () => {
    const [status, devices, streams] = await Promise.all([
      pipewireApi.getStatus(),
      pipewireApi.getDevices(),
      pipewireApi.getStreams(),
    ])
    return { status, devices, streams }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading PipeWire" />
  }

  if (error) {
    return <BoxPanel title="PipeWire"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="Daemon">
        <Text>Running: {data.status.daemon.running ? 'Yes' : 'No'} | Version: {data.status.daemon.version}</Text>
        <Text>Clock: {data.status.settings.clock_rate} Hz @ {data.status.settings.clock_quantum} samples</Text>
        <Text>Default sink: {data.status.default_sink?.name ?? 'n/a'}</Text>
        <Text>Default source: {data.status.default_source?.name ?? 'n/a'}</Text>
      </BoxPanel>
      <BoxPanel title="Devices">
        <DataTable columns={['ID', 'Name', 'Driver']} rows={data.devices.devices.slice(0, 8).map((device) => [device.id, device.name, device.driver || 'n/a'])} />
      </BoxPanel>
      <BoxPanel title="Streams">
        <DataTable columns={['ID', 'Client', 'Media']} rows={data.streams.streams.slice(0, 8).map((stream) => [stream.id, stream.client_name, stream.media_name || 'n/a'])} />
      </BoxPanel>
    </Box>
  )
}
