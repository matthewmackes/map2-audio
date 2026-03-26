import React from 'react'
import { Box } from 'ink'
import { Header } from './Header'
import { StatusBar } from './StatusBar'

export function AppShell({
  title,
  subtitle,
  children,
  statusLeft,
  statusRight,
  terminalColumns,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  statusLeft: string
  statusRight: string
  terminalColumns: number
}) {
  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} />
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {children}
      </Box>
      <StatusBar left={statusLeft} right={statusRight} columns={terminalColumns} />
    </Box>
  )
}
