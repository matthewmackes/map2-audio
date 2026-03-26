import React, { useCallback, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { mpx1Api } from '../../../web/src/map2/mpx1Api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { TabBar } from '../components/TabBar'
import { usePollingResource } from '../hooks/usePollingResource'
import { oledPalette } from '../palette'

const tabs = [
  { id: 'panel', label: 'Panel' },
  { id: 'editor', label: 'Editor' },
  { id: 'library', label: 'Library' },
  { id: 'midi', label: 'MIDI Map' },
  { id: 'diag', label: 'Diagnostics' },
] as const

type Mpx1Tab = (typeof tabs)[number]['id']

export function Mpx1Screen() {
  const [activeTab, setActiveTab] = useState<Mpx1Tab>('panel')

  useInput((input) => {
    if (input === '[' || input === 'h') {
      setActiveTab((current) => tabs[(tabs.findIndex((tab) => tab.id === current) + tabs.length - 1) % tabs.length].id)
    }
    if (input === ']' || input === 'l') {
      setActiveTab((current) => tabs[(tabs.findIndex((tab) => tab.id === current) + 1) % tabs.length].id)
    }
  })

  const load = useCallback(async () => {
    const [state, health, programs, midiMaps, diagnostics] = await Promise.all([
      mpx1Api.getState(),
      mpx1Api.getHealth(),
      mpx1Api.getPrograms(),
      mpx1Api.getMidiMaps(),
      mpx1Api.getDiagnostics(5),
    ])
    return { state, health, programs, midiMaps, diagnostics }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading MPX1" />
  }

  if (error) {
    return <BoxPanel title="MPX1"><Text color={oledPalette.danger}>{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  let body: React.ReactNode
  switch (activeTab) {
    case 'panel':
      body = (
        <>
          <Text>Connected: {data.state.connected ? 'Yes' : 'No'} | Program: {data.state.current_program}</Text>
          <Text>Realtime pending: {data.state.pending_realtime_updates} | Input port: {data.state.input_port_index ?? 'n/a'}</Text>
        </>
      )
      break
    case 'editor':
      body = (
        <>
          <Text>Status: {data.health.status} | WS subscribers: {data.health.ws_subscribers}</Text>
          <Text>Shadow path: {data.health.shadow_path}</Text>
        </>
      )
      break
    case 'library':
      body = <DataTable columns={['Program', 'Name', 'Tags']} rows={data.programs.programs.slice(0, 8).map((entry) => [entry.program, entry.name, entry.tags.join(', ')])} />
      break
    case 'midi':
      body = <Text>Stored MIDI maps: {data.midiMaps.count}</Text>
      break
    default:
      body = <DataTable columns={['Type', 'Dir', 'Error']} rows={data.diagnostics.traffic.map((entry) => [String(entry.type), String(entry.direction ?? ''), String(entry.error ?? '')])} />
      break
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="MPX1">
        <TabBar tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))} activeId={activeTab} />
        <Box marginTop={1} flexDirection="column">{body}</Box>
        <Text color={oledPalette.muted}>Use `[` and `]` to switch MPX1 tabs.</Text>
      </BoxPanel>
    </Box>
  )
}
