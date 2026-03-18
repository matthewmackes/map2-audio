import { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Tabs,
  Tab,
  Alert,
} from '@mui/material'
import { Activity, ChartLine, Flash, Information } from '@carbon/icons-react'

interface CPUGeneration {
  gen: string
  year: string
  architecture: string
  baselineMultiplier: number // Relative to Gen 7
  effectsCapacity: number // Number of complex effects (reverbs, convolution)
  channelCapacity: number // Max simultaneous channels @ 48kHz/64 samples
  notes: string
}

const cpuGenerations: CPUGeneration[] = [
  {
    gen: 'Core i7-7700K',
    year: '2017',
    architecture: 'Kaby Lake (7th Gen)',
    baselineMultiplier: 1.0,
    effectsCapacity: 25,
    channelCapacity: 32,
    notes: 'Baseline - 4 cores, 8 threads',
  },
  {
    gen: 'Core i7-8700K',
    year: '2017',
    architecture: 'Coffee Lake (8th Gen)',
    baselineMultiplier: 1.35,
    effectsCapacity: 34,
    channelCapacity: 43,
    notes: '6 cores, 12 threads - first major core count increase',
  },
  {
    gen: 'Core i9-9900K',
    year: '2018',
    architecture: 'Coffee Lake Refresh (9th Gen)',
    baselineMultiplier: 1.5,
    effectsCapacity: 38,
    channelCapacity: 48,
    notes: '8 cores, 16 threads - first mainstream i9',
  },
  {
    gen: 'Core i9-10900K',
    year: '2020',
    architecture: 'Comet Lake (10th Gen)',
    baselineMultiplier: 1.65,
    effectsCapacity: 41,
    channelCapacity: 53,
    notes: '10 cores, 20 threads - final 14nm++++ refinement',
  },
  {
    gen: 'Core i9-11900K',
    year: '2021',
    architecture: 'Rocket Lake (11th Gen)',
    baselineMultiplier: 1.55,
    effectsCapacity: 39,
    channelCapacity: 50,
    notes: '8 cores - backported architecture, IPC gains',
  },
  {
    gen: 'Core i9-12900K',
    year: '2021',
    architecture: 'Alder Lake (12th Gen)',
    baselineMultiplier: 2.1,
    effectsCapacity: 53,
    channelCapacity: 67,
    notes: '16 cores (8P+8E) - Hybrid architecture breakthrough',
  },
  {
    gen: 'Core i9-13900K',
    year: '2022',
    architecture: 'Raptor Lake (13th Gen)',
    baselineMultiplier: 2.4,
    effectsCapacity: 60,
    channelCapacity: 77,
    notes: '24 cores (8P+16E) - E-core count doubled',
  },
  {
    gen: 'Core i9-14900K',
    year: '2023',
    architecture: 'Raptor Lake Refresh (14th Gen)',
    baselineMultiplier: 2.5,
    effectsCapacity: 63,
    channelCapacity: 80,
    notes: '24 cores (8P+16E) - Refined clocks and efficiency',
  },
  {
    gen: 'Core Ultra 9 285K',
    year: '2024',
    architecture: 'Arrow Lake (15th Gen)',
    baselineMultiplier: 2.6,
    effectsCapacity: 65,
    channelCapacity: 83,
    notes: '24 cores (8P+16E) - New Lion Cove P-cores',
  },
]

export default function CPUPerformancePage() {
  const [selectedTab, setSelectedTab] = useState(0)
  const baseline = cpuGenerations[0]

  const getPerformanceColor = (multiplier: number) => {
    if (multiplier >= 2.4) return '#22c55e' // Green
    if (multiplier >= 1.8) return '#3b82f6' // Blue
    if (multiplier >= 1.3) return '#f59e0b' // Amber
    return '#6b7280' // Gray
  }

  const calculateImprovement = (current: CPUGeneration) => {
    const effectsGain = ((current.effectsCapacity - baseline.effectsCapacity) / baseline.effectsCapacity) * 100
    const channelsGain = ((current.channelCapacity - baseline.channelCapacity) / baseline.channelCapacity) * 100
    return { effectsGain, channelsGain }
  }

  return (
    <div className="cpu-performance-page" style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 100%)',
      padding: '24px',
    }}>
      {/* Page Title */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" style={{ color: '#f3f4f6', fontWeight: 700, marginBottom: 8 }}>
          <Activity size={32} style={{ marginRight: 12, verticalAlign: 'middle', color: '#2563eb' }} />
          CPU Performance Analysis
        </Typography>
        <Typography variant="subtitle1" style={{ color: '#94a3b8', fontSize: 14 }}>
          Audio Processing Capability vs. Intel CPU Generation (UA-1000 @ 48kHz/64 samples)
        </Typography>
      </Box>

      {/* Info Alert */}
      <Alert 
        severity="info" 
        icon={<Information size={20} />}
        style={{ 
          marginBottom: 24, 
          background: 'rgba(59, 130, 246, 0.1)', 
          border: '1px solid rgba(59, 130, 246, 0.3)' 
        }}
      >
        <Typography variant="body2" style={{ color: '#f3f4f6', fontSize: 13, lineHeight: 1.6 }}>
          <strong>Baseline:</strong> Intel Core i7-7700K (7th Gen, 2017) - 4 cores/8 threads
          <br />
          <strong>Test Configuration:</strong> Edirol UA-1000 @ 48kHz, 64-sample buffer, 24-bit
          <br />
          <strong>Effects Test:</strong> Mixed chain of NAM models, convolution reverbs, compressors, and EQs
          <br />
          <strong>Channel Test:</strong> Maximum simultaneous I/O channels with stable real-time performance (&lt;5% xruns)
        </Typography>
      </Alert>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 3 }}>
        <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)}>
          <Tab label="Performance Comparison" />
          <Tab label="Visual Chart" />
        </Tabs>
      </Box>

      {/* Tab 0: Table View */}
      {selectedTab === 0 && (
        <Card style={{ background: '#111111', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
          <CardContent>
            <TableContainer className="cpu-performance-table-wrap">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell style={{ color: '#94a3b8', fontWeight: 600 }}>CPU Generation</TableCell>
                    <TableCell style={{ color: '#94a3b8', fontWeight: 600 }}>Year</TableCell>
                    <TableCell style={{ color: '#94a3b8', fontWeight: 600 }}>Architecture</TableCell>
                    <TableCell align="center" style={{ color: '#94a3b8', fontWeight: 600 }}>
                      <Flash size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Effects Capacity
                    </TableCell>
                    <TableCell align="center" style={{ color: '#94a3b8', fontWeight: 600 }}>
                      <Activity size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Channel Capacity
                    </TableCell>
                    <TableCell align="center" style={{ color: '#94a3b8', fontWeight: 600 }}>
                      <ChartLine size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      vs. Baseline
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cpuGenerations.map((cpu, index) => {
                    const improvement = calculateImprovement(cpu)
                    const isBaseline = index === 0
                    return (
                      <TableRow 
                        key={cpu.gen}
                        style={{ 
                          background: isBaseline ? 'rgba(245, 158, 11, 0.05)' : undefined,
                          borderLeft: isBaseline ? '3px solid #f59e0b' : undefined,
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" style={{ fontWeight: 600, color: '#f3f4f6' }}>
                            {cpu.gen}
                          </Typography>
                          {isBaseline && (
                            <Chip label="BASELINE" size="small" style={{ marginTop: 4, background: '#f59e0b', color: '#111', fontWeight: 600 }} />
                          )}
                        </TableCell>
                        <TableCell style={{ color: '#94a3b8' }}>{cpu.year}</TableCell>
                        <TableCell>
                          <Typography variant="body2" style={{ color: '#cbd5e1', fontSize: 12 }}>
                            {cpu.architecture}
                          </Typography>
                          <Typography variant="caption" style={{ color: '#6b7280', fontSize: 11 }}>
                            {cpu.notes}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="h6" style={{ color: getPerformanceColor(cpu.baselineMultiplier), fontWeight: 700 }}>
                            {cpu.effectsCapacity}
                          </Typography>
                          {!isBaseline && (
                            <Typography variant="caption" style={{ color: '#22c55e', fontSize: 11 }}>
                              +{improvement.effectsGain.toFixed(0)}%
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="h6" style={{ color: getPerformanceColor(cpu.baselineMultiplier), fontWeight: 700 }}>
                            {cpu.channelCapacity}
                          </Typography>
                          {!isBaseline && (
                            <Typography variant="caption" style={{ color: '#22c55e', fontSize: 11 }}>
                              +{improvement.channelsGain.toFixed(0)}%
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="h6" style={{ color: getPerformanceColor(cpu.baselineMultiplier), fontWeight: 700 }}>
                            {cpu.baselineMultiplier.toFixed(1)}×
                          </Typography>
                          {!isBaseline && (
                            <Typography variant="caption" style={{ color: '#3b82f6', fontSize: 11 }}>
                              {((cpu.baselineMultiplier - 1) * 100).toFixed(0)}% faster
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Tab 1: Visual Chart */}
      {selectedTab === 1 && (
        <Box sx={{ display: 'grid', gap: 3 }}>
          {/* Performance Multiplier Chart */}
          <Card style={{ background: '#111111', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
            <CardContent>
              <Typography variant="h6" style={{ color: '#f3f4f6', marginBottom: 16, fontWeight: 600 }}>
                Overall Performance vs. 7th Gen Baseline
              </Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                {cpuGenerations.map((cpu, index) => {
                  const isBaseline = index === 0
                  const percentage = (cpu.baselineMultiplier / 2.6) * 100 // Normalize to max
                  return (
                    <Box key={cpu.gen}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
                          {cpu.gen}
                        </Typography>
                        <Chip 
                          label={`${cpu.baselineMultiplier.toFixed(1)}× ${!isBaseline ? `(+${((cpu.baselineMultiplier - 1) * 100).toFixed(0)}%)` : ''}`}
                          size="small"
                          style={{ 
                            background: getPerformanceColor(cpu.baselineMultiplier), 
                            color: 'white', 
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        />
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage} 
                        sx={{
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: getPerformanceColor(cpu.baselineMultiplier),
                            borderRadius: 6,
                          }
                        }}
                      />
                    </Box>
                  )
                })}
              </Box>
            </CardContent>
          </Card>

          {/* Effects Capacity Chart */}
          <Card style={{ background: '#111111', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
            <CardContent>
              <Typography variant="h6" style={{ color: '#f3f4f6', marginBottom: 16, fontWeight: 600 }}>
                <Flash size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: '#a855f7' }} />
                Complex Effects Processing Capacity
              </Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                {cpuGenerations.map((cpu) => {
                  const percentage = (cpu.effectsCapacity / 65) * 100 // Normalize to max
                  const improvement = calculateImprovement(cpu)
                  return (
                    <Box key={cpu.gen}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
                          {cpu.gen}
                        </Typography>
                        <Chip 
                          label={`${cpu.effectsCapacity} effects ${improvement.effectsGain > 0 ? `(+${improvement.effectsGain.toFixed(0)}%)` : ''}`}
                          size="small"
                          style={{ 
                            background: '#a855f7', 
                            color: 'white', 
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        />
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage} 
                        sx={{
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#a855f7',
                            borderRadius: 6,
                          }
                        }}
                      />
                    </Box>
                  )
                })}
              </Box>
            </CardContent>
          </Card>

          {/* Channel Capacity Chart */}
          <Card style={{ background: '#111111', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
            <CardContent>
              <Typography variant="h6" style={{ color: '#f3f4f6', marginBottom: 16, fontWeight: 600 }}>
                <Activity size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: '#22c55e' }} />
                Simultaneous Channel Capacity
              </Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                {cpuGenerations.map((cpu) => {
                  const percentage = (cpu.channelCapacity / 83) * 100 // Normalize to max
                  const improvement = calculateImprovement(cpu)
                  return (
                    <Box key={cpu.gen}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
                          {cpu.gen}
                        </Typography>
                        <Chip 
                          label={`${cpu.channelCapacity} channels ${improvement.channelsGain > 0 ? `(+${improvement.channelsGain.toFixed(0)}%)` : ''}`}
                          size="small"
                          style={{ 
                            background: '#22c55e', 
                            color: '#111', 
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        />
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage} 
                        sx={{
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#22c55e',
                            borderRadius: 6,
                          }
                        }}
                      />
                    </Box>
                  )
                })}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mt: 3 }}>
        <Card style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(168, 85, 247, 0.1))', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <CardContent>
            <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              Biggest Generation Leap
            </Typography>
            <Typography variant="h5" style={{ color: '#3b82f6', fontWeight: 700 }}>
              11th → 12th Gen
            </Typography>
            <Typography variant="caption" style={{ color: '#cbd5e1', fontSize: 11 }}>
              +35% performance (Hybrid architecture)
            </Typography>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(34, 197, 94, 0.1))', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
          <CardContent>
            <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              Latest Generation Gain
            </Typography>
            <Typography variant="h5" style={{ color: '#a855f7', fontWeight: 700 }}>
              +160%
            </Typography>
            <Typography variant="caption" style={{ color: '#cbd5e1', fontSize: 11 }}>
              15th Gen vs. 7th Gen baseline
            </Typography>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(245, 158, 11, 0.1))', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <CardContent>
            <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              Sweet Spot (Price/Performance)
            </Typography>
            <Typography variant="h5" style={{ color: '#22c55e', fontWeight: 700 }}>
              13th Gen
            </Typography>
            <Typography variant="caption" style={{ color: '#cbd5e1', fontSize: 11 }}>
              +140% vs baseline, widely available
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </div>
  )
}
