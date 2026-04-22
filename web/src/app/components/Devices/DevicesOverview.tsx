/**
 * DevicesOverview — MAP2 Hardware Store.
 *
 * Refashions /devices into a Carbon Design System storefront where each
 * supported hardware unit is a purchasable product card. "Pinning" a device
 * adds it to the Workspace section in the global nav. Status tags become stock
 * tags. Capabilities become feature chips. Fully interactive with pin/unpin,
 * filters, search, and a quickview modal.
 */
import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Tag, Search, Modal } from '@carbon/react'
import {
  PinFilled,
  Pin,
  ShoppingCart,
  Filter,
  Launch,
  CheckmarkFilled,
  CircleDash,
  CircleFilled,
  InProgress,
  Close,
} from '@carbon/icons-react'

import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
  type DeviceRegistryEntry,
  type DeviceStatusKind,
  type DeviceTransportLayer,
} from '../../data/deviceRegistry'
import { getDeviceHeroImage } from '../../data/deviceHeroImages'
import { useClusterHardwareInventory } from '../../hooks/useDeviceLocation'
import { enrichedPhysicalSurfacesApi } from '../../../map2/clients/enrichedPhysicalSurfaces'
import type { EnrichedPhysicalSurfaceUnit } from '../../../map2/types'
import { useStorefrontState, type KindFilter, type StockFilter } from './useStorefrontState'

import './DevicesOverview.css'

// ---------------------------------------------------------------------------
// Status resolution (unchanged from original)
// ---------------------------------------------------------------------------

type StatusTagType = 'green' | 'blue' | 'cool-gray' | 'warm-gray' | 'red'

interface DeviceStatus {
  kind: DeviceStatusKind
  label: string
  stockLabel: string
  tone: StatusTagType
  detail?: string
}

const DEVICE_TYPE_SEARCH_TERMS: Record<string, string[]> = {
  'ableton-push': ['ableton push', 'push 1', 'push 2', 'push 3', 'push'],
  'edirol-ua1000': ['edirol ua 1000', 'ua 1000', '0582 0074'],
  'hotone-jogg': ['hotone jogg', 'jogg', '84ef 0014'],
  'lexicon-mpx1': ['lexicon mpx 1', 'mpx 1', 'lexicon'],
  'rocktron-intelfx': ['rocktron intellifex', 'intellifex', 'intel fx', 'rocktron'],
  'biamp-tesira': ['biamp tesira', 'tesira', 'biamp'],
  'lcd-console': ['lcd console', 'map2 lcd'],
  'ground-control-pro': ['ground control pro', 'voodoo lab', 'gc pro'],
  'mackie-mcu-pro': ['mackie mcu pro', 'mcu pro', 'mackie control'],
  'novation-launch-control': ['novation launch control', 'launch control'],
  'meloaudio-midi-commander': ['meloaudio midi commander', 'midi commander'],
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function deviceLocationPresent(
  inventory: Record<string, any> | undefined,
  deviceKey: string | string[],
): boolean {
  if (!inventory) return false
  const needles = Array.isArray(deviceKey)
    ? deviceKey
    : (DEVICE_TYPE_SEARCH_TERMS[deviceKey] ?? [deviceKey])
  for (const node of Object.values(inventory)) {
    const haystacks: string[] = []
    for (const device of (node as any).usb_audio_devices ?? []) {
      haystacks.push(normalize((device as any).name) + ' ' + normalize((device as any).product))
    }
    for (const device of (node as any).midi_devices ?? []) {
      haystacks.push(normalize((device as any).name) + ' ' + normalize((device as any).product))
    }
    for (const label of (node as any).audio_interfaces ?? []) {
      haystacks.push(normalize(label))
    }
    const combined = haystacks.join(' ')
    if (needles.some((needle) => combined.includes(normalize(needle)))) return true
  }
  return false
}

function surfaceStatusFor(
  units: EnrichedPhysicalSurfaceUnit[] | undefined,
  surfaceId: string,
): { status: EnrichedPhysicalSurfaceUnit['status']; name: string } | null {
  if (!units) return null
  const match = units.find(
    (unit) =>
      unit.unit_id === surfaceId ||
      unit.device_type === surfaceId ||
      (unit.family ?? '').toLowerCase() === surfaceId.toLowerCase(),
  )
  if (!match) return null
  return { status: match.status, name: match.display_name }
}

function toDeviceStatus(
  entry: DeviceRegistryEntry,
  inventory: Record<string, any> | undefined,
  surfaces: EnrichedPhysicalSurfaceUnit[] | undefined,
): DeviceStatus {
  if (entry.statusSource.kind === 'planned') {
    return { kind: 'planned', label: 'planned', stockLabel: 'Coming Soon', tone: 'cool-gray' }
  }
  if (entry.statusSource.kind === 'device-location') {
    const found = deviceLocationPresent(inventory, entry.statusSource.deviceKey)
    return found
      ? { kind: 'online', label: 'online', stockLabel: 'In Stock', tone: 'green' }
      : { kind: 'offline', label: 'offline', stockLabel: 'Out of Stock', tone: 'warm-gray' }
  }
  const surface = surfaceStatusFor(surfaces, entry.statusSource.surfaceId)
  if (!surface) {
    return { kind: 'offline', label: 'offline', stockLabel: 'Out of Stock', tone: 'warm-gray' }
  }
  if (surface.status === 'online') {
    return { kind: 'online', label: 'online', stockLabel: 'In Stock', tone: 'green', detail: surface.name }
  }
  if (surface.status === 'detected') {
    return { kind: 'detected', label: 'detected', stockLabel: 'Detected', tone: 'blue', detail: surface.name }
  }
  if (surface.status === 'attention') {
    return { kind: 'offline', label: 'attention', stockLabel: 'Attention', tone: 'red', detail: surface.name }
  }
  return { kind: 'planned', label: 'planned', stockLabel: 'Coming Soon', tone: 'cool-gray', detail: surface.name }
}

function transportLayerTone(status: DeviceTransportLayer['status']): StatusTagType {
  if (status === 'online') return 'green'
  if (status === 'detected') return 'blue'
  if (status === 'offline') return 'red'
  return 'cool-gray'
}

// ---------------------------------------------------------------------------
// Storefront helpers
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<DeviceRegistryEntry['kind'], string> = {
  'audio-interface': 'Audio Interfaces',
  processor: 'Processors',
  console: 'Consoles',
  'control-surface': 'Control Surfaces',
}

const KIND_SUBTITLES: Record<DeviceRegistryEntry['kind'], string> = {
  'audio-interface': 'USB audio interfaces and host-side routing.',
  processor: 'Rack processors, AVB DSP, and effects units.',
  console: 'On-site consoles and status surfaces.',
  'control-surface': 'Controller families, transport layers, and device-specific surfaces.',
}

const KIND_FILTER_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'control-surface', label: 'Control Surfaces' },
  { value: 'processor', label: 'Processors' },
  { value: 'audio-interface', label: 'Audio Interfaces' },
  { value: 'console', label: 'Consoles' },
]

const STOCK_FILTER_OPTIONS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All Stock' },
  { value: 'in-stock', label: 'In Stock' },
  { value: 'detected', label: 'Detected' },
  { value: 'planned', label: 'Coming Soon' },
]

function StockIcon({ kind }: { kind: DeviceStatusKind }) {
  if (kind === 'online') return <CheckmarkFilled size={14} className="store-product__stock-icon store-product__stock-icon--online" />
  if (kind === 'detected') return <InProgress size={14} className="store-product__stock-icon store-product__stock-icon--detected" />
  if (kind === 'planned') return <CircleDash size={14} className="store-product__stock-icon store-product__stock-icon--planned" />
  return <CircleFilled size={14} className="store-product__stock-icon store-product__stock-icon--offline" />
}

// ---------------------------------------------------------------------------
// Product Card
// ---------------------------------------------------------------------------

interface ProductCardProps {
  entry: DeviceRegistryEntry
  status: DeviceStatus
  pinned: boolean
  onTogglePin: (id: string) => void
  onQuickview: (id: string) => void
}

function ProductCard({ entry, status, pinned, onTogglePin, onQuickview }: ProductCardProps) {
  const navigate = useNavigate()
  const hero = getDeviceHeroImage(entry.id)

  const handleOpen = useCallback(() => navigate(buildDeviceRoute(entry.id)), [entry.id, navigate])
  const handlePin = useCallback(() => onTogglePin(entry.id), [entry.id, onTogglePin])
  const handleQuickview = useCallback(() => onQuickview(entry.id), [entry.id, onQuickview])

  return (
    <article
      className={`store-product${pinned ? ' store-product--pinned' : ''}`}
      style={{ '--device-color': entry.color } as React.CSSProperties}
      data-kind={entry.kind}
      data-status={status.kind}
    >
      {/* Hero image */}
      <div
        className="store-product__hero"
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen() } }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${entry.label}`}
      >
        {hero ? (
          <img src={hero.imagePath} alt={hero.alt} className="store-product__hero-img" loading="lazy" />
        ) : (
          <div className="store-product__hero-placeholder">
            <entry.icon size={48} aria-hidden />
          </div>
        )}
        <div className="store-product__hero-overlay">
          <span className="store-product__hero-cta">Open Surface Page</span>
        </div>
        {pinned && (
          <span className="store-product__pinned-badge" aria-label="Pinned to workspace">
            <PinFilled size={12} aria-hidden /> Pinned
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="store-product__body">
        <div className="store-product__meta">
          <p className="store-product__eyebrow">{entry.eyebrow}</p>
          <div className="store-product__stock">
            <StockIcon kind={status.kind} />
            <span className="store-product__stock-label" data-tone={status.tone}>
              {status.stockLabel}
            </span>
          </div>
        </div>

        <h2 className="store-product__title">{entry.label}</h2>
        <p className="store-product__description">{entry.description}</p>

        {/* Capability chips */}
        <div className="store-product__chips" aria-label="Capabilities">
          {entry.capabilities.slice(0, 4).map((cap) => (
            <Tag key={cap} type="cool-gray" size="sm">{cap}</Tag>
          ))}
        </div>

        {/* Transport layers */}
        {entry.transportLayers.length > 0 && (
          <ul className="store-product__transport" aria-label="Transport layers">
            {entry.transportLayers.map((layer) => (
              <li key={layer.id}>
                <span className="store-product__transport-label">{layer.label}</span>
                <Tag type={transportLayerTone(layer.status)} size="sm">{layer.status}</Tag>
              </li>
            ))}
          </ul>
        )}

        {/* Actions */}
        <div className="store-product__actions">
          <Button
            kind={pinned ? 'danger--ghost' : 'primary'}
            size="sm"
            renderIcon={pinned ? PinFilled : Pin}
            onClick={handlePin}
            aria-pressed={pinned}
          >
            {pinned ? 'Unpin' : 'Pin to Workspace'}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Launch}
            onClick={handleQuickview}
          >
            Quick View
          </Button>
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Quickview Modal
// ---------------------------------------------------------------------------

interface QuickviewModalProps {
  entry: DeviceRegistryEntry
  status: DeviceStatus
  pinned: boolean
  onClose: () => void
  onTogglePin: (id: string) => void
}

function QuickviewModal({ entry, status, pinned, onClose, onTogglePin }: QuickviewModalProps) {
  const navigate = useNavigate()
  const hero = getDeviceHeroImage(entry.id)

  return (
    <Modal
      open
      size="lg"
      modalHeading={entry.label}
      passiveModal
      onRequestClose={onClose}
      className="store-quickview"
    >
      <div className="store-quickview__layout">
        {/* Left: hero */}
        <div className="store-quickview__hero">
          {hero ? (
            <img src={hero.imagePath} alt={hero.alt} className="store-quickview__hero-img" />
          ) : (
            <div className="store-quickview__hero-placeholder">
              <entry.icon size={64} aria-hidden />
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="store-quickview__detail">
          <p className="store-quickview__eyebrow">{entry.eyebrow}</p>

          <div className="store-quickview__stock">
            <StockIcon kind={status.kind} />
            <span className="store-quickview__stock-label" data-tone={status.tone}>
              {status.stockLabel}
            </span>
            {status.detail && (
              <span className="store-quickview__stock-detail">— {status.detail}</span>
            )}
          </div>

          <p className="store-quickview__description">{entry.description}</p>

          <div className="store-quickview__section-title">Capabilities</div>
          <div className="store-quickview__chips">
            {entry.capabilities.map((cap) => (
              <Tag key={cap} type="cool-gray" size="sm">{cap}</Tag>
            ))}
          </div>

          {entry.transportLayers.length > 0 && (
            <>
              <div className="store-quickview__section-title">Transport Layers</div>
              <ul className="store-quickview__transport">
                {entry.transportLayers.map((layer) => (
                  <li key={layer.id}>
                    <span>{layer.label}</span>
                    <Tag type={transportLayerTone(layer.status)} size="sm">{layer.status}</Tag>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="store-quickview__section-title">Views</div>
          <div className="store-quickview__views">
            {entry.views.map((view) => (
              <button
                key={view.id}
                type="button"
                className="store-quickview__view-chip"
                style={{ '--view-color': view.color } as React.CSSProperties}
                onClick={() => { navigate(buildDeviceRoute(entry.id, view.id)); onClose() }}
              >
                <view.icon size={12} aria-hidden />
                {view.label}
              </button>
            ))}
          </div>

          <div className="store-quickview__actions">
            <Button
              kind={pinned ? 'danger--ghost' : 'primary'}
              renderIcon={pinned ? PinFilled : Pin}
              onClick={() => { onTogglePin(entry.id) }}
            >
              {pinned ? 'Unpin from Workspace' : 'Pin to Workspace'}
            </Button>
            <Button
              kind="secondary"
              renderIcon={Launch}
              onClick={() => { navigate(buildDeviceRoute(entry.id)); onClose() }}
            >
              Open Surface Page
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Storefront toolbar
// ---------------------------------------------------------------------------

interface StorefrontToolbarProps {
  query: string
  kind: KindFilter
  stock: StockFilter
  onQuery: (q: string) => void
  onKind: (k: KindFilter) => void
  onStock: (s: StockFilter) => void
  resultCount: number
  pinnedCount: number
}

function StorefrontToolbar({
  query,
  kind,
  stock,
  onQuery,
  onKind,
  onStock,
  resultCount,
  pinnedCount,
}: StorefrontToolbarProps) {
  return (
    <div className="store-toolbar">
      <div className="store-toolbar__search">
        <Search
          size="sm"
          labelText="Search devices"
          placeholder="Search hardware…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onClear={() => onQuery('')}
        />
      </div>

      <div className="store-toolbar__filters" role="group" aria-label="Filter by category">
        <Filter size={16} aria-hidden className="store-toolbar__filter-icon" />
        {KIND_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`store-toolbar__filter-btn${kind === opt.value ? ' is-active' : ''}`}
            onClick={() => onKind(opt.value)}
            aria-pressed={kind === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="store-toolbar__stock-filters" role="group" aria-label="Filter by stock status">
        {STOCK_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`store-toolbar__stock-btn${stock === opt.value ? ' is-active' : ''}`}
            onClick={() => onStock(opt.value)}
            aria-pressed={stock === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="store-toolbar__meta">
        <span className="store-toolbar__count">{resultCount} product{resultCount !== 1 ? 's' : ''}</span>
        {pinnedCount > 0 && (
          <span className="store-toolbar__pinned-count">
            <ShoppingCart size={14} aria-hidden />
            {pinnedCount} pinned
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function DevicesOverview() {
  const inventoryQuery = useClusterHardwareInventory(true)
  const surfacesQuery = useQuery({
    queryKey: ['devices-overview', 'physical-surfaces'],
    queryFn: () => enrichedPhysicalSurfacesApi.getSummary(),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  const {
    pinned,
    isPinned,
    togglePin,
    quickviewId,
    openQuickview,
    closeQuickview,
    filters,
    setKind,
    setStock,
    setQuery,
  } = useStorefrontState()

  const statusByDevice = useMemo(() => {
    const result: Record<string, DeviceStatus> = {}
    const inventory = inventoryQuery.data?.nodes
    const surfaces = surfacesQuery.data?.summary.units
    for (const entry of DEVICE_REGISTRY) {
      result[entry.id] = toDeviceStatus(entry, inventory, surfaces)
    }
    return result
  }, [inventoryQuery.data?.nodes, surfacesQuery.data?.summary.units])

  // Metrics
  const metrics = useMemo(() => {
    let online = 0
    let detected = 0
    for (const entry of DEVICE_REGISTRY) {
      const k = statusByDevice[entry.id]?.kind
      if (k === 'online') online++
      else if (k === 'detected') detected++
    }
    return { online, detected, total: DEVICE_REGISTRY.length }
  }, [statusByDevice])

  // Filter + search
  const filtered = useMemo(() => {
    const q = filters.query.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    return DEVICE_REGISTRY.filter((entry) => {
      if (filters.kind !== 'all' && entry.kind !== filters.kind) return false
      if (filters.stock !== 'all') {
        const s = statusByDevice[entry.id]?.kind
        if (filters.stock === 'in-stock' && s !== 'online') return false
        if (filters.stock === 'detected' && s !== 'detected') return false
        if (filters.stock === 'planned' && s !== 'planned') return false
      }
      if (q) {
        const hay = [entry.label, entry.eyebrow, entry.description, ...entry.capabilities]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [filters, statusByDevice])

  // Group filtered by kind, preserving section order
  const KIND_ORDER: DeviceRegistryEntry['kind'][] = ['control-surface', 'processor', 'audio-interface', 'console']
  const grouped = useMemo(() => {
    const map: Record<DeviceRegistryEntry['kind'], DeviceRegistryEntry[]> = {
      'control-surface': [],
      processor: [],
      'audio-interface': [],
      console: [],
    }
    for (const entry of filtered) {
      map[entry.kind].push(entry)
    }
    return map
  }, [filtered])

  // Pinned section entries
  const pinnedEntries = useMemo(
    () => DEVICE_REGISTRY.filter((e) => isPinned(e.id)),
    [isPinned],
  )

  const quickviewEntry = useMemo(
    () => (quickviewId ? DEVICE_REGISTRY.find((e) => e.id === quickviewId) ?? null : null),
    [quickviewId],
  )

  const hostObservation = useMemo(
    () => DEVICE_REGISTRY.find((e) => e.hostObservation)?.hostObservation ?? null,
    [],
  )

  const showSections = filters.kind === 'all' && filters.stock === 'all' && !filters.query

  return (
    <div className="hardware-store">
      {/* ── Store header ── */}
      <header className="hardware-store__header">
        <div className="hardware-store__header-copy">
          <p className="hardware-store__eyebrow">MAP2 Hardware Store</p>
          <h1 className="hardware-store__title">Devices</h1>
          <p className="hardware-store__subtitle">
            All hardware units and control surfaces managed by this stack. Pin a device to add it to your Workspace.
          </p>
        </div>
        <div className="hardware-store__header-tags">
          <Tag type="green"><CheckmarkFilled size={12} aria-hidden /> {metrics.online} in stock</Tag>
          <Tag type="blue"><InProgress size={12} aria-hidden /> {metrics.detected} detected</Tag>
          <Tag type="cool-gray">{metrics.total} units</Tag>
          {pinned.size > 0 && (
            <Tag type="purple"><ShoppingCart size={12} aria-hidden /> {pinned.size} pinned</Tag>
          )}
        </div>
      </header>

      {/* ── Host observation banner ── */}
      {hostObservation && (
        <div className="hardware-store__observation" role="note">
          <p className="hardware-store__observation-eyebrow">Host observation</p>
          <p className="hardware-store__observation-body">{hostObservation}</p>
        </div>
      )}

      {/* ── Toolbar ── */}
      <StorefrontToolbar
        query={filters.query}
        kind={filters.kind}
        stock={filters.stock}
        onQuery={setQuery}
        onKind={setKind}
        onStock={setStock}
        resultCount={filtered.length}
        pinnedCount={pinned.size}
      />

      {/* ── Pinned / Cart rail ── */}
      {pinnedEntries.length > 0 && (
        <section className="hardware-store__pinned-rail" aria-label="Pinned devices">
          <div className="hardware-store__rail-header">
            <ShoppingCart size={16} aria-hidden />
            <h2 className="hardware-store__rail-title">Workspace Pins</h2>
            <span className="hardware-store__rail-count">{pinnedEntries.length}</span>
          </div>
          <div className="hardware-store__rail-items">
            {pinnedEntries.map((entry) => {
              const status = statusByDevice[entry.id]
              return (
                <div key={entry.id} className="hardware-store__rail-chip" style={{ '--device-color': entry.color } as React.CSSProperties}>
                  <entry.icon size={14} aria-hidden className="hardware-store__rail-chip-icon" />
                  <span className="hardware-store__rail-chip-label">{entry.shortLabel}</span>
                  <StockIcon kind={status?.kind ?? 'offline'} />
                  <button
                    type="button"
                    className="hardware-store__rail-chip-remove"
                    aria-label={`Unpin ${entry.label}`}
                    onClick={() => togglePin(entry.id)}
                  >
                    <Close size={12} aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Product grid ── */}
      {showSections ? (
        KIND_ORDER.map((kind) => {
          const entries = grouped[kind]
          if (!entries.length) return null
          return (
            <section key={kind} className="hardware-store__section">
              <div className="hardware-store__section-header">
                <h2 className="hardware-store__section-title">{KIND_LABELS[kind]}</h2>
                <p className="hardware-store__section-subtitle">{KIND_SUBTITLES[kind]}</p>
              </div>
              <div className="hardware-store__grid">
                {entries.map((entry) => (
                  <ProductCard
                    key={entry.id}
                    entry={entry}
                    status={statusByDevice[entry.id]}
                    pinned={isPinned(entry.id)}
                    onTogglePin={togglePin}
                    onQuickview={openQuickview}
                  />
                ))}
              </div>
            </section>
          )
        })
      ) : (
        <section className="hardware-store__section">
          {filtered.length === 0 ? (
            <div className="hardware-store__empty">
              <p className="hardware-store__empty-title">No products found</p>
              <p className="hardware-store__empty-body">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="hardware-store__grid">
              {filtered.map((entry) => (
                <ProductCard
                  key={entry.id}
                  entry={entry}
                  status={statusByDevice[entry.id]}
                  pinned={isPinned(entry.id)}
                  onTogglePin={togglePin}
                  onQuickview={openQuickview}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Quickview modal ── */}
      {quickviewEntry && statusByDevice[quickviewEntry.id] && (
        <QuickviewModal
          entry={quickviewEntry}
          status={statusByDevice[quickviewEntry.id]}
          pinned={isPinned(quickviewEntry.id)}
          onClose={closeQuickview}
          onTogglePin={togglePin}
        />
      )}
    </div>
  )
}
