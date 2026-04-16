import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Modal,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tabs,
  Tag,
} from '@carbon/react'
import { CheckmarkFilled, Information, Launch, WarningAlt } from '@carbon/icons-react'
import { useIsMobile } from '../hooks/useIsMobile'
import './ProductDetailDialog.css'

export interface ProductDetails {
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
}

interface ProductDetailDialogProps {
  open: boolean
  onClose: () => void
  product: ProductDetails | null
}

function getLinuxRating(support: string) {
  switch (support.toLowerCase()) {
    case 'excellent':
      return 5
    case 'good':
      return 4
    case 'fair':
      return 3
    case 'poor':
      return 2
    default:
      return 1
  }
}

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

export function ProductDetailDialog({ open, onClose, product }: ProductDetailDialogProps) {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    if (!open) {
      setActiveTab(0)
    }
  }, [open])

  if (!product) {
    return null
  }

  const linuxRating = getLinuxRating(product.linux_support)

  const specs = useMemo(
    () => [
      { label: 'Model', value: product.model },
      { label: 'Manufacturer', value: product.manufacturer || 'Unknown manufacturer' },
      { label: 'I/O count', value: product.io_count },
      {
        label: 'Round-trip latency (64 samples)',
        value: product.latency_ms === 0 ? 'N/A (ADAT expander)' : `${product.latency_ms} ms`,
      },
      {
        label: 'Linux driver',
        value:
          product.linux_support === 'Excellent'
            ? 'Class-compliant (no driver needed)'
            : 'Requires additional configuration',
      },
      ...(product.release_year ? [{ label: 'Release year', value: String(product.release_year) }] : []),
    ],
    [product],
  )

  const openWebSearch = () => {
    const query = encodeURIComponent(`${product.model} audio interface`)
    window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open={open}
      size={isMobile ? 'sm' : 'lg'}
      modalHeading={product.model}
      modalLabel={product.manufacturer || 'Unknown manufacturer'}
      primaryButtonText="Search for this device"
      secondaryButtonText="Close"
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={openWebSearch}
      selectorPrimaryFocus="#product-detail-dialog-tabs"
    >
      <div className="product-detail-dialog__body">
        <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
          <TabList aria-label="Product detail tabs" contained id="product-detail-dialog-tabs">
            <Tab>Overview</Tab>
            <Tab>Specifications</Tab>
            <Tab>Linux setup</Tab>
            <Tab>Gallery</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <div className="product-detail-dialog__panel">
                <div
                  className="product-detail-dialog__image-placeholder"
                  role="img"
                  aria-label={`${product.model} reference image unavailable`}
                >
                  <p>Reference image unavailable</p>
                  <p>{product.model}</p>
                </div>

                <div className="product-detail-dialog__stats-grid">
                  <section className="product-detail-dialog__stat-card">
                    <h4>Performance tier</h4>
                    <Tag type={getTierTagType(product.tier)}>{product.tier}</Tag>
                  </section>
                  <section className="product-detail-dialog__stat-card">
                    <h4>Linux compatibility</h4>
                    <div className="product-detail-dialog__linux-rating" aria-label={`Linux rating ${linuxRating} out of 5`}>
                      <span>{linuxRating}/5</span>
                      <span>{product.linux_support}</span>
                    </div>
                  </section>
                  <section className="product-detail-dialog__stat-card">
                    <h4>Round-trip latency</h4>
                    <p className="product-detail-dialog__metric">
                      {product.latency_ms === 0 ? 'ADAT expander' : `${product.latency_ms.toFixed(1)} ms`}
                    </p>
                  </section>
                  <section className="product-detail-dialog__stat-card">
                    <h4>I/O configuration</h4>
                    <p className="product-detail-dialog__metric">{product.io_count}</p>
                  </section>
                </div>

                <section className="product-detail-dialog__notes-card">
                  <h4>Notes</h4>
                  <p>{product.notes}</p>
                </section>

                {product.price_range && (
                  <section className="product-detail-dialog__notes-card product-detail-dialog__price-card">
                    <h4>Typical used market price</h4>
                    <p>{product.price_range}</p>
                  </section>
                )}
              </div>
            </TabPanel>

            <TabPanel>
              <div className="product-detail-dialog__panel">
                <TableContainer>
                  <Table size="sm" useZebraStyles={false}>
                    <TableBody>
                      {specs.map((entry) => (
                        <TableRow key={entry.label}>
                          <TableCell>{entry.label}</TableCell>
                          <TableCell>{entry.value}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell>Performance tier</TableCell>
                        <TableCell>
                          <Tag type={getTierTagType(product.tier)}>{product.tier}</Tag>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                <section className="product-detail-dialog__note-banner">
                  <Information size={16} aria-hidden="true" />
                  <div>
                    <p className="product-detail-dialog__note-title">Technical note</p>
                    <p>
                      Detailed specifications such as converters, supported sample rates, and connection types should be
                      validated against official manufacturer documentation.
                    </p>
                  </div>
                </section>
              </div>
            </TabPanel>

            <TabPanel>
              <div className="product-detail-dialog__panel">
                <section className="product-detail-dialog__note-banner product-detail-dialog__note-banner--success">
                  <CheckmarkFilled size={16} aria-hidden="true" />
                  <div>
                    <p className="product-detail-dialog__note-title">Linux compatibility: {product.linux_support}</p>
                    <p>Compatibility rating: {linuxRating}/5</p>
                  </div>
                </section>

                <section className="product-detail-dialog__notes-card">
                  <h4>Setup instructions</h4>
                  {product.linux_support === 'Excellent' ? (
                    <p>
                      This device is class-compliant and should be plug-and-play on Linux. Run <code>aplay -l</code> to
                      verify that the interface is detected.
                    </p>
                  ) : (
                    <p>
                      This device may need ALSA configuration or additional tuning. Validate community guidance before
                      deployment in production rigs.
                    </p>
                  )}
                </section>

                <section className="product-detail-dialog__notes-card">
                  <h4>JACK configuration</h4>
                  <code className="product-detail-dialog__code">
                    jackd -d alsa -d hw:{product.model.toLowerCase().replace(/\s/g, '')} -r 48000 -p 64 -n 2
                  </code>
                </section>

                <section className="product-detail-dialog__note-banner product-detail-dialog__note-banner--warning">
                  <WarningAlt size={16} aria-hidden="true" />
                  <div>
                    <p className="product-detail-dialog__note-title">Community resources</p>
                    <ul>
                      <li>LinuxMusicians forum discussions</li>
                      <li>Arch Wiki audio setup documentation</li>
                      <li>Ubuntu Studio compatibility notes</li>
                    </ul>
                  </div>
                </section>
              </div>
            </TabPanel>

            <TabPanel>
              <div className="product-detail-dialog__panel">
                <div className="product-detail-dialog__gallery-grid">
                  {[1, 2, 3, 4].map((index) => (
                    <div key={index} className="product-detail-dialog__gallery-item">
                      Photo {index}
                    </div>
                  ))}
                </div>
                <p className="product-detail-dialog__gallery-caption">
                  Manufacturer images, user setups, and rack configurations can be attached here.
                </p>
                <Button kind="ghost" renderIcon={Launch} onClick={openWebSearch}>
                  Open web image search
                </Button>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </Modal>
  )
}
