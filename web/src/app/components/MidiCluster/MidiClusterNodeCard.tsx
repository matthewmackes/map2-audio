import { Badge, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { WifiHigh, Power, PlugCharging } from '@phosphor-icons/react'

import type { MidiClusterEndpoint, MidiClusterNode } from '../../../map2/api'

interface Props {
  node: MidiClusterNode
  connections: string[]
  isLocal?: boolean
  onSelect?: (nodeId: string) => void
}

function portBadge(port: MidiClusterEndpoint) {
  const color = port.direction === 'output' ? 'primary' : 'secondary'
  return (
    <Chip
      key={port.endpoint_id}
      size="small"
      color={color as any}
      variant="outlined"
      label={`${port.port_name}${port.device_name ? ` · ${port.device_name}` : ''}`}
      sx={{ borderStyle: port.available ? 'solid' : 'dashed', mr: 0.5, mb: 0.5 }}
    />
  )
}

export function MidiClusterNodeCard({ node, connections, isLocal = false, onSelect }: Props) {
  const online = node.online
  const borderColor = online ? '#22c55e' : '#ef4444'

  return (
    <Card
      variant="outlined"
      onClick={() => onSelect?.(node.node_id)}
      sx={{
        cursor: onSelect ? 'pointer' : 'default',
        borderColor,
        background: 'linear-gradient(135deg, #111827 0%, #0b1324 100%)',
        color: '#e5e7eb',
        minWidth: 260,
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Badge
            overlap="circular"
            variant="dot"
            color={online ? 'success' : 'error'}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <WifiHigh size={20} color={online ? '#22c55e' : '#ef4444'} />
          </Badge>
          <div style={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ color: '#f8fafc', fontWeight: 700 }}>
              {node.hostname} {isLocal ? '(local)' : ''}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              {node.node_id}
            </Typography>
          </div>
          <Chip
            size="small"
            label={`${connections.length} connections`}
            icon={<PlugCharging size={14} /> as any}
            sx={{ bgcolor: '#1e293b', color: '#e2e8f0' }}
          />
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Chip
            size="small"
            icon={<Power size={12} /> as any}
            label={online ? 'Online' : 'Offline'}
            color={online ? 'success' : 'error'}
            variant={online ? 'filled' : 'outlined'}
          />
          {node.capabilities?.clock_source && (
            <Chip
              size="small"
              label={`Clock: ${node.capabilities.clock_source}`}
              color="info"
              variant="outlined"
            />
          )}
        </Stack>

        <Typography variant="caption" sx={{ color: '#94a3b8' }} gutterBottom>
          Inputs
        </Typography>
        <div>{node.ports.filter(p => p.direction === 'input').map(portBadge)}</div>

        <Typography variant="caption" sx={{ color: '#94a3b8', mt: 1 }} gutterBottom>
          Outputs
        </Typography>
        <div>{node.ports.filter(p => p.direction === 'output').map(portBadge)}</div>
      </CardContent>
    </Card>
  )
}

export default MidiClusterNodeCard
