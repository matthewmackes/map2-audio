import { useCallback, useEffect, useState } from 'react'

export type SnapshotSlotStyle = 'default' | 'v3-tinted' | 'v4-ring' | 'v6-led'

export interface SnapshotSlotStyleOption {
  id: SnapshotSlotStyle
  label: string
  description: string
}

export const SNAPSHOT_SLOT_STYLE_OPTIONS: ReadonlyArray<SnapshotSlotStyleOption> = [
  {
    id: 'default',
    label: 'Default',
    description: 'Compact icon + label + CPU% with a coloured category strip on the left.',
  },
  {
    id: 'v3-tinted',
    label: 'Tinted card',
    description: "Card background tinted with the plugin's category colour. Reads at a glance.",
  },
  {
    id: 'v4-ring',
    label: 'CPU ring',
    description: 'Icon stacked over a circular CPU% gauge. Status lives in the icon, not text.',
  },
  {
    id: 'v6-led',
    label: 'LED bar',
    description: 'Coloured top edge tracks live activity. Densest signal-flow read.',
  },
]

export const DEFAULT_SNAPSHOT_SLOT_STYLE: SnapshotSlotStyle = 'default'

const STORAGE_KEY = 'map2:snapshot-editor.slot-style'
const SYNC_EVENT = 'map2:snapshot-editor.slot-style.sync'

function isSlotStyle(value: unknown): value is SnapshotSlotStyle {
  return SNAPSHOT_SLOT_STYLE_OPTIONS.some((option) => option.id === value)
}

function readFromStorage(): SnapshotSlotStyle {
  if (typeof window === 'undefined') return DEFAULT_SNAPSHOT_SLOT_STYLE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isSlotStyle(raw) ? raw : DEFAULT_SNAPSHOT_SLOT_STYLE
  } catch {
    return DEFAULT_SNAPSHOT_SLOT_STYLE
  }
}

/**
 * Per-browser snapshot slot style. Persisted to localStorage. Pure UI — never
 * leaves the device, never goes through the daemon. Cross-tab updates are
 * delivered via the storage event; same-tab updates via a custom event so a
 * single click in the dialog repaints every open editor instance immediately.
 */
export function useSnapshotSlotStyle(): readonly [
  SnapshotSlotStyle,
  (next: SnapshotSlotStyle) => void,
] {
  const [value, setValue] = useState<SnapshotSlotStyle>(readFromStorage)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      if (isSlotStyle(event.newValue)) setValue(event.newValue)
      else if (event.newValue === null) setValue(DEFAULT_SNAPSHOT_SLOT_STYLE)
    }
    const onSync = (event: Event) => {
      const next = (event as CustomEvent<SnapshotSlotStyle>).detail
      if (isSlotStyle(next)) {
        // Skip the redundant render on the instance that emitted the
        // event — only sibling hook instances need the cross-update.
        setValue((prev) => (prev === next ? prev : next))
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SYNC_EVENT, onSync as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SYNC_EVENT, onSync as EventListener)
    }
  }, [])

  const update = useCallback((next: SnapshotSlotStyle) => {
    setValue((prev) => (prev === next ? prev : next))
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Quota / private-browsing — keep the in-memory value, drop the persistence.
    }
    window.dispatchEvent(new CustomEvent<SnapshotSlotStyle>(SYNC_EVENT, { detail: next }))
  }, [])

  return [value, update] as const
}
