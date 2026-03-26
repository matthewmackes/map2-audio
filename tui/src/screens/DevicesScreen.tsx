import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { midiApi, usbApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

export function DevicesScreen() {
  const load = useCallback(async () => {
    const [midiDevices, usbDevices] = await Promise.all([midiApi.getDevices(), usbApi.getDevices()])
    return { midiDevices, usbDevices }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading devices" />
  }

  if (error) {
    return <BoxPanel title="Devices"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  const midiRows = [
    ...data.midiDevices.inputs.map((device, index) => [index, device.name, 'input']),
    ...data.midiDevices.outputs.map((device, index) => [index, device.name, 'output']),
  ]

  return (
    <Box flexDirection="column">
      <BoxPanel title="USB Audio">
        <Text>Hotone/Jogg detected: {data.usbDevices.hotone_detected ? 'Yes' : 'No'}</Text>
        <Text>Primary device: {data.usbDevices.primary_device?.name ?? 'n/a'} ({data.usbDevices.primary_device?.alsa_device ?? 'n/a'})</Text>
        {data.usbDevices.recommendations.map((message) => (
          <Text key={message} color={oledPalette.warning}>{message}</Text>
        ))}
      </BoxPanel>
      <BoxPanel title="MIDI Endpoints">
        <DataTable columns={['Index', 'Name', 'Dir']} rows={midiRows} />
      </BoxPanel>
    </Box>
  )
}
