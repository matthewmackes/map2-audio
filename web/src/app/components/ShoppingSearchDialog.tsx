import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Box,
  Link as MuiLink,
  Slider,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Tooltip,
  Collapse,
  IconButton,
} from '@mui/material'
import { ShoppingCart, ArrowSquareOut, MagnifyingGlass, Funnel, Info, GitDiff, CaretDown, CaretUp, Warning } from '@phosphor-icons/react'
import { API_BASE } from '../../map2/api'
import { ProductDetailDialog } from './ProductDetailDialog'
import { useIsMobile } from '../hooks/useIsMobile'

interface DeviceMatch {
  model: string
  manufacturer?: string
  io_count: string
  latency_ms: number
  tier: string
  score: number
  linux_support: string
  notes: string
}

interface SearchResult {
  title: string
  price: number
  url: string
  source: string
  condition: string
  shipping: number | null
  matched_device: DeviceMatch | null
  score: number
}

interface ShoppingSearchDialogProps {
  open: boolean
  onClose: () => void
}

type SortField = 'price' | 'score' | 'latency' | 'source'
type SortDirection = 'asc' | 'desc'

export function ShoppingSearchDialog({ open, onClose }: ShoppingSearchDialogProps) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [priceRange, setPriceRange] = useState<[number, number]>([50, 500])
  const [sortField, setSortField] = useState<SortField>('price')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchFilter, setSearchFilter] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [selectedConditions, setSelectedConditions] = useState<string[]>(['Used', 'New', 'Used - Good', 'Good'])
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([])
  const [selectedProduct, setSelectedProduct] = useState<DeviceMatch | null>(null)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(true)

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/shopping/search?max_price=${priceRange[1]}`)
      if (!response.ok) throw new Error('Search failed')
      
      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleConditionToggle = (condition: string) => {
    setSelectedConditions(prev =>
      prev.includes(condition) ? prev.filter(c => c !== condition) : [...prev, condition]
    )
  }

  const handleCompareToggle = (index: number) => {
    setSelectedForCompare(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index)
      } else if (prev.length < 3) {
        return [...prev, index]
      }
      return prev
    })
  }

  const getAveragePrice = (model: string | undefined) => {
    if (!model) return null
    // Mock average prices - in production, calculate from historical data
    const averages: Record<string, number> = {
      'Behringer ADA8200': 105,
      'MOTU 828mk3 Hybrid': 180,
      'Focusrite Scarlett 18i20': 160,
      'Audient ASP880': 200,
      'PreSonus AudioBox 1818VSL': 140,
    }
    return averages[model] || null
  }

  const isBestDeal = (result: SearchResult): boolean => {
    const avgPrice = getAveragePrice(result.matched_device?.model)
    if (!avgPrice) return false
    return result.price < avgPrice * 0.85 // 15% below average = best deal
  }

  // Auto-search on dialog open
  useEffect(() => {
    if (open && results.length === 0) {
      handleSearch()
    }
  }, [open])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredAndSortedResults = useMemo(() => {
    let filtered = results

    // Apply price range filter
    filtered = filtered.filter(r => r.price >= priceRange[0] && r.price <= priceRange[1])

    // Apply condition filter
    filtered = filtered.filter(r => selectedConditions.includes(r.condition))

    // Apply search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase()
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(search) ||
        r.matched_device?.model.toLowerCase().includes(search) ||
        r.source.toLowerCase().includes(search)
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortField) {
        case 'price':
          aVal = a.price
          bVal = b.price
          break
        case 'score':
          aVal = a.score
          bVal = b.score
          break
        case 'latency':
          aVal = a.matched_device?.latency_ms ?? 999
          bVal = b.matched_device?.latency_ms ?? 999
          break
        case 'source':
          aVal = a.source
          bVal = b.source
          break
        default:
          return 0
      }

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [results, searchFilter, sortField, sortDirection, priceRange, selectedConditions])

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

  const recommendations = results.length > 0 ? {
    adat: results.find(r => r.matched_device?.latency_ms === 0),
    lowLatency: [...results].filter(r => r.matched_device?.tier.includes('A') || r.matched_device?.tier.includes('S')).sort((a, b) => a.price - b.price)[0],
    bestValue: [...results].filter(r => r.matched_device?.tier === 'A' && r.price < 120).sort((a, b) => (b.score / b.price) - (a.score / a.price))[0],
  } : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        style: {
          background: '#0a0a0a',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          maxHeight: isMobile ? '100vh' : '90vh',
        }
      }}
    >
      <DialogTitle style={{ borderBottom: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShoppingCart size={24} weight="duotone" style={{ color: '#3b82f6' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#f3f4f6' }}>Find Your Next Audio Interface</div>
            <div style={{ fontSize: 13, color: '#d1d5db', fontWeight: 400, marginTop: 4 }}>
              Search eBay, ShopGoodwill, and Reverb for rackmount audio interfaces
            </div>
          </div>
        </div>
      </DialogTitle>

      <DialogContent style={{ padding: 24 }}>
        {/* Collapsible Disclaimer */}
        <Alert
          severity="warning"
          icon={<Warning size={20} weight="duotone" />}
          style={{
            marginBottom: 16,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
          action={
            <IconButton
              size="small"
              onClick={() => setDisclaimerOpen(!disclaimerOpen)}
              style={{ color: '#f59e0b' }}
            >
              {disclaimerOpen ? <CaretUp size={18} weight="bold" /> : <CaretDown size={18} weight="bold" />}
            </IconButton>
          }
        >
          <div style={{ fontWeight: 600, marginBottom: disclaimerOpen ? 8 : 0 }}>
            AI-Generated Recommendations - Not Verified
          </div>
          <Collapse in={disclaimerOpen}>
            <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6 }}>
              These audio interfaces have been algorithmically matched based on specifications, Linux compatibility databases, and community reports. 
              <strong> None have been physically tested or validated with MAP2 systems.</strong>
              <br /><br />
              Compatibility, latency performance, and driver behavior may vary. Always verify specifications independently before purchase. 
              No warranty or guarantee of compatibility is provided. Use at your own discretion.
            </div>
          </Collapse>
        </Alert>

        {/* Search Controls */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Price Range: ${priceRange[0]} - ${priceRange[1]}</div>
            <Slider
              value={priceRange}
              onChange={(_, newValue) => setPriceRange(newValue as [number, number])}
              valueLabelDisplay="auto"
              min={50}
              max={2000}
              step={10}
              marks={[
                { value: 50, label: '$50' },
                { value: 500, label: '$500' },
                { value: 1000, label: '$1k' },
                { value: 2000, label: '$2k' },
              ]}
            />
          </div>
          <TextField
            label="Search Results"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter by model, source..."
            InputProps={{
              startAdornment: <InputAdornment position="start"><MagnifyingGlass size={16} weight="duotone" /></InputAdornment>,
            }}
            style={{ flex: 1, minWidth: 200 }}
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <Funnel weight="duotone" />}
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {/* Condition Filters */}
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Condition Filters:</div>
          <FormGroup row>
            {['New', 'Used', 'Used - Good', 'Good'].map(condition => (
              <FormControlLabel
                key={condition}
                control={
                  <Checkbox
                    checked={selectedConditions.includes(condition)}
                    onChange={() => handleConditionToggle(condition)}
                    size="small"
                  />
                }
                label={<span style={{ fontSize: 13 }}>{condition}</span>}
              />
            ))}
          </FormGroup>
        </div>

        {/* Compare Mode Toggle */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            variant={compareMode ? 'contained' : 'outlined'}
            onClick={() => {
              setCompareMode(!compareMode)
              setSelectedForCompare([])
            }}
            startIcon={<GitDiff size={16} weight="duotone" />}
            size="small"
          >
            Compare Mode {compareMode && `(${selectedForCompare.length}/3)`}
          </Button>
          {compareMode && selectedForCompare.length >= 2 && (
            <Button variant="contained" color="success" size="small">
              Compare {selectedForCompare.length} Items
            </Button>
          )}
        </div>

        {error && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label={`All Results (${filteredAndSortedResults.length})`} />
            <Tab label="Top Recommendations" />
          </Tabs>
        </Box>

        {/* Tab: All Results */}
        {activeTab === 0 && (
          <>
            {loading && results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <CircularProgress />
                <div style={{ marginTop: 16, color: '#94a3b8' }}>Searching marketplaces...</div>
              </div>
            ) : filteredAndSortedResults.length === 0 ? (
              <Alert severity="info">No results found. Try adjusting your max price or filters.</Alert>
            ) : (
              <TableContainer style={{ maxHeight: 500, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {compareMode && <TableCell>Select</TableCell>}
                      <TableCell>
                        <TableSortLabel
                          active={sortField === 'price'}
                          direction={sortField === 'price' ? sortDirection : 'asc'}
                          onClick={() => handleSort('price')}
                        >
                          Price
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === 'score'}
                          direction={sortField === 'score' ? sortDirection : 'asc'}
                          onClick={() => handleSort('score')}
                        >
                          Tier
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === 'latency'}
                          direction={sortField === 'latency' ? sortDirection : 'asc'}
                          onClick={() => handleSort('latency')}
                        >
                          Latency
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === 'source'}
                          direction={sortField === 'source' ? sortDirection : 'asc'}
                          onClick={() => handleSort('source')}
                        >
                          Source
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell align="center">Link</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredAndSortedResults.map((result, index) => {
                      const isBest = isBestDeal(result)
                      return (
                        <TableRow
                          key={index}
                          hover
                          style={{
                            background: isBest ? 'rgba(34, 197, 94, 0.05)' : undefined,
                            borderLeft: isBest ? '3px solid #22c55e' : undefined,
                          }}
                        >
                          {compareMode && (
                            <TableCell>
                              <Checkbox
                                size="small"
                                checked={selectedForCompare.includes(index)}
                                onChange={() => handleCompareToggle(index)}
                                disabled={!selectedForCompare.includes(index) && selectedForCompare.length >= 3}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <strong style={{ color: '#22c55e' }}>${result.price.toFixed(2)}</strong>
                            {isBest && (
                              <Tooltip title="Great Deal! 15%+ below average market price">
                                <Chip
                                  label="🔥 DEAL"
                                  size="small"
                                  style={{
                                    marginLeft: 8,
                                    background: '#22c55e',
                                    color: 'white',
                                    fontWeight: 700,
                                  }}
                                />
                              </Tooltip>
                            )}
                            {result.shipping && (
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>+${result.shipping} ship</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.matched_device && (
                              <Chip
                                label={result.matched_device.tier}
                                size="small"
                                style={{
                                  background: getTierColor(result.matched_device.tier),
                                  color: 'white',
                                  fontWeight: 600,
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {result.matched_device && result.matched_device.latency_ms > 0
                              ? `${result.matched_device.latency_ms.toFixed(1)}ms`
                              : result.matched_device?.latency_ms === 0
                              ? <Chip label="ADAT Exp" size="small" color="info" />
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <div
                              style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#3b82f6', textDecoration: 'underline' }}
                              onClick={() => {
                                if (result.matched_device) {
                                  setSelectedProduct({
                                    ...result.matched_device,
                                    manufacturer: result.matched_device.model.split(' ')[0],
                                  })
                                  setProductDialogOpen(true)
                                }
                              }}
                            >
                              {result.matched_device?.model || 'Unknown'} <Info size={12} weight="duotone" style={{ display: 'inline', marginLeft: 4 }} />
                            </div>
                            {result.matched_device && (
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                {result.matched_device.io_count} • {result.matched_device.linux_support}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip label={result.source} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <div style={{ fontSize: 12, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {result.title}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{result.condition}</div>
                          </TableCell>
                          <TableCell align="center">
                            <MuiLink
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <ArrowSquareOut size={14} weight="duotone" /> View
                            </MuiLink>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {/* Tab: Recommendations */}
        {activeTab === 1 && recommendations && (
          <div className="stack" style={{ gap: 16 }}>
            {recommendations.adat && (
              <div className="card" style={{ padding: 16, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 24 }}>🎯</div>
                  <div>
                    <h4 style={{ margin: 0 }}>Best ADAT Expander</h4>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Add 8 inputs to your UA-1000</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{recommendations.adat.matched_device?.model}</div>
                    <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600 }}>${recommendations.adat.price.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      No drivers needed, pure ADAT to UA-1000
                    </div>
                  </div>
                  <Button
                    variant="contained"
                    color="success"
                    href={recommendations.adat.url}
                    target="_blank"
                    endIcon={<ArrowSquareOut size={16} weight="duotone" />}
                  >
                    View on {recommendations.adat.source}
                  </Button>
                </div>
              </div>
            )}

            {recommendations.lowLatency && (
              <div className="card" style={{ padding: 16, background: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 24 }}>⚡</div>
                  <div>
                    <h4 style={{ margin: 0 }}>Best Low-Latency Replacement</h4>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Tier S/A performance</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{recommendations.lowLatency.matched_device?.model}</div>
                    <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600 }}>${recommendations.lowLatency.price.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      {recommendations.lowLatency.matched_device?.latency_ms.toFixed(1)}ms @ 64 samples • {recommendations.lowLatency.matched_device?.notes}
                    </div>
                  </div>
                  <Button
                    variant="contained"
                    style={{ background: '#2563eb' }}
                    href={recommendations.lowLatency.url}
                    target="_blank"
                    endIcon={<ArrowSquareOut size={16} weight="duotone" />}
                  >
                    View on {recommendations.lowLatency.source}
                  </Button>
                </div>
              </div>
            )}

            {recommendations.bestValue && (
              <div className="card" style={{ padding: 16, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 24 }}>💎</div>
                  <div>
                    <h4 style={{ margin: 0 }}>Best Value (Performance/Price)</h4>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Top pick for budget-conscious</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{recommendations.bestValue.matched_device?.model}</div>
                    <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600 }}>${recommendations.bestValue.price.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Score: {recommendations.bestValue.score}/100 • {recommendations.bestValue.matched_device?.notes}
                    </div>
                  </div>
                  <Button
                    variant="contained"
                    style={{ background: '#f59e0b' }}
                    href={recommendations.bestValue.url}
                    target="_blank"
                    endIcon={<ArrowSquareOut size={16} weight="duotone" />}
                  >
                    View on {recommendations.bestValue.source}
                  </Button>
                </div>
              </div>
            )}

            <Alert severity="info">
              <strong>💡 Tip:</strong> The Behringer ADA8200 is the safest buy at ~$100. It's an ADAT expander that adds 8 mic preamps to your UA-1000 with zero Linux configuration needed!
            </Alert>
          </div>
        )}
      </DialogContent>

      <DialogActions
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          padding: 16,
          position: 'sticky',
          bottom: 0,
          background: 'var(--surface)',
          zIndex: 2,
        }}
      >
        <div style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>
          Found {filteredAndSortedResults.length} of {results.length} results • Sorted by {sortField} ({sortDirection})
        </div>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      {/* Product Detail Dialog */}
      <ProductDetailDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        product={selectedProduct}
      />
    </Dialog>
  )
}
