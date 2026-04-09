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
  statusLabel,
  statusTone,
  pendingJobs,
  environment,
  workspace,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  statusLeft: string
  statusRight: string
  terminalColumns: number
  statusLabel: string
  statusTone: 'ok' | 'warn' | 'error' | 'idle'
  pendingJobs: number
  environment: string
  workspace: string
}) {
  return (
    <Box flexDirection="column">
      <Header
        title={title}
        subtitle={subtitle}
        statusLabel={statusLabel}
        statusTone={statusTone}
        pendingJobs={pendingJobs}
        environment={environment}
        workspace={workspace}
      />
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {children}
      </Box>
      <StatusBar left={statusLeft} right={statusRight} columns={terminalColumns} />
    </Box>
  )
}
