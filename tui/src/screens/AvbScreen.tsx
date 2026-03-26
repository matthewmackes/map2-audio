import React, { useCallback } from 'react'
import { BoxPanel } from '../components/BoxPanel'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { avbApi } from '../../../web/src/map2/api'
import { Text } from 'ink'
import { oledPalette } from '../palette'

export function AvbScreen() {
  const load = useCallback(async () => {
    const [status, streams] = await Promise.all([avbApi.getStatus(), avbApi.getStreams()])
    return { status, streams }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading AVB" />
  }
  if (error) {
    return <BoxPanel title="AVB"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  return (
    <BoxPanel title="AVB">
      <Text>State: {data.status.state} | Interface: {data.status.interface}</Text>
      <Text>Operational: {data.status.operational ? 'Yes' : 'No'} | PTP: {data.status.ptp?.state ?? 'n/a'}</Text>
      <Text>Streams: {data.streams.streams?.length ?? 0} | Profile: {String(data.status.compatibility?.active_profile ?? 'n/a')}</Text>
    </BoxPanel>
  )
}
