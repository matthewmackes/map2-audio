import { useEffect, useMemo, useState } from 'react'
import {
  ClickableTile,
  InlineLoading,
  InlineNotification,
  Tag,
  TextInput,
  ContentSwitcher,
  Switch,
} from '@carbon/react'
import {
  stateAuthorityApi,
  type StateAuthorityCatalogEntry,
  type StateAuthorityCatalogType,
} from '../../../map2/clients/stateAuthority'
import './BlockPicker.css'

// Block picker for the tonechaser workflow — fetches the canonical URI
// catalog (POST /api/state-authority/uri-catalog) and renders a searchable
// grouped grid. Picking a tile invokes onPick with the catalog entry so
// the parent can drive the "add plugin to chain" mutation.

export interface BlockPickerProps {
  /** Optional type filter — restricts to fx/io/sys/ctrl. Undefined = all. */
  initialType?: StateAuthorityCatalogType | 'all'
  /** Select handler. */
  onPick?: (entry: StateAuthorityCatalogEntry) => void
  /** Skip network fetch — used by tests that inject entries directly. */
  entries?: StateAuthorityCatalogEntry[]
  /** Whether to hide system-managed blocks (default true; they're auto-injected). */
  hideSystemManaged?: boolean
}

const TYPE_ORDER: (StateAuthorityCatalogType | 'all')[] = ['all', 'fx', 'sys', 'io', 'ctrl']
const TYPE_LABEL: Record<StateAuthorityCatalogType | 'all', string> = {
  all: 'All',
  fx: 'FX',
  sys: 'System',
  io: 'I/O',
  ctrl: 'Control',
}

function slugGroup(entry: StateAuthorityCatalogEntry): string {
  return entry.category || TYPE_LABEL[entry.type]
}

export function BlockPicker({
  initialType = 'all',
  onPick,
  entries: entriesProp,
  hideSystemManaged = true,
}: BlockPickerProps) {
  const [entries, setEntries] = useState<StateAuthorityCatalogEntry[]>(entriesProp ?? [])
  const [loading, setLoading] = useState(entriesProp === undefined)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<StateAuthorityCatalogType | 'all'>(initialType)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (entriesProp !== undefined) return
    let cancelled = false
    setLoading(true)
    stateAuthorityApi
      .getCatalog()
      .then((payload) => {
        if (cancelled) return
        setEntries(payload.entries)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entriesProp])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries
      .filter((entry) => (filterType === 'all' ? true : entry.type === filterType))
      .filter((entry) => (hideSystemManaged ? !entry.is_system_managed : true))
      .filter((entry) => {
        if (!needle) return true
        return (
          entry.label.toLowerCase().includes(needle) ||
          entry.uri.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle) ||
          entry.category.toLowerCase().includes(needle)
        )
      })
  }, [entries, filterType, hideSystemManaged, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, StateAuthorityCatalogEntry[]>()
    for (const entry of filtered) {
      const key = slugGroup(entry)
      const existing = groups.get(key)
      if (existing) {
        existing.push(entry)
      } else {
        groups.set(key, [entry])
      }
    }
    // Sort groups alphabetically, and entries within each group alphabetically
    const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b))
    return sortedKeys.map((key) => ({
      key,
      entries: (groups.get(key) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    }))
  }, [filtered])

  if (loading) {
    return <InlineLoading description="Loading tonechaser catalog…" />
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Failed to load block catalog"
        subtitle={error}
      />
    )
  }

  return (
    <div className="block-picker" role="region" aria-label="Tonechaser block picker">
      <div className="block-picker__controls">
        <ContentSwitcher
          selectedIndex={TYPE_ORDER.indexOf(filterType)}
          onChange={(event: { index?: number }) => {
            const nextIndex = typeof event.index === 'number' ? event.index : 0
            setFilterType(TYPE_ORDER[nextIndex] ?? 'all')
          }}
          size="sm"
        >
          {TYPE_ORDER.map((type) => (
            <Switch key={type} name={type} text={TYPE_LABEL[type]} />
          ))}
        </ContentSwitcher>
        <TextInput
          id="block-picker-search"
          labelText=""
          placeholder="Search by name, category, or URI…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          size="sm"
        />
      </div>
      {grouped.length === 0 ? (
        <div className="block-picker__empty" role="status">
          No blocks match your filter.
        </div>
      ) : (
        <div className="block-picker__groups">
          {grouped.map(({ key, entries: groupEntries }) => (
            <section key={key} className="block-picker__group" aria-label={key}>
              <h4 className="block-picker__group-title">{key}</h4>
              <div className="block-picker__tiles">
                {groupEntries.map((entry) => (
                  <ClickableTile
                    key={entry.uri}
                    onClick={() => onPick?.(entry)}
                    className="block-picker__tile"
                  >
                    <div className="block-picker__tile-label">{entry.label}</div>
                    <div className="block-picker__tile-uri">{entry.uri}</div>
                    <div className="block-picker__tile-description">{entry.description}</div>
                    <div className="block-picker__tile-tags">
                      <Tag size="sm" type="outline">
                        {entry.type}
                      </Tag>
                      {entry.is_system_managed ? (
                        <Tag size="sm" type="gray">
                          system
                        </Tag>
                      ) : null}
                      {entry.aliases.length > 0 ? (
                        <Tag size="sm" type="warm-gray">
                          {entry.aliases.length} alias
                          {entry.aliases.length === 1 ? '' : 'es'}
                        </Tag>
                      ) : null}
                    </div>
                  </ClickableTile>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default BlockPicker
