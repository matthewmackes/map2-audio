import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { chainsApi, healthApi, midiApi, systemApi } from '../../../web/src/map2/api'
import { Badge } from '../components/Badge'
import { BoxPanel } from '../components/BoxPanel'
import { ProgressBar } from '../components/ProgressBar'
import { Spinner } from '../components/Spinner'
import { StatusDot } from '../components/StatusDot'

interface HomeSnapshot {
  healthStatus: string
  cpuUsagePercent: number
  memoryUsagePercent: number
  activeChainName: string
  deviceCount: number
}

export function HomeScreen() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const [health, overview, chains, midiDevices] = await Promise.all([
          healthApi.check(),
          systemApi.getHealthOverview(),
          chainsApi.list(),
          midiApi.getDevices(),
        ])

        if (!active) {
          return
        }

        const activeChain = chains.chains.find((chain) => chain.is_active) ?? chains.chains[0]
        setSnapshot({
          healthStatus: health.status,
          cpuUsagePercent: overview.cpu_usage_percent ?? 0,
          memoryUsagePercent: overview.memory_usage_percent ?? 0,
          activeChainName: activeChain?.name ?? 'No active chain',
          deviceCount: (midiDevices.inputs?.length ?? 0) + (midiDevices.outputs?.length ?? 0),
        })
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }
    }

    void load()
    const timer = setInterval(() => {
      void load()
    }, 5000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  if (error) {
    return (
      <BoxPanel title="Home">
        <Text color="red">Failed to load dashboard: {error}</Text>
      </BoxPanel>
    )
  }

  if (!snapshot) {
    return <Spinner label="Loading home screen" />
  }

  const healthTone = snapshot.healthStatus === 'healthy' ? 'ok' : snapshot.healthStatus === 'warning' ? 'warn' : 'error'

  return (
    <Box flexDirection="column">
      <BoxPanel title="System Summary">
        <Text>
          <StatusDot status={healthTone} /> API health <Badge label={snapshot.healthStatus} color={healthTone === 'ok' ? 'green' : healthTone === 'warn' ? 'yellow' : 'red'} />
        </Text>
        <ProgressBar label="CPU" value={snapshot.cpuUsagePercent / 100} />
        <ProgressBar label="RAM" value={snapshot.memoryUsagePercent / 100} />
      </BoxPanel>

      <BoxPanel title="Current Rig">
        <Text>Active chain: {snapshot.activeChainName}</Text>
        <Text>Connected MIDI endpoints: {snapshot.deviceCount}</Text>
      </BoxPanel>

      <BoxPanel title="Quick Navigation">
        <Text color="gray">1 Home  2 Meters  3 CPU  4 Grid  5 PipeWire  6 MIDI  7 Devices  8 MPX1  9 Cluster</Text>
      </BoxPanel>
    </Box>
  )
}
