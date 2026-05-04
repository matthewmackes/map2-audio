import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchableListItem {
  id: string
  label: string
  category?: string
  description?: string
}

export function SearchableList<T extends SearchableListItem>({
  items,
  placeholder,
  selectedId,
  onSelect,
  maxHeight = 320,
  searchDataAttribute,
}: {
  items: T[]
  placeholder?: string
  selectedId?: string | null
  onSelect: (item: T) => void
  maxHeight?: number
  searchDataAttribute?: string
}) {
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const haystack = `${item.label} ${item.category ?? ''} ${item.description ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [items, query])

  useEffect(() => {
    if (focusedIndex >= filtered.length) {
      setFocusedIndex(Math.max(filtered.length - 1, 0))
    }
  }, [filtered.length, focusedIndex])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        data-api-observatory={searchDataAttribute}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder ?? 'Search'}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setFocusedIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setFocusedIndex((prev) => Math.max(prev - 1, 0))
          } else if (event.key === 'Enter') {
            const item = filtered[focusedIndex]
            if (item) {
              onSelect(item)
            }
          }
        }}
        style={{
          borderRadius: 10,
          border: '1px solid rgba(71, 85, 105, 0.65)',
          background: 'rgba(15, 23, 42, 0.86)',
          color: 'var(--cds-text-primary)',
          // carbon-allow: dense surface; off-grid between Carbon stops.
          padding: '8px 10px',
          fontSize: 12,
        }}
      />
      <div
        ref={listRef}
        style={{
          border: '1px solid rgba(71, 85, 105, 0.45)',
          borderRadius: 10,
          maxHeight,
          overflow: 'auto',
          background: 'rgba(2, 6, 23, 0.88)',
        }}
      >
        {filtered.map((item, index) => {
          const selected = selectedId === item.id
          const focused = index === focusedIndex
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              onMouseEnter={() => setFocusedIndex(index)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderTop: index === 0 ? 'none' : '1px solid rgba(30, 41, 59, 0.75)',
                background: selected
                  ? 'rgba(91, 33, 182, 0.28)'
                  : focused
                    ? 'rgba(30, 41, 59, 0.82)'
                    : 'transparent',
                // carbon-allow: dense surface; off-grid between Carbon stops.
                padding: '9px 10px',
                color: selected ? '#ede9fe' : '#cbd5e1',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>{item.label}</div>
              {(item.category || item.description) && (
                <div style={{ marginTop: 3, color: 'var(--cds-text-secondary)', fontSize: 11 }}>
                  {[item.category, item.description].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 12, color: 'var(--cds-text-secondary)', fontSize: 12 }}>No matching items.</div>
        )}
      </div>
    </div>
  )
}

export default SearchableList
