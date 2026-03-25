import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { screenRegistry, screenRegistryById } from './navigation/screenRegistry'
import { useScreenRouter } from './hooks/useScreenRouter'
import { useStatusBar } from './hooks/useStatusBar'
import { useTerminalSize } from './hooks/useTerminalSize'
import { AppShell } from './shell/AppShell'
import { CommandPalette } from './shell/CommandPalette'
import { HelpOverlay } from './shell/HelpOverlay'
import { AudioGridScreen } from './screens/AudioGridScreen'
import { ArtifactsScreen } from './screens/ArtifactsScreen'
import { AvbScreen } from './screens/AvbScreen'
import { ClusterScreen } from './screens/ClusterScreen'
import { CpuScreen } from './screens/CpuScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { DevicesScreen } from './screens/DevicesScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MeteringScreen } from './screens/MeteringScreen'
import { MidiHubScreen } from './screens/MidiHubScreen'
import { Mpx1Screen } from './screens/Mpx1Screen'
import { PipeWireScreen } from './screens/PipeWireScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TesiraScreen } from './screens/TesiraScreen'
import type { ScreenId } from './navigation/types'

function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{title}</Text>
      <Text color="gray">{description}</Text>
    </Box>
  )
}

export function App({
  apiBase = 'http://localhost:8080/api',
}: {
  apiBase?: string
}) {
  const router = useScreenRouter('home')
  const terminal = useTerminalSize()
  const [showHelp, setShowHelp] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)

  const filteredScreens = useMemo(
    () => screenRegistry.filter((screen) => `${screen.title} ${screen.description}`.toLowerCase().includes(paletteQuery.toLowerCase())),
    [paletteQuery],
  )

  useInput((input, key) => {
    if (key.ctrl && input === 'p') {
      setShowPalette((current) => !current)
      setShowHelp(false)
      return
    }

    if (input === '?') {
      setShowHelp((current) => !current)
      setShowPalette(false)
      return
    }

    if (key.escape) {
      if (showPalette) {
        setShowPalette(false)
        setPaletteQuery('')
        return
      }
      if (showHelp) {
        setShowHelp(false)
        return
      }
      router.pop()
      return
    }

    if (showPalette) {
      if (key.return) {
        const nextScreen = filteredScreens[paletteIndex]
        if (nextScreen) {
          router.push(nextScreen.id)
          setShowPalette(false)
          setPaletteQuery('')
          setPaletteIndex(0)
        }
        return
      }
      if (input === 'j' || key.downArrow) {
        setPaletteIndex((current) => Math.min(current + 1, Math.max(filteredScreens.length - 1, 0)))
        return
      }
      if (input === 'k' || key.upArrow) {
        setPaletteIndex((current) => Math.max(current - 1, 0))
        return
      }
      if (key.backspace || key.delete) {
        setPaletteQuery((current) => current.slice(0, -1))
        setPaletteIndex(0)
        return
      }
      if (input.length === 1 && !key.ctrl && !key.meta) {
        setPaletteQuery((current) => current + input)
        setPaletteIndex(0)
      }
      return
    }

    const numericIndex = Number.parseInt(input, 10)
    if (!Number.isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= 9) {
      const pinnedScreen = screenRegistry[numericIndex - 1]
      if (pinnedScreen) {
        router.push(pinnedScreen.id)
      }
      return
    }
  })

  const screen = screenRegistryById[router.current.id]
  const status = useStatusBar({
    apiBase,
    currentScreen: screen.title,
    connectionLabel: 'Live backend',
    terminalColumns: terminal.columns,
  })

  let body: React.ReactNode
  switch (router.current.id) {
    case 'home':
      body = <HomeScreen />
      break
    case 'metering':
      body = <MeteringScreen />
      break
    case 'cpu':
      body = <CpuScreen />
      break
    case 'audio-grid':
      body = <AudioGridScreen />
      break
    case 'pipewire':
      body = <PipeWireScreen />
      break
    case 'midi-hub':
      body = <MidiHubScreen />
      break
    case 'devices':
      body = <DevicesScreen />
      break
    case 'mpx1':
      body = <Mpx1Screen />
      break
    case 'cluster':
      body = <ClusterScreen />
      break
    case 'avb':
      body = <AvbScreen />
      break
    case 'tesira':
      body = <TesiraScreen />
      break
    case 'artifacts':
      body = <ArtifactsScreen />
      break
    case 'settings':
      body = <SettingsScreen />
      break
    case 'diagnostics':
      body = <DiagnosticsScreen />
      break
    default:
      body = <PlaceholderScreen title={screen.title} description={screen.description} />
      break
  }

  return (
    <AppShell
      title={`MAP2 / ${screen.title}`}
      subtitle={`Stack depth ${router.stack.length}`}
      statusLeft={status.left}
      statusRight={status.right}
    >
      {showHelp ? <HelpOverlay /> : null}
      {showPalette ? <CommandPalette query={paletteQuery} screens={filteredScreens} activeIndex={paletteIndex} /> : null}
      {body}
    </AppShell>
  )
}
