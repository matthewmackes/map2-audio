import { useMemo, useState } from 'react'
import { Button, Tag } from '@carbon/react'

import { FxIcon } from '../../FxIcons/FxIcon'
import type { FxIconName } from '../../FxIcons/fxIconRegistry'
import { MAP2_CATEGORIES, type MAP2Category } from '../categoryHues'

import { CATEGORY_COLOR_TOKENS } from './gridConstants'

export interface BlockPickerCatalogEntry {
  uri: string
  label: string
  category: MAP2Category | null
  iconName?: FxIconName
}

export interface BlockPickerProps {
  catalog: BlockPickerCatalogEntry[]
  onPick?: (entry: BlockPickerCatalogEntry) => void
  onCancel?: () => void
}

const ALL = '__ALL__' as const
type Filter = typeof ALL | MAP2Category

export function BlockPicker({ catalog, onPick, onCancel }: BlockPickerProps) {
  const [filter, setFilter] = useState<Filter>(ALL)

  const categoriesPresent = useMemo(() => {
    const set = new Set<MAP2Category>()
    for (const entry of catalog) {
      if (entry.category) set.add(entry.category)
    }
    return MAP2_CATEGORIES.filter((c) => set.has(c))
  }, [catalog])

  const filtered = useMemo(() => {
    if (filter === ALL) return catalog
    return catalog.filter((entry) => entry.category === filter)
  }, [catalog, filter])

  return (
    <div className="ucg-block-picker" role="dialog" aria-label="Pick a block">
      <div className="ucg-block-picker__filters" role="toolbar" aria-label="Filter by category">
        <Tag
          as="button"
          type={filter === ALL ? 'blue' : 'cool-gray'}
          onClick={() => setFilter(ALL)}
          aria-pressed={filter === ALL}
        >
          All
        </Tag>
        {categoriesPresent.map((cat) => (
          <Tag
            key={cat}
            as="button"
            type={filter === cat ? 'blue' : 'cool-gray'}
            onClick={() => setFilter(cat)}
            aria-pressed={filter === cat}
          >
            {cat}
          </Tag>
        ))}
      </div>

      <div className="ucg-block-picker__grid" role="listbox">
        {filtered.length === 0 ? (
          <div className="ucg-block-picker__empty">No blocks in this category.</div>
        ) : (
          filtered.map((entry) => {
            const stripColor = entry.category
              ? CATEGORY_COLOR_TOKENS[entry.category]
              : CATEGORY_COLOR_TOKENS.Unknown
            return (
              <button
                key={entry.uri}
                type="button"
                className="ucg-block-picker__entry"
                style={{ borderLeft: `4px solid ${stripColor}` }}
                onClick={() => onPick?.(entry)}
                data-category={entry.category ?? 'Unknown'}
                aria-label={entry.label}
              >
                <FxIcon name={entry.iconName ?? 'plugin'} size={20} />
                <span className="ucg-block-picker__entry-label">{entry.label}</span>
              </button>
            )
          })
        )}
      </div>

      {onCancel ? (
        <div className="ucg-block-picker__footer">
          <Button kind="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  )
}
