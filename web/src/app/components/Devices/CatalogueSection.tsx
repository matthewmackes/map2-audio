// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// CatalogueSection — T2459-G10. Q7 split-pane + Q8 facets + Q4 unknown-device
// + Q5 featured Mixxx imports tail.
//
// Top half: facet bar + hero summary (counts by source, vendor, kind).
// Bottom half: scrollable filtered list of cards.
// Shows-all toggle for the imported (Mixxx) tail so the catalogue stays
// scannable while the full corpus remains reachable.

import * as React from 'react'
import {
  Button,
  MultiSelect,
  Search,
  Tag,
  InlineNotification,
} from '@carbon/react'
import { useNavigate } from 'react-router-dom'

import { DeviceCard, type DeviceCardRow } from './DeviceCard'

import './CatalogueSection.css'

export interface CatalogueSectionProps {
  rows: DeviceCardRow[]
  onPinChanged?: () => void
  pulseTokenFor?: (row: DeviceCardRow) => number | undefined
  /** Cap how many imported (Mixxx) profiles render before "Show all".
   *  Featured-top + hidden-tail (Q5). */
  importedTailCap?: number
}

const PROTOCOL_OPTIONS: Array<{ id: 'audio' | 'midi' | 'hid'; label: string }> = [
  { id: 'audio', label: 'Audio' },
  { id: 'midi', label: 'MIDI' },
  { id: 'hid', label: 'HID' },
]

const SOURCE_OPTIONS: Array<{ id: 'shipped' | 'user' | 'imported'; label: string }> = [
  { id: 'shipped', label: 'Shipped' },
  { id: 'user', label: 'User' },
  { id: 'imported', label: 'Imported (Mixxx)' },
]

export function CatalogueSection({
  rows, onPinChanged, pulseTokenFor, importedTailCap = 12,
}: CatalogueSectionProps): React.JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [protocols, setProtocols] = React.useState<Array<'audio' | 'midi' | 'hid'>>([])
  const [sources, setSources] = React.useState<Array<'shipped' | 'user' | 'imported'>>([])
  const [vendors, setVendors] = React.useState<string[]>([])
  const [showAllImported, setShowAllImported] = React.useState(false)

  // Vendor list: derived from the rows so it stays in sync.
  const vendorOptions = React.useMemo(() => {
    const seen = new Set<string>()
    for (const r of rows) {
      const v = r.vendor ?? r.packId
      if (v) seen.add(v)
    }
    return Array.from(seen).sort()
  }, [rows])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (q) {
        const haystack = `${r.profileKey} ${r.model} ${r.packId} ${r.vendor ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (protocols.length && !protocols.includes(r.kind)) return false
      if (sources.length && (!r.source || !sources.includes(r.source))) return false
      if (vendors.length) {
        const v = r.vendor ?? r.packId
        if (!vendors.includes(v)) return false
      }
      return true
    })
  }, [rows, query, protocols, sources, vendors])

  // Q5 featured-top + hidden-tail: split filtered into native (shipped/user)
  // first, then imported. Cap the imported tail unless the operator
  // toggles "show all".
  const { featured, importedHead, importedTail, importedTotal } = React.useMemo(() => {
    const native: DeviceCardRow[] = []
    const imp: DeviceCardRow[] = []
    for (const r of filtered) {
      if (r.source === 'imported') imp.push(r)
      else native.push(r)
    }
    if (showAllImported) {
      return { featured: native, importedHead: imp, importedTail: [] as DeviceCardRow[], importedTotal: imp.length }
    }
    return {
      featured: native,
      importedHead: imp.slice(0, importedTailCap),
      importedTail: imp.slice(importedTailCap),
      importedTotal: imp.length,
    }
  }, [filtered, showAllImported, importedTailCap])

  // Counts for the hero summary.
  const counts = React.useMemo(() => {
    const out = { total: rows.length, shipped: 0, user: 0, imported: 0, audio: 0, midi: 0, hid: 0 }
    for (const r of rows) {
      if (r.source === 'shipped') out.shipped += 1
      else if (r.source === 'user') out.user += 1
      else if (r.source === 'imported') out.imported += 1
      if (r.kind === 'audio') out.audio += 1
      else if (r.kind === 'midi') out.midi += 1
      else if (r.kind === 'hid') out.hid += 1
    }
    return out
  }, [rows])

  const isUnknownEmptyState = filtered.length === 0 && (query.trim() !== '' || protocols.length || sources.length || vendors.length)

  return (
    <section className="catalogue-section">
      <header className="catalogue-section__head">
        <h2 className="catalogue-section__title">Catalogue</h2>
        <span className="catalogue-section__count">{filtered.length}/{rows.length}</span>
        <span className="catalogue-section__subtitle">All shipped, user, and imported device packs</span>
      </header>

      <div className="catalogue-section__pane catalogue-section__pane--top">
        <div className="catalogue-section__hero">
          <Tag size="md" type="cool-gray">{counts.total} total</Tag>
          <Tag size="md" type="green">{counts.shipped} shipped</Tag>
          <Tag size="md" type="cyan">{counts.user} user</Tag>
          <Tag size="md" type="magenta">{counts.imported} imported</Tag>
          <span className="catalogue-section__hero-sep" />
          <Tag size="md" type="cool-gray">{counts.audio} audio</Tag>
          <Tag size="md" type="cool-gray">{counts.midi} midi</Tag>
          <Tag size="md" type="cool-gray">{counts.hid} hid</Tag>
        </div>

        <div className="catalogue-section__facets">
          <Search
            id="catalogue-search"
            labelText="Search catalogue"
            placeholder="Search model / pack / vendor"
            size="md"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value ?? '')}
            onClear={() => setQuery('')}
          />
          <MultiSelect
            id="catalogue-protocol"
            label="Protocol"
            titleText="Protocol"
            items={PROTOCOL_OPTIONS}
            itemToString={(i) => (i ? i.label : '')}
            selectedItems={PROTOCOL_OPTIONS.filter((o) => protocols.includes(o.id))}
            onChange={(e) => setProtocols((e.selectedItems ?? []).map((i: { id: 'audio'|'midi'|'hid' }) => i.id))}
          />
          <MultiSelect
            id="catalogue-source"
            label="Source"
            titleText="Source"
            items={SOURCE_OPTIONS}
            itemToString={(i) => (i ? i.label : '')}
            selectedItems={SOURCE_OPTIONS.filter((o) => sources.includes(o.id))}
            onChange={(e) => setSources((e.selectedItems ?? []).map((i: { id: 'shipped'|'user'|'imported' }) => i.id))}
          />
          <MultiSelect
            id="catalogue-vendor"
            label="Vendor"
            titleText="Vendor"
            items={vendorOptions.map((v) => ({ id: v, label: v }))}
            itemToString={(i) => (i ? i.label : '')}
            selectedItems={vendorOptions
              .filter((v) => vendors.includes(v))
              .map((v) => ({ id: v, label: v }))}
            onChange={(e) => setVendors((e.selectedItems ?? []).map((i: { id: string }) => i.id))}
          />
        </div>
      </div>

      <div className="catalogue-section__pane catalogue-section__pane--bottom">
        {isUnknownEmptyState ? (
          <div className="catalogue-section__unknown">
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No device matches these filters"
              subtitle="If your device isn't in the catalogue yet, run the MIDI Learn Wizard or open the Mixxx import flow."
            />
            <div className="catalogue-section__unknown-actions">
              <Button kind="primary" onClick={() => navigate('/devices/profile/_unknown/_unknown/learn')}>
                Open Learn Wizard
              </Button>
              <Button kind="tertiary" onClick={() => setShowAllImported(true)}>
                Show all imported mappings
              </Button>
            </div>
          </div>
        ) : null}

        {featured.length > 0 ? (
          <div className="catalogue-section__list" data-testid="catalogue-featured">
            {featured.map((row) => (
              <DeviceCard
                key={row.profileKey}
                row={{ ...row, pulseToken: pulseTokenFor?.(row) }}
                onPinChanged={onPinChanged}
              />
            ))}
          </div>
        ) : null}

        {importedHead.length > 0 ? (
          <>
            <div className="catalogue-section__divider">
              <span>Imported (Mixxx)</span>
              <Tag size="sm" type="magenta">{importedTotal}</Tag>
            </div>
            <div className="catalogue-section__list" data-testid="catalogue-imported">
              {importedHead.map((row) => (
                <DeviceCard
                  key={row.profileKey}
                  row={{ ...row, pulseToken: pulseTokenFor?.(row) }}
                  onPinChanged={onPinChanged}
                />
              ))}
            </div>
            {importedTail.length > 0 ? (
              <div className="catalogue-section__more">
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => setShowAllImported(true)}
                >
                  Show all imported mappings ({importedTail.length} more)
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
