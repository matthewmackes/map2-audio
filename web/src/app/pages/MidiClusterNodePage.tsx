import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material'
import { ArrowSquareOut, NetworkSlash } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'

import { MidiHubPage } from './MidiHubPage'
import { midiClusterApi, API_BASE } from '../../map2/api'

export function MidiClusterNodePage() {
  const { nodeId = '' } = useParams<{ nodeId: string }>()
  const { data: node, error, isLoading } = useQuery({
    queryKey: ['midi-cluster', 'node', nodeId],
    queryFn: () => midiClusterApi.getNode(nodeId),
    enabled: Boolean(nodeId),
  })

  // Rewrite /api/midi/hub/* calls to cluster proxy for this node.
  useEffect(() => {
    if (!nodeId) return
    const originalFetch = window.fetch

    function rewrite(input: string): string {
      try {
        const url = new URL(input, window.location.origin)
        const path = url.pathname
        const basePath = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
        const hubPrefix = `${basePath}/midi/hub`
        if (path.startsWith('/midi/hub')) {
          url.pathname = `${basePath}/midi/cluster/nodes/${nodeId}/hub${path.replace('/midi/hub', '/midi/hub')}`
          return url.toString()
        }
        if (path.startsWith(hubPrefix)) {
          const rest = path.slice(basePath.length)
          url.pathname = `${basePath}/midi/cluster/nodes/${nodeId}/hub${rest}`
          return url.toString()
        }
        return input
      } catch (e) {
        return input
      }
    }

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string') {
        return originalFetch(rewrite(input), init)
      }
      if (input instanceof Request) {
        const next = new Request(rewrite(input.url), input)
        return originalFetch(next, init)
      }
      return originalFetch(input, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [nodeId])

  const banner = useMemo(() => {
    if (!node) return null
    return `${node.hostname} (${node.node_id})`
  }, [node])

  if (isLoading) return <CircularProgress />
  if (error) {
    return (
      <Alert severity="error" icon={<NetworkSlash size={18} />}>Failed to load node {nodeId}</Alert>
    )
  }
  if (!node) return null

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <ArrowSquareOut size={22} />
        <Typography variant="h6">Managing remote MIDI hub on {banner}</Typography>
      </Stack>
      <MidiHubPage />
    </Box>
  )
}

export default MidiClusterNodePage
