import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { tesiraApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'

export function TesiraScreen() {
  const load = useCallback(async () => {
    const [fleet, devices] = await Promise.all([tesiraApi.getFleetHealth(), tesiraApi.listDevices()])
    return { fleet, devices }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading Tesira fleet" />
  }
  if (error) {
    return <BoxPanel title="Tesira"><Text color="red">{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="Fleet Health">
        <Text>Status: {data.fleet.status}</Text>
        <Text>Connected devices: {data.fleet.connected_devices} / {data.fleet.total_devices}</Text>
      </BoxPanel>
      <BoxPanel title="Devices">
        <DataTable columns={['Host', 'Conn', 'Transport']} rows={data.devices.slice(0, 8).map((device) => [device.host ?? 'n/a', device.connected ? 'up' : 'down', device.transport ?? 'n/a'])} />
      </BoxPanel>
    </Box>
  )
}
