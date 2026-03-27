/**
 * Multi-System Dashboard Component
 * Monitor multiple MAP2 systems from a single unified view
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Button,
} from '@mui/material'
import { Add as Plus, Renew as ArrowsClockwise, TrashCan as Trash, WarningAlt as Warning } from '@carbon/icons-react'
import type { HealthAlert } from '@/app/hooks/useHealthMonitoring'
import { NumberInput } from '../ParameterControl'

interface SystemHost {
  id: string
  name: string
  host: string
  port: number
  enabled: boolean
  lastSeen?: number
  status: 'online' | 'offline' | 'error'
  metrics?: {
    temperature: number
    cpuUsage: number
    memoryUsage: number
    diskUsage: number
  }
  alerts?: HealthAlert[]
}

interface MultiSystemDashboardProps {
  initialHosts?: SystemHost[]
  onHostsChange?: (hosts: SystemHost[]) => void
}

export default function MultiSystemDashboard({
  initialHosts = [],
  onHostsChange,
}: MultiSystemDashboardProps) {
  const [hosts, setHosts] = useState<SystemHost[]>(initialHosts)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newHostName, setNewHostName] = useState('')
  const [newHostAddress, setNewHostAddress] = useState('')
  const [newHostPort, setNewHostPort] = useState(8000)

  // Fetch metrics for all hosts
  useEffect(() => {
    const fetchAllMetrics = async () => {
      const updated = await Promise.all(
        hosts.map(async (host) => {
          if (!host.enabled) return host

          try {
            const response = await fetch(
              `http://${host.host}:${host.port}/api/system/health-overview`,
              { signal: AbortSignal.timeout(5000) }
            )

            if (!response.ok) throw new Error('Failed to fetch')

            const data = await response.json()

            return {
              ...host,
              status: 'online' as const,
              lastSeen: Date.now(),
              metrics: {
                temperature: data.cpu_temp_celsius,
                cpuUsage: data.cpu_usage_percent,
                memoryUsage: data.memory_usage_percent,
                diskUsage: 0, // Would come from disk health endpoint
              },
            }
          } catch (error) {
            return {
              ...host,
              status: 'offline' as const,
            }
          }
        })
      )

      setHosts(updated)
      onHostsChange?.(updated)
    }

    const interval = setInterval(fetchAllMetrics, 30000) // Refresh every 30s
    fetchAllMetrics() // Initial fetch

    return () => clearInterval(interval)
  }, [hosts.length, onHostsChange])

  const handleAddHost = () => {
    if (!newHostName || !newHostAddress) return

    const newHost: SystemHost = {
      id: Date.now().toString(),
      name: newHostName,
      host: newHostAddress,
      port: newHostPort,
      enabled: true,
      status: 'offline',
    }

    const updated = [...hosts, newHost]
    setHosts(updated)
    onHostsChange?.(updated)

    setNewHostName('')
    setNewHostAddress('')
    setNewHostPort(8000)
    setAddDialogOpen(false)
  }

  const handleRemoveHost = (id: string) => {
    const updated = hosts.filter((h) => h.id !== id)
    setHosts(updated)
    onHostsChange?.(updated)
  }

  const handleToggleHost = (id: string) => {
    const updated = hosts.map((h) =>
      h.id === id ? { ...h, enabled: !h.enabled } : h
    )
    setHosts(updated)
    onHostsChange?.(updated)
  }

  const handleRefresh = () => {
    // Trigger immediate refresh
    window.location.reload()
  }

  // Calculate overall health
  const overallHealth = useMemo(() => {
    const onlineHosts = hosts.filter((h) => h.status === 'online').length
    const criticalAlerts = hosts.reduce(
      (sum, h) => sum + (h.alerts?.filter((a) => a.severity === 'critical').length || 0),
      0
    )

    return {
      online: onlineHosts,
      total: hosts.length,
      criticalAlerts,
      status: criticalAlerts > 0 ? 'critical' : onlineHosts === hosts.length ? 'healthy' : 'warning',
    }
  }, [hosts])

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700 }}>Multi-System Dashboard</Typography>
          <Typography sx={{ fontSize: 12, color: '#666', mt: 0.5 }}>
            Monitoring {overallHealth.online} of {overallHealth.total} systems
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={handleRefresh}>
            <ArrowsClockwise size={18} />
          </IconButton>
          <Button size="small" startIcon={<Plus size={18} />} onClick={() => setAddDialogOpen(true)}>
            Add System
          </Button>
        </Box>
      </Box>

      {/* Overall Status */}
      <Paper sx={{ p: 2, bgcolor: '#f9fafb' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 600, mb: 0.5 }}>
                Systems Online
              </Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 700 }}>
                {overallHealth.online}/{overallHealth.total}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 600, mb: 0.5 }}>
                Critical Alerts
              </Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>
                {overallHealth.criticalAlerts}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 600, mb: 0.5 }}>
                Overall Status
              </Typography>
              <Chip
                label={overallHealth.status.toUpperCase()}
                color={
                  overallHealth.status === 'healthy'
                    ? 'success'
                    : overallHealth.status === 'warning'
                      ? 'warning'
                      : 'error'
                }
                size="small"
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 600, mb: 0.5 }}>
                Last Updated
              </Typography>
              <Typography sx={{ fontSize: 14 }}>
                {new Date().toLocaleTimeString()}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Systems Grid */}
      <Grid container spacing={2}>
        {hosts.map((host) => (
          <Grid item xs={12} sm={6} lg={4} key={host.id}>
            <Card
              sx={{
                border:
                  host.status === 'offline'
                    ? '2px solid #e5e7eb'
                    : host.metrics && host.metrics.temperature > 80
                      ? '2px solid #ef4444'
                      : '2px solid #10b981',
              }}
            >
              <CardContent sx={{ p: 2 }}>
                {/* Header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1.5,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{host.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: '#666' }}>
                      {host.host}:{host.port}
                    </Typography>
                  </Box>

                  <IconButton
                    size="small"
                  onClick={() => handleRemoveHost(host.id)}
                  sx={{ color: '#ef4444' }}
                >
                    <Trash size={16} />
                  </IconButton>
                </Box>

                {/* Status */}
                <Box sx={{ mb: 1.5 }}>
                  <Chip
                    size="small"
                    label={host.status.toUpperCase()}
                    color={host.status === 'online' ? 'success' : 'error'}
                    icon={host.status === 'offline' ? <Warning size={14} /> : undefined}
                  />
                </Box>

                {/* Metrics */}
                {host.status === 'online' && host.metrics ? (
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    {/* Temperature */}
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Temperature</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                          {host.metrics.temperature.toFixed(1)}°C
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(host.metrics.temperature, 100)}
                        sx={{
                          height: 6,
                          borderRadius: 1,
                          backgroundColor: '#e5e7eb',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor:
                              host.metrics.temperature > 80 ? '#ef4444' : '#10b981',
                          },
                        }}
                      />
                    </Box>

                    {/* CPU */}
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>CPU Usage</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                          {host.metrics.cpuUsage.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={host.metrics.cpuUsage}
                        sx={{
                          height: 6,
                          borderRadius: 1,
                          backgroundColor: '#e5e7eb',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#3b82f6',
                          },
                        }}
                      />
                    </Box>

                    {/* Memory */}
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Memory</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                          {host.metrics.memoryUsage.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={host.metrics.memoryUsage}
                        sx={{
                          height: 6,
                          borderRadius: 1,
                          backgroundColor: '#e5e7eb',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#ec4899',
                          },
                        }}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 12, color: '#999', textAlign: 'center', py: 2 }}>
                    {host.status === 'offline' ? 'System offline' : 'Loading metrics...'}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* Add System Card */}
        {hosts.length === 0 && (
          <Grid item xs={12}>
            <Paper
              sx={{
                p: 4,
                textAlign: 'center',
                border: '2px dashed #e5e7eb',
                cursor: 'pointer',
                '&:hover': { borderColor: '#d1d5db' },
              }}
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus size={48} style={{ margin: '0 auto 16px', color: '#9ca3af' }} />
              <Typography sx={{ fontWeight: 600, mb: 1 }}>No Systems Added</Typography>
              <Typography sx={{ fontSize: 12, color: '#666' }}>
                Click to add your first MAP2 system to the dashboard
              </Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Add System Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add System</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <TextField
            fullWidth
            label="System Name"
            placeholder="e.g., Studio A"
            value={newHostName}
            onChange={(e) => setNewHostName(e.target.value)}
            size="small"
          />

          <TextField
            fullWidth
            label="Host Address"
            placeholder="e.g., 192.168.1.100 or studio-a.local"
            value={newHostAddress}
            onChange={(e) => setNewHostAddress(e.target.value)}
            size="small"
          />

          <NumberInput
            label="Port"
            value={newHostPort}
            min={1}
            max={65535}
            step={1}
            profile="integer"
            onChange={setNewHostPort}
            size="small"
            fullWidth
          />

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
            <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddHost} variant="contained">
              Add System
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
