import { useEffect, useMemo, useState } from 'react'
import {
  AILabel,
  AILabelContent,
  Button,
  Checkbox,
  InlineNotification,
  Modal,
  NumberInput,
  Search,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Tag,
} from '@carbon/react'
import { ChevronDown, ChevronUp, Compare, Information, Launch, Search as SearchIcon } from '@carbon/icons-react'
import { API_BASE } from '../../map2/api'
import { ProductDetailDialog, type ProductDetails } from './ProductDetailDialog'
import { useIsMobile } from '../hooks/useIsMobile'
import { EmptyState } from './shared/EmptyState'
import { LoadingState } from './shared/LoadingState'
import './ShoppingSearchDialog.css'

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

const CONDITION_OPTIONS = ['New', 'Used', 'Used - Good', 'Good'] as const

function getTierTagType(tier: string): 'cyan' | 'blue' | 'green' | 'teal' | 'warm-gray' | 'cool-gray' {
  switch (tier) {
    case 'S+':
      return 'cyan'
    case 'S':
      return 'blue'
    case 'A+':
      return 'green'
    case 'A':
      return 'teal'
    case 'B':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

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
  const [selectedConditions, setSelectedConditions] = useState<string[]>([...CONDITION_OPTIONS])
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductDetails | null>(null)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(true)

  const handleSearch = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/shopping/search?max_price=${priceRange[1]}`)
      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleConditionToggle = (condition: string) => {
    setSelectedConditions((prev) =>
      prev.includes(condition) ? prev.filter((entry) => entry !== condition) : [...prev, condition],
    )
  }

  const handleCompareToggle = (index: number) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(index)) {
        return prev.filter((entry) => entry !== index)
      }
      if (prev.length < 3) {
        return [...prev, index]
      }
      return prev
    })
  }

  const getAveragePrice = (model: string | undefined) => {
    if (!model) {
      return null
    }

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
    if (!avgPrice) {
      return false
    }
    return result.price < avgPrice * 0.85
  }

  useEffect(() => {
    if (open && results.length === 0) {
      void handleSearch()
    }
  }, [open])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection('asc')
  }

  const filteredAndSortedResults = useMemo(() => {
    let filtered = results

    filtered = filtered.filter((entry) => entry.price >= priceRange[0] && entry.price <= priceRange[1])
    filtered = filtered.filter((entry) => selectedConditions.includes(entry.condition))

    if (searchFilter) {
      const search = searchFilter.toLowerCase()
      filtered = filtered.filter(
        (entry) =>
          entry.title.toLowerCase().includes(search) ||
          entry.matched_device?.model.toLowerCase().includes(search) ||
          entry.source.toLowerCase().includes(search),
      )
    }

    return [...filtered].sort((a, b) => {
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
  }, [priceRange, results, searchFilter, selectedConditions, sortDirection, sortField])

  const recommendations =
    results.length > 0
      ? {
          adat: results.find((entry) => entry.matched_device?.latency_ms === 0),
          lowLatency: [...results]
            .filter((entry) => entry.matched_device?.tier.includes('A') || entry.matched_device?.tier.includes('S'))
            .sort((a, b) => a.price - b.price)[0],
          bestValue: [...results]
            .filter((entry) => entry.matched_device?.tier === 'A' && entry.price < 120)
            .sort((a, b) => b.score / b.price - a.score / a.price)[0],
        }
      : null

  const sortLabel = `${sortField} (${sortDirection})`

  const renderSortHeader = (label: string, field: SortField) => {
    const active = sortField === field
    const direction = active ? (sortDirection === 'asc' ? '↑' : '↓') : ''

    return (
      <button
        type="button"
        className="shopping-search-dialog__sort-button"
        onClick={() => handleSort(field)}
      >
        {label} {direction}
      </button>
    )
  }

  return (
    <>
      <Modal
        open={open}
        size={isMobile ? 'sm' : 'lg'}
        modalHeading="Find your next audio interface"
        modalLabel="Marketplace assistant"
        primaryButtonText="Close"
        secondaryButtonText="Refresh results"
        onRequestClose={onClose}
        onRequestSubmit={onClose}
        onSecondarySubmit={() => {
          void handleSearch()
        }}
        selectorPrimaryFocus="#shopping-search-filter-input"
      >
        <div className="shopping-search-dialog">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="AI-generated recommendations are not verified"
            subtitle="Compatibility, latency, and driver behavior may vary. Verify all specs independently before purchase."
          />
          <div className="shopping-search-dialog__ai-label-row">
            <AILabel kind="inline" size="mini" textLabel="AI">
              <AILabelContent>
                Recommendations are inferred from marketplace listings and historical metadata.
              </AILabelContent>
            </AILabel>
          </div>

          <button
            type="button"
            className="shopping-search-dialog__disclaimer-toggle"
            onClick={() => setDisclaimerOpen((prev) => !prev)}
          >
            {disclaimerOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            {disclaimerOpen ? 'Hide detail notes' : 'Show detail notes'}
          </button>

          {disclaimerOpen && (
            <p className="shopping-search-dialog__disclaimer-body">
              These suggestions are algorithmic matches from marketplace listings and community reports. None of the
              options are physically validated with MAP2 systems in this view.
            </p>
          )}

          <div className="shopping-search-dialog__filters">
            <NumberInput
              id="shopping-search-min-price"
              label="Minimum price"
              min={0}
              max={2000}
              value={priceRange[0]}
              onChange={(_, state) => {
                const value = Number(state.value)
                if (Number.isFinite(value)) {
                  setPriceRange((prev) => [Math.max(0, Math.min(value, prev[1])), prev[1]])
                }
              }}
            />

            <NumberInput
              id="shopping-search-max-price"
              label="Maximum price"
              min={0}
              max={5000}
              value={priceRange[1]}
              onChange={(_, state) => {
                const value = Number(state.value)
                if (Number.isFinite(value)) {
                  setPriceRange((prev) => [Math.min(prev[0], value), Math.max(value, prev[0])])
                }
              }}
            />

            <Search
              id="shopping-search-filter-input"
              labelText="Search results"
              placeholder="Filter by model, source, or title"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
            />

            <Button kind="tertiary" renderIcon={SearchIcon} disabled={loading} onClick={() => void handleSearch()}>
              {loading ? 'Searching' : 'Search'}
            </Button>
          </div>

          <div className="shopping-search-dialog__conditions">
            {CONDITION_OPTIONS.map((condition) => (
              <Checkbox
                key={condition}
                id={`shopping-search-condition-${condition.replace(/\s+/g, '-').toLowerCase()}`}
                labelText={condition}
                checked={selectedConditions.includes(condition)}
                onChange={() => handleConditionToggle(condition)}
              />
            ))}
          </div>

          <div className="shopping-search-dialog__compare-row">
            <Button
              kind={compareMode ? 'primary' : 'tertiary'}
              renderIcon={Compare}
              onClick={() => {
                setCompareMode((prev) => !prev)
                setSelectedForCompare([])
              }}
            >
              Compare mode {compareMode ? `(${selectedForCompare.length}/3)` : ''}
            </Button>
            {compareMode && selectedForCompare.length >= 2 && (
              <Tag type="green">Ready to compare {selectedForCompare.length} items</Tag>
            )}
          </div>

          {error && <InlineNotification kind="error" lowContrast hideCloseButton title="Search failed" subtitle={error} />}

          <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
            <TabList aria-label="Shopping search tabs" contained>
              <Tab>All results ({filteredAndSortedResults.length})</Tab>
              <Tab>Top recommendations</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                {loading && results.length === 0 ? (
                  <div className="shopping-search-dialog__loading">
                    <LoadingState description="Searching marketplaces" />
                  </div>
                ) : filteredAndSortedResults.length === 0 ? (
                  <EmptyState
                    title="No results found"
                    description="Adjust price limits or search filters and try again."
                    compact
                  />
                ) : (
                  <TableContainer className="shopping-search-dialog__table-container">
                    <Table size="sm" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          {compareMode && <TableHeader>Select</TableHeader>}
                          <TableHeader>{renderSortHeader('Price', 'price')}</TableHeader>
                          <TableHeader>{renderSortHeader('Tier', 'score')}</TableHeader>
                          <TableHeader>{renderSortHeader('Latency', 'latency')}</TableHeader>
                          <TableHeader>Model</TableHeader>
                          <TableHeader>{renderSortHeader('Source', 'source')}</TableHeader>
                          <TableHeader>Listing</TableHeader>
                          <TableHeader>Link</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredAndSortedResults.map((result, index) => {
                          const bestDeal = isBestDeal(result)
                          const modelName = result.matched_device?.model || 'Unknown model'

                          return (
                            <TableRow key={`${result.url}-${index}`} className={bestDeal ? 'shopping-search-dialog__row--deal' : undefined}>
                              {compareMode && (
                                <TableCell>
                                  <Checkbox
                                    id={`shopping-search-compare-${index}`}
                                    hideLabel
                                    labelText={`Select ${modelName} for compare`}
                                    checked={selectedForCompare.includes(index)}
                                    disabled={!selectedForCompare.includes(index) && selectedForCompare.length >= 3}
                                    onChange={() => handleCompareToggle(index)}
                                  />
                                </TableCell>
                              )}

                              <TableCell>
                                <div className="shopping-search-dialog__price-cell">
                                  <strong>${result.price.toFixed(2)}</strong>
                                  {bestDeal && <Tag type="green">Deal</Tag>}
                                </div>
                                {typeof result.shipping === 'number' && (
                                  <span className="shopping-search-dialog__muted">+${result.shipping} shipping</span>
                                )}
                              </TableCell>

                              <TableCell>
                                {result.matched_device ? (
                                  <Tag type={getTierTagType(result.matched_device.tier)}>{result.matched_device.tier}</Tag>
                                ) : (
                                  <span className="shopping-search-dialog__muted">-</span>
                                )}
                              </TableCell>

                              <TableCell>
                                {result.matched_device && result.matched_device.latency_ms > 0
                                  ? `${result.matched_device.latency_ms.toFixed(1)} ms`
                                  : result.matched_device?.latency_ms === 0
                                    ? 'ADAT expander'
                                    : '-'}
                              </TableCell>

                              <TableCell>
                                <button
                                  type="button"
                                  className="shopping-search-dialog__model-link"
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
                                  {modelName}
                                  <Information size={14} aria-hidden="true" />
                                </button>
                                {result.matched_device && (
                                  <div className="shopping-search-dialog__muted">
                                    {result.matched_device.io_count} • {result.matched_device.linux_support}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell>
                                <Tag type="cool-gray">{result.source}</Tag>
                              </TableCell>

                              <TableCell>
                                <div className="shopping-search-dialog__listing-title">{result.title}</div>
                                <div className="shopping-search-dialog__muted">{result.condition}</div>
                              </TableCell>

                              <TableCell>
                                <a
                                  href={result.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shopping-search-dialog__result-link"
                                >
                                  View <Launch size={14} aria-hidden="true" />
                                </a>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </TabPanel>

              <TabPanel>
                <div className="shopping-search-dialog__recommendations">
                  {recommendations?.adat && (
                    <article className="shopping-search-dialog__recommendation-card shopping-search-dialog__recommendation-card--success">
                      <h4>Best ADAT expander</h4>
                      <p className="shopping-search-dialog__recommendation-meta">Add 8 inputs to your UA-1000</p>
                      <p>{recommendations.adat.matched_device?.model}</p>
                      <p>${recommendations.adat.price.toFixed(2)}</p>
                      <Button
                        kind="ghost"
                        renderIcon={Launch}
                        onClick={() => window.open(recommendations.adat!.url, '_blank', 'noopener,noreferrer')}
                      >
                        View on {recommendations.adat.source}
                      </Button>
                    </article>
                  )}

                  {recommendations?.lowLatency && (
                    <article className="shopping-search-dialog__recommendation-card shopping-search-dialog__recommendation-card--info">
                      <h4>Best low-latency replacement</h4>
                      <p className="shopping-search-dialog__recommendation-meta">Tier S/A performance</p>
                      <p>{recommendations.lowLatency.matched_device?.model}</p>
                      <p>${recommendations.lowLatency.price.toFixed(2)}</p>
                      <p className="shopping-search-dialog__muted">
                        {recommendations.lowLatency.matched_device?.latency_ms.toFixed(1)} ms @ 64 samples
                      </p>
                      <Button
                        kind="ghost"
                        renderIcon={Launch}
                        onClick={() => window.open(recommendations.lowLatency!.url, '_blank', 'noopener,noreferrer')}
                      >
                        View on {recommendations.lowLatency.source}
                      </Button>
                    </article>
                  )}

                  {recommendations?.bestValue && (
                    <article className="shopping-search-dialog__recommendation-card shopping-search-dialog__recommendation-card--warning">
                      <h4>Best value</h4>
                      <p className="shopping-search-dialog__recommendation-meta">Performance to price leader</p>
                      <p>{recommendations.bestValue.matched_device?.model}</p>
                      <p>${recommendations.bestValue.price.toFixed(2)}</p>
                      <p className="shopping-search-dialog__muted">Score: {recommendations.bestValue.score}/100</p>
                      <Button
                        kind="ghost"
                        renderIcon={Launch}
                        onClick={() => window.open(recommendations.bestValue!.url, '_blank', 'noopener,noreferrer')}
                      >
                        View on {recommendations.bestValue.source}
                      </Button>
                    </article>
                  )}

                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title="Tip"
                    subtitle="Behringer ADA8200 is usually a safe low-cost ADAT option with straightforward Linux setup."
                  />
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>

          <p className="shopping-search-dialog__summary">
            Found {filteredAndSortedResults.length} of {results.length} results • Sorted by {sortLabel}
          </p>
        </div>
      </Modal>

      <ProductDetailDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        product={selectedProduct}
      />
    </>
  )
}
