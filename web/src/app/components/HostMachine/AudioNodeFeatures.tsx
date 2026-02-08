/**
 * Audio Node Features - MAP2 Audio Optimization Highlights
 */

import { Box, Paper, Grid, Typography, List, ListItem, ListItemIcon, ListItemText, Chip } from '@mui/material'
import { Music, Zap, Wind, Gauge, Shield, TrendingUp } from 'lucide-react'
import type { HostMachineInfo, SystemHealthOverview, BrandingAssets } from '@/map2/types'

interface AudioFeaturesProps {
  machineInfo: HostMachineInfo
  healthOverview?: SystemHealthOverview
  branding: BrandingAssets
}

interface AudioFeature {
  icon: React.ReactNode
  title: string
  description: string
  status: 'optimal' | 'good' | 'warning' | 'info'
}

export default function AudioNodeFeatures({
  machineInfo,
  healthOverview,
  branding,
}: AudioFeaturesProps) {
  const features: AudioFeature[] = [
    {
      icon: <Zap size={20} />,
      title: 'Multi-Core Processing',
      description: `${machineInfo.cpu_threads} logical CPUs available for parallel audio DSP and plugin processing`,
      status: machineInfo.cpu_cores >= 4 ? 'optimal' : machineInfo.cpu_cores >= 2 ? 'good' : 'warning',
    },
    {
      icon: <Music size={20} />,
      title: 'Large Buffer Support',
      description: `${(machineInfo.total_memory_mb / 1024).toFixed(1)} GB RAM supports large buffer sizes for ultra-low latency monitoring`,
      status: machineInfo.total_memory_mb >= 8192 ? 'optimal' : machineInfo.total_memory_mb >= 4096 ? 'good' : 'warning',
    },
    {
      icon: <Wind size={20} />,
      title: 'Thermal Management',
      description: `${branding.sff_optimized ? 'Optimized small form factor' : 'Compact'} design with efficient cooling for sustained real-time audio`,
      status: healthOverview?.overall_health === 'excellent' ? 'optimal' : 'good',
    },
    {
      icon: <Gauge size={20} />,
      title: 'Real-Time Capable',
      description: 'CPU frequency scaling and RT scheduling support for predictable audio performance',
      status: machineInfo.cpu_cores >= 4 ? 'optimal' : 'good',
    },
    {
      icon: <TrendingUp size={20} />,
      title: 'Performance Metrics',
      description: 'Live monitoring of CPU, memory, temperature, and latency for audio optimization',
      status: 'info',
    },
    {
      icon: <Shield size={20} />,
      title: 'Audio Node Operations',
      description: 'Dedicated CPU cores for JUCE audio engine, LV2 plugins, and DSP graph processing',
      status: 'info',
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal':
        return { bg: '#d1fae5', icon: '#10b981', border: '#10b981' }
      case 'good':
        return { bg: '#dbeafe', icon: '#3b82f6', border: '#3b82f6' }
      case 'warning':
        return { bg: '#fef3c7', icon: '#f59e0b', border: '#f59e0b' }
      case 'info':
      default:
        return { bg: '#f3f4f6', icon: '#6b7280', border: '#d1d5db' }
    }
  }

  return (
    <Box>
      {/* Overview */}
      <Paper sx={{ p: 3, mb: 3, border: '1px solid #e5e7eb', backgroundColor: '#fafbfc' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 1 }}>
          MAP2 Audio Performance Profile
        </Typography>
        <Typography sx={{ color: '#666', lineHeight: 1.6 }}>
          This {branding.sff_optimized ? 'compact' : ''} system is optimized for real-time audio production with the MAP2
          Audio Platform. The {machineInfo.cpu_cores}-core processor and {(machineInfo.total_memory_mb / 1024).toFixed(1)}GB of memory
          provide excellent headroom for complex plugin chains, neural amp modeling, and impulse response convolution at
          low latencies.
        </Typography>
      </Paper>

      {/* Features Grid */}
      <Grid container spacing={2.5}>
        {features.map((feature, idx) => {
          const colors = getStatusColor(feature.status)

          return (
            <Grid item xs={12} sm={6} lg={4} key={idx}>
              <Paper
                sx={{
                  p: 2.5,
                  border: `2px solid ${colors.border}`,
                  backgroundColor: colors.bg,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{ color: colors.icon, flexShrink: 0, mt: 0.25 }}>{feature.icon}</Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                    {feature.title}
                  </Typography>
                  {feature.status === 'optimal' && (
                    <Chip label="OPTIMAL" size="small" sx={{ fontSize: 10, fontWeight: 700 }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                  {feature.description}
                </Typography>
              </Paper>
            </Grid>
          )
        })}
      </Grid>

      {/* Audio Workload Recommendations */}
      <Paper sx={{ p: 3, mt: 3, border: '1px solid #e5e7eb' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>
          Recommended Audio Workloads
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1.5, color: '#10b981' }}>
                ✓ Well-Suited For:
              </Typography>
              <List dense sx={{ pl: 0 }}>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Complex guitar processing chains (10+ effects)"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Real-time NAM (Neural Amp Modeler) inference"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Convolution reverbs & cabinet IR processing"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Live performance with complex setups"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Recording & streaming applications"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
              </List>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1.5, color: '#3b82f6' }}>
                ℹ Configuration Notes:
              </Typography>
              <List dense sx={{ pl: 0 }}>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Use SFF-optimized cooling for sustained real-time operations"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Monitor CPU utilization and thermal status in the Health tab"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Configure audio buffer size based on latency requirements"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters sx={{ mb: 0.5 }}>
                  <ListItemText
                    primary="Use the Cluster Dashboard for multi-node distributed processing"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Enable RT priority scheduling for critical audio threads"
                    primaryTypographyProps={{ fontSize: 12, color: '#333' }}
                  />
                </ListItem>
              </List>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Performance Guidelines */}
      <Paper sx={{ p: 3, mt: 3, border: '1px solid #e5e7eb', backgroundColor: '#f0f7ff' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2, color: '#003da5' }}>
          Performance Guidelines
        </Typography>

        <Grid container spacing={2}>
          {[
            { label: 'Max Plugin Chain Complexity', value: '25-30 plugins @ 48kHz / 256 samples' },
            { label: 'Real-Time Headroom', value: '60-70% CPU utilization recommended' },
            { label: 'IR Processing', value: '2x 8192-point impulse responses real-time' },
            { label: 'Recommended Buffer Size', value: '256 samples (5.3ms @ 48kHz)' },
          ].map((item, idx) => (
            <Grid item xs={12} sm={6} key={idx}>
              <Box sx={{ p: 1.5, backgroundColor: 'white', borderRadius: 1, border: '1px solid #dbeafe' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.25 }}>
                  {item.label}
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#003da5' }}>{item.value}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  )
}
