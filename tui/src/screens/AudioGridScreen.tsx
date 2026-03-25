import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { chainsApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'
import { truncateLabel } from '../utils/formatters'

export function AudioGridScreen() {
  const { data, error, loading } = usePollingResource(useCallback(() => chainsApi.list(), []), 5000)

  if (loading && !data) {
    return <Spinner label="Loading chains" />
  }

  if (error) {
    return <BoxPanel title="Audio Grid"><Text color="red">{error}</Text></BoxPanel>
  }

  if (!data) {
    return null
  }

  const activeChain = data.chains.find((chain) => chain.is_active) ?? data.chains[0]
  const chainRows = data.chains.map((chain) => [chain.is_active ? '●' : '○', chain.name, String(chain.plugins.length)])
  const flow = activeChain?.plugins.map((plugin) => `[${truncateLabel(plugin.name || plugin.uri, 18)}]`).join(' → ') ?? 'No plugins loaded'

  return (
    <Box flexDirection="column">
      <BoxPanel title="Signal Flow">
        <Text>{flow}</Text>
      </BoxPanel>
      <BoxPanel title="Chains">
        <DataTable columns={['A', 'Chain', 'Plugins']} rows={chainRows} />
      </BoxPanel>
    </Box>
  )
}
