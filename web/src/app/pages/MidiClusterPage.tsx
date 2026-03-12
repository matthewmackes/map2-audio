import { useMemo } from 'react'
import { Alert, Box, Button, Grid, Stack, Typography } from '@mui/material'
import { ShareNetwork, Target, WarningOctagon } from '@phosphor-icons/react'

import MidiClusterConnectionMatrix from '../components/MidiCluster/MidiClusterConnectionMatrix'
import MidiClusterHealthBar from '../components/MidiCluster/MidiClusterHealthBar'
import MidiClusterNodeCard from '../components/MidiCluster/MidiClusterNodeCard'
import MidiClusterTopology from '../components/MidiCluster/MidiClusterTopology'
import MidiClusterClockPanel from '../components/MidiCluster/MidiClusterClockPanel'
import { PageHeader } from '../components/PageHeader'
import {
  useClusterClockActions,
  useConnectMidiCluster,
  useDisconnectMidiCluster,
  useMidiClusterClock,
  useMidiClusterConnections,
  useMidiClusterEndpoints,
  useMidiClusterHealth,
  useMidiClusterNodes,
  useMidiClusterSummary,
  useTriggerClusterAutoConnect,
} from '../hooks/useMidiCluster'

export function MidiClusterPage() {
  const nodesQuery = useMidiClusterNodes()
  const connectionsQuery = useMidiClusterConnections()
  const endpointsQuery = useMidiClusterEndpoints()
  const clockQuery = useMidiClusterClock()
  const healthQuery = useMidiClusterHealth()
  const summaryQuery = useMidiClusterSummary()

  const autoConnect = useTriggerClusterAutoConnect()
  const connect = useConnectMidiCluster()
  const disconnect = useDisconnectMidiCluster()
  const { forceSync } = useClusterClockActions()

  const nodes = nodesQuery.data ?? []
  const connections = connectionsQuery.data ?? []
  const endpoints = endpointsQuery.data ?? []

  const connectionsByNode = useMemo(() => {
    const map = new Map<string, string[]>()
    connections.forEach(c => {
      const src = map.get(c.source.node_id) ?? []
      src.push(c.connection_id)
      map.set(c.source.node_id, src)
      const dst = map.get(c.destination.node_id) ?? []
      dst.push(c.connection_id)
      map.set(c.destination.node_id, dst)
    })
    return map
  }, [connections])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, color: '#e5e7eb' }}>
      <PageHeader
        title="MIDI Cluster"
        icon={<ShareNetwork size={28} />}
        subtitle="Discover nodes, connect endpoints, and monitor distributed MIDI clock in real time."
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => forceSync.mutate()} disabled={forceSync.isPending}>
              Force re-sync
            </Button>
            <Button variant="contained" onClick={() => autoConnect.mutate()} disabled={autoConnect.isPending}>
              Auto-connect
            </Button>
          </Stack>
        }
      />

      {summaryQuery.data?.enabled === false && (
        <Alert severity="warning" icon={<WarningOctagon size={18} />} sx={{ mb: 2 }}>
          Cluster MIDI is disabled via config (midi.cluster.enabled=false).
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <MidiClusterHealthBar health={healthQuery.data} />
        </Grid>

        <Grid item xs={12} md={7}>
          <MidiClusterTopology nodes={nodes} connections={connections} />
        </Grid>
        <Grid item xs={12} md={5}>
          <MidiClusterClockPanel clock={clockQuery.data} nodes={nodes} />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ mb: 1, color: '#e5e7eb' }}>
            Nodes
          </Typography>
          <Grid container spacing={2}>
            {nodes.map(node => (
              <Grid item key={node.node_id} xs={12} sm={6} md={4}>
                <MidiClusterNodeCard
                  node={node}
                  connections={connectionsByNode.get(node.node_id) ?? []}
                  isLocal={node.hostname === window.location.hostname}
                />
              </Grid>
            ))}
          </Grid>
        </Grid>

        <Grid item xs={12}>
          <MidiClusterConnectionMatrix endpoints={endpoints} connections={connections} />
        </Grid>
      </Grid>

      {(connect.isPending || disconnect.isPending) && (
        <Alert severity="info" icon={<Target size={18} />} sx={{ mt: 2 }}>
          Updating connections…
        </Alert>
      )}
    </Box>
  )
}

export default MidiClusterPage
