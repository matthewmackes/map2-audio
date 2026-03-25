import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { screenRegistry, screenRegistryById } from './navigation/screenRegistry'
import { useScreenRouter } from './hooks/useScreenRouter'
import { useStatusBar } from './hooks/useStatusBar'
import { useTerminalSize } from './hooks/useTerminalSize'
import { AppShell } from './shell/AppShell'
import { CommandPalette } from './shell/CommandPalette'
import { HelpOverlay } from './shell/HelpOverlay'
import { HomeScreen } from './screens/HomeScreen'
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
  if (router.current.id === 'home') {
    body = <HomeScreen />
  } else {
    body = <PlaceholderScreen title={screen.title} description={screen.description} />
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
