import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Box,
  Rating,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material'
import { X, ArrowSquareOut, CheckCircle, WarningCircle, Info } from '@phosphor-icons/react'

interface ProductDetailDialogProps {
  open: boolean
  onClose: () => void
  product: {
    model: string
    manufacturer?: string
    io_count: string
    latency_ms: number
    tier: string
    linux_support: string
    notes: string
    image?: string
    price_range?: string
    release_year?: number
  } | null
}

export function ProductDetailDialog({ open, onClose, product }: ProductDetailDialogProps) {
  const [activeTab, setActiveTab] = useState(0)

  if (!product) return null

  const getLinuxRating = (support: string) => {
    switch (support.toLowerCase()) {
      case 'excellent': return 5
      case 'good': return 4
      case 'fair': return 3
      case 'poor': return 2
      default: return 1
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'S+': return '#60a5fa'
      case 'S': return '#2563eb'
      case 'A+': return '#22c55e'
      case 'A': return '#22c55e'
      case 'B': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          background: '#0a0a0a',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }
      }}
    >
      <DialogTitle style={{ borderBottom: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#f3f4f6' }}>{product.model}</div>
          <div style={{ fontSize: 13, color: '#d1d5db', marginTop: 4 }}>{product.manufacturer || 'Unknown manufacturer'}</div>
        </div>
        <Button onClick={onClose} style={{ minWidth: 40, padding: 8 }}>
          <X size={20} weight="bold" />
        </Button>
      </DialogTitle>

      <DialogContent style={{ padding: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label="Overview" />
            <Tab label="Specifications" />
            <Tab label="Linux Setup" />
            <Tab label="Gallery" />
          </Tabs>
        </Box>

        <div style={{ padding: 24 }}>
          {/* Tab 0: Overview */}
          {activeTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Product Image Placeholder */}
              <div style={{
                width: '100%',
                height: 300,
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.1))',
                border: '2px dashed rgba(59, 130, 246, 0.3)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 14,
              }}>
                📷 Product Image: {product.model}
                <br />
                <span style={{ fontSize: 11 }}>(Manufacturer images would appear here)</span>
              </div>

              {/* Quick Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <div className="card" style={{ padding: 16, background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Performance Tier</div>
                  <Chip
                    label={product.tier}
                    style={{
                      background: getTierColor(product.tier),
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 18,
                    }}
                  />
                </div>

                <div className="card" style={{ padding: 16, background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Linux Compatibility</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Rating value={getLinuxRating(product.linux_support)} readOnly size="small" />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>{product.linux_support}</span>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Round-Trip Latency</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#60a5fa' }}>
                    {product.latency_ms === 0 ? 'ADAT Expander' : `${product.latency_ms.toFixed(1)}ms`}
                  </div>
                </div>

                <div className="card" style={{ padding: 16, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>I/O Configuration</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>{product.io_count}</div>
                </div>
              </div>

              {/* Notes */}
              <div className="card" style={{ padding: 16, background: 'rgba(59, 130, 246, 0.05)' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>📝 Notes</div>
                <div style={{ color: '#e2e8f0' }}>{product.notes}</div>
              </div>

              {/* Typical Price */}
              {product.price_range && (
                <div className="card" style={{ padding: 16, background: 'rgba(34, 197, 94, 0.05)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>💰 Typical Used Market Price</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{product.price_range}</div>
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Specifications */}
          {activeTab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Model</TableCell>
                    <TableCell style={{ color: '#e2e8f0' }}>{product.model}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Manufacturer</TableCell>
                      <TableCell style={{ color: '#e2e8f0' }}>{product.manufacturer || 'Unknown manufacturer'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>I/O Count</TableCell>
                    <TableCell style={{ color: '#e2e8f0' }}>{product.io_count}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Round-Trip Latency (64 samples)</TableCell>
                    <TableCell style={{ color: '#e2e8f0' }}>
                      {product.latency_ms === 0 ? 'N/A (ADAT Expander)' : `${product.latency_ms}ms`}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Linux Driver</TableCell>
                    <TableCell style={{ color: '#e2e8f0' }}>
                      {product.linux_support === 'Excellent' ? 'Class-compliant (no driver needed)' : 'Requires configuration'}
                    </TableCell>
                  </TableRow>
                  {product.release_year && (
                    <TableRow>
                      <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Release Year</TableCell>
                      <TableCell style={{ color: '#e2e8f0' }}>{product.release_year}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell style={{ fontWeight: 600, color: '#94a3b8' }}>Performance Tier</TableCell>
                    <TableCell>
                      <Chip label={product.tier} style={{ background: getTierColor(product.tier), color: 'white', fontWeight: 600 }} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="card" style={{ padding: 16, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Info size={16} weight="duotone" style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>Technical Note</span>
                </div>
                <div style={{ fontSize: 13, color: '#d1d5db' }}>
                  Detailed specifications including ADC/DAC chips, sample rate support, bit depth, and connection types would appear here.
                  Data sourced from manufacturer documentation and community testing.
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Linux Setup */}
          {activeTab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: 16, background: 'rgba(34, 197, 94, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CheckCircle size={20} weight="duotone" style={{ color: '#22c55e' }} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#22c55e' }}>Linux Compatibility: {product.linux_support}</span>
                </div>
                <Rating value={getLinuxRating(product.linux_support)} readOnly />
              </div>

              <div className="card" style={{ padding: 16, background: 'rgba(59, 130, 246, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6', marginBottom: 12 }}>📋 Setup Instructions</div>
                <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6 }}>
                  {product.linux_support === 'Excellent' ? (
                    <>
                      <strong>✅ Plug & Play</strong>
                      <br />
                      This device is class-compliant and requires no drivers on Linux.
                      <br /><br />
                      <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>
                        aplay -l
                      </code> to verify device recognition
                    </>
                  ) : (
                    <>
                      This device may require ALSA configuration or kernel module loading.
                      <br />
                      Community setup guides and configuration examples would be linked here.
                    </>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 16, background: 'rgba(37, 99, 235, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>🔧 JACK Configuration</div>
                <div style={{ fontSize: 13, color: '#d1d5db', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 4 }}>
                  jackd -d alsa -d hw:{product.model.toLowerCase().replace(/\s/g, '')} -r 48000 -p 64 -n 2
                </div>
              </div>

              <div className="card" style={{ padding: 16, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <WarningCircle size={16} weight="duotone" style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>Community Resources</span>
                </div>
                <div style={{ fontSize: 12, color: '#d1d5db' }}>
                  • LinuxMusicians forum discussions
                  <br />
                  • Arch Wiki audio configuration
                  <br />
                  • Ubuntu Studio compatibility notes
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Gallery */}
          {activeTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    style={{
                      height: 150,
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(37, 99, 235, 0.05))',
                      border: '1px dashed rgba(59, 130, 246, 0.3)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: 12,
                    }}
                  >
                    Photo {i}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                📸 Manufacturer images, user setups, and rack configurations would appear here
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <DialogActions style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', padding: 16 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
        <Button
          variant="contained"
          endIcon={<ArrowSquareOut size={16} weight="duotone" />}
          onClick={() => {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(product.model + ' audio interface')}`, '_blank')
          }}
        >
          Search for This Device
        </Button>
      </DialogActions>
    </Dialog>
  )
}
