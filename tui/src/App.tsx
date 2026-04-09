import React, { useMemo, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { clearTerminalCanvas } from './cli'
import { screenRegistry, screenRegistryById } from './navigation/screenRegistry'
import { useScreenRouter } from './hooks/useScreenRouter'
import { useStatusBar } from './hooks/useStatusBar'
import { useTerminalSize } from './hooks/useTerminalSize'
import { oledPalette } from './palette'
import { AppShell } from './shell/AppShell'
import { CommandPalette } from './shell/CommandPalette'
import { buildCommandPaletteEntries, filterCommandPaletteEntries } from './shell/commandPaletteEntries'
import { HelpOverlay } from './shell/HelpOverlay'
import { EmptyState } from './components/EmptyState'
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
    <EmptyState icon="◇" title={title} description={description} action="Open a mapped route or use Ctrl+P for commands." />
  )
}

export function App({
  apiBase = 'http://localhost:8080/api',
  initialScreen = 'home',
}: {
  apiBase?: string
  initialScreen?: ScreenId
}) {
  const { exit } = useApp()
  const router = useScreenRouter(initialScreen)
  const terminal = useTerminalSize()
  const [showHelp, setShowHelp] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const currentScreenIndex = useMemo(
    () => screenRegistry.findIndex((entry) => entry.id === router.current.id),
    [router.current.id],
  )

  const paletteEntries = useMemo(
    () => filterCommandPaletteEntries(buildCommandPaletteEntries(screenRegistry), paletteQuery),
    [paletteQuery],
  )

  const closePalette = (): void => {
    setShowPalette(false)
    setPaletteQuery('')
    setPaletteIndex(0)
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'q') {
      exit()
      return
    }

    if (!showPalette && input.toLowerCase() === 'q') {
      exit()
      return
    }

    if (key.ctrl && input === 'p') {
      setShowPalette((current) => !current)
      setPaletteQuery('')
      setPaletteIndex(0)
      setShowHelp(false)
      return
    }

    if (key.ctrl && input === 'l') {
      clearTerminalCanvas()
      return
    }

    if (input === '?') {
      setShowHelp((current) => !current)
      setShowPalette(false)
      return
    }

    if (key.escape) {
      if (showPalette) {
        closePalette()
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
        const nextEntry = paletteEntries[paletteIndex]
        if (nextEntry?.kind === 'screen') {
          router.replace(nextEntry.screenId)
          closePalette()
        } else if (nextEntry?.kind === 'action') {
          closePalette()
          if (nextEntry.actionId === 'help') {
            setShowHelp(true)
          } else if (nextEntry.actionId === 'clear') {
            clearTerminalCanvas()
          } else if (nextEntry.actionId === 'exit') {
            exit()
          }
        }
        return
      }
      if (input === 'j' || key.downArrow) {
        setPaletteIndex((current) => Math.min(current + 1, Math.max(paletteEntries.length - 1, 0)))
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

    if (input === '[' || input === ']') {
      const offset = input === ']' ? 1 : -1
      const nextIndex = (currentScreenIndex + offset + screenRegistry.length) % screenRegistry.length
      const nextScreen = screenRegistry[nextIndex]
      if (nextScreen) {
        router.replace(nextScreen.id)
      }
      return
    }

    const numericIndex = Number.parseInt(input, 10)
    if (!Number.isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= 9) {
      if (router.current.id === 'home') {
        return
      }
      const pinnedScreen = screenRegistry[numericIndex - 1]
      if (pinnedScreen) {
        router.replace(pinnedScreen.id)
      }
      return
    }
  }, { isActive: true })

  const screen = screenRegistryById[router.current.id]
  const status = useStatusBar({
    apiBase,
    currentScreenId: screen.id,
    currentScreen: screen.title,
    terminalColumns: terminal.columns,
  })
  const environment = process.env.MAP2_ENVIRONMENT ?? 'local'
  const workspace = process.cwd().split('/').filter(Boolean).slice(-1)[0] ?? 'map2'
  const connectionStatusLabel = 'Live backend'
  const connectionStatusTone: 'ok' | 'warn' | 'error' | 'idle' = 'ok'

  let body: React.ReactNode
  switch (router.current.id) {
    case 'home':
      body = <HomeScreen enableLiveHotkeys={!showHelp && !showPalette} />
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
      subtitle={screen.description}
      statusLeft={status.left}
      statusRight={status.right}
      terminalColumns={terminal.columns}
      statusLabel={connectionStatusLabel}
      statusTone={connectionStatusTone}
      pendingJobs={0}
      environment={environment}
      workspace={workspace}
    >
      {showHelp ? <HelpOverlay /> : null}
      {showPalette ? <CommandPalette query={paletteQuery} entries={paletteEntries} activeIndex={paletteIndex} /> : null}
      {body}
    </AppShell>
  )
}
