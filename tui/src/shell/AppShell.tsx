import React from 'react'
import { Box, Text } from 'ink'
import { Header } from './Header'
import { StatusBar } from './StatusBar'

export function AppShell({
  title,
  subtitle,
  children,
  statusLeft,
  statusRight,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  statusLeft: string
  statusRight: string
}) {
  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} />
      <Text color="gray">MAP2 Ink TUI preview</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {children}
      </Box>
      <StatusBar left={statusLeft} right={statusRight} />
    </Box>
  )
}
