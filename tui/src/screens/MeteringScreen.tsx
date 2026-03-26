import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { audioApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { Spinner } from '../components/Spinner'
import { VuMeter } from '../components/VuMeter'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

export function MeteringScreen() {
  const load = useCallback(async () => {
    const [status, levels] = await Promise.all([audioApi.getStatus(), audioApi.getLevels()])
    return { status, levels }
  }, [])

  const { data, error, loading } = usePollingResource(load, 750)

  if (loading && !data) {
    return <Spinner label="Loading meters" />
  }

  if (error) {
    return <BoxPanel title="Metering"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="Input / Output Meters">
        <VuMeter label="In L" level={data.levels.input_left ?? 0} />
        <VuMeter label="In R" level={data.levels.input_right ?? 0} />
        <VuMeter label="Out L" level={data.levels.output_left ?? 0} />
        <VuMeter label="Out R" level={data.levels.output_right ?? 0} />
        <Text color={oledPalette.muted}>Audio ready: {(data.status as { audio_running?: boolean; running?: boolean }).audio_running ?? (data.status as { running?: boolean }).running ? 'Yes' : 'No'}</Text>
      </BoxPanel>
    </Box>
  )
}
