/**
 * T2512-KEYBOARD-CUSTOMIZE — operator-remappable keyboard shortcuts.
 *
 * The looper page ships with a hard-coded shortcut layout (1..4 select
 * track, Space records, U/Y undo/redo, etc.). This module turns that
 * layout into a customizable map persisted to localStorage so an
 * operator who drives the looper with a non-QWERTY keyboard or a
 * stream-deck overlay can remap each action independently.
 *
 * Storage key: ``map2.looper.keybindings`` (separate from
 * ``map2.looper.activeKbTrack`` which stays single-purpose). Schema
 * version is embedded so future expansions can detect + migrate old
 * payloads non-destructively.
 *
 * Design notes:
 * - A binding is a small spec, not a raw KeyboardEvent — we want to
 *   round-trip through JSON cleanly and we want the UI to be able to
 *   render a stable label for each binding.
 * - Match priority: ``code`` wins over ``key`` when both are set
 *   (so an operator can pin Space to ``code: "Space"`` regardless of
 *   the key text the browser reports, which differs between OSes).
 * - Bare-key bindings reject modifier-held events to match the
 *   original UX: ``Ctrl+M`` shouldn't trigger ``muteToggle``.
 * - We tolerate duplicates: the first-defined action wins so the UI
 *   can surface the collision without crashing.
 */

export const LOOPER_KEYBINDINGS_STORAGE_KEY = 'map2.looper.keybindings'
export const LOOPER_KEYBINDINGS_SCHEMA_VERSION = 1

/**
 * Every operator-facing transport action that can be bound.
 *
 * Track-select actions are explicit (selectTrack1..4) so the
 * customizer can show them as four independent rows. Track count
 * stays 4 (the looper engine's TRACK_COUNT); if that changes, this
 * list will need to grow.
 */
export type LooperAction =
  | 'selectTrack1'
  | 'selectTrack2'
  | 'selectTrack3'
  | 'selectTrack4'
  | 'record'
  | 'stop'
  | 'undo'
  | 'redo'
  | 'muteToggle'
  | 'reverseToggle'
  | 'helpToggle'

export const LOOPER_ACTIONS: readonly LooperAction[] = [
  'selectTrack1',
  'selectTrack2',
  'selectTrack3',
  'selectTrack4',
  'record',
  'stop',
  'undo',
  'redo',
  'muteToggle',
  'reverseToggle',
  'helpToggle',
] as const

/**
 * Human-facing label used by the customizer table and the help modal.
 */
export const LOOPER_ACTION_LABEL: Record<LooperAction, string> = {
  selectTrack1: 'Select track 1',
  selectTrack2: 'Select track 2',
  selectTrack3: 'Select track 3',
  selectTrack4: 'Select track 4',
  record: 'Record / play / overdub on active track',
  stop: 'Stop active track',
  undo: 'Undo last layer on active track',
  redo: 'Redo last layer on active track',
  muteToggle: 'Toggle mute on active track',
  reverseToggle: 'Toggle reverse on active track',
  helpToggle: 'Toggle the shortcuts help overlay',
}

export interface KeyBinding {
  /**
   * Match by KeyboardEvent.code (preferred — layout-independent).
   * If set, ``key`` is ignored at match time but kept for label
   * stability if the spec was captured from a key-press.
   */
  code?: string
  /**
   * Match by KeyboardEvent.key (case-insensitive). Used when ``code``
   * is unset — covers bindings that should follow the operator's
   * keyboard layout (e.g. ``?`` is shift+/ on a US layout).
   */
  key?: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}

export type LooperKeybindings = Record<LooperAction, KeyBinding>

/**
 * Default layout — must match the original LooperPage handler. This
 * is the canonical "factory reset" target the customizer offers.
 */
export const DEFAULT_LOOPER_KEYBINDINGS: LooperKeybindings = {
  selectTrack1: { key: '1' },
  selectTrack2: { key: '2' },
  selectTrack3: { key: '3' },
  selectTrack4: { key: '4' },
  record: { code: 'Space' },
  stop: { code: 'Space', shift: true },
  undo: { key: 'u' },
  redo: { key: 'y' },
  muteToggle: { key: 'm' },
  reverseToggle: { key: 'r' },
  helpToggle: { key: '?' },
}

/**
 * Normalize a binding for storage / comparison. Booleans always
 * present so a stored binding round-trips identically.
 */
export function normalizeBinding(b: KeyBinding): KeyBinding {
  const out: KeyBinding = {
    shift: !!b.shift,
    ctrl: !!b.ctrl,
    alt: !!b.alt,
    meta: !!b.meta,
  }
  if (b.code) out.code = b.code
  if (b.key) out.key = b.key.length === 1 ? b.key.toLowerCase() : b.key
  return out
}

/**
 * Stable string label rendered next to each action in the customizer
 * and the help modal. Format mirrors common keyboard-shortcut UIs:
 * "Ctrl + Shift + Space", "Shift + ?", "U", etc.
 */
export function bindingLabel(b: KeyBinding): string {
  const parts: string[] = []
  if (b.ctrl) parts.push('Ctrl')
  if (b.alt) parts.push('Alt')
  if (b.shift) parts.push('Shift')
  if (b.meta) parts.push('Meta')
  let main: string
  if (b.code === 'Space') main = 'Space'
  else if (b.code) main = b.code
  else if (b.key) main = b.key.length === 1 ? b.key.toUpperCase() : b.key
  else main = '—'
  parts.push(main)
  return parts.join(' + ')
}

/**
 * Match a normalized KeyboardEvent against a binding.
 *
 * Match rule: every set field must match. Unset modifier flags
 * default to false (a binding with shift=undefined must *not* fire
 * when shift is held). This matches the original handler's
 * "bare-key shortcuts reject modifiers" behavior.
 */
export function bindingMatches(b: KeyBinding, ev: KeyboardEvent): boolean {
  if (!!b.shift !== ev.shiftKey) return false
  if (!!b.ctrl !== ev.ctrlKey) return false
  if (!!b.alt !== ev.altKey) return false
  if (!!b.meta !== ev.metaKey) return false
  if (b.code) {
    return ev.code === b.code
  }
  if (b.key) {
    const lhs = b.key.length === 1 ? b.key.toLowerCase() : b.key
    const rhs = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key
    return lhs === rhs
  }
  // A binding with neither code nor key matches nothing — treat as
  // an "unbound" sentinel so the operator can clear a shortcut
  // without deleting the action.
  return false
}

/**
 * Resolve a KeyboardEvent → first matching action. ``null`` if none.
 * Action order follows LOOPER_ACTIONS so deterministic precedence
 * survives JSON round-trips (Object.keys order is preserved for
 * non-integer keys on every spec-compliant engine).
 */
export function resolveActionForEvent(
  bindings: LooperKeybindings,
  ev: KeyboardEvent,
): LooperAction | null {
  for (const action of LOOPER_ACTIONS) {
    if (bindingMatches(bindings[action], ev)) return action
  }
  return null
}

interface StoredEnvelope {
  schema: number
  bindings: Partial<LooperKeybindings>
}

/**
 * Read the operator's stored bindings, fall back to defaults for any
 * missing action. Tolerant of corrupt JSON / quota errors so a bad
 * localStorage entry can't take down the page.
 */
export function loadLooperKeybindings(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): LooperKeybindings {
  if (!storage) return { ...DEFAULT_LOOPER_KEYBINDINGS }
  let raw: string | null = null
  try {
    raw = storage.getItem(LOOPER_KEYBINDINGS_STORAGE_KEY)
  } catch {
    return { ...DEFAULT_LOOPER_KEYBINDINGS }
  }
  if (!raw) return { ...DEFAULT_LOOPER_KEYBINDINGS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_LOOPER_KEYBINDINGS }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as StoredEnvelope).schema !== 'number'
  ) {
    return { ...DEFAULT_LOOPER_KEYBINDINGS }
  }
  const envelope = parsed as StoredEnvelope
  const merged: LooperKeybindings = { ...DEFAULT_LOOPER_KEYBINDINGS }
  for (const action of LOOPER_ACTIONS) {
    const stored = envelope.bindings?.[action]
    if (stored && typeof stored === 'object') {
      merged[action] = normalizeBinding(stored)
    }
  }
  return merged
}

/**
 * Persist a binding set. Quota / private-mode errors are swallowed —
 * the operator's customization is best-effort just like the rest of
 * the looper's localStorage surface (preset cache, active track).
 */
export function saveLooperKeybindings(
  bindings: LooperKeybindings,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  if (!storage) return
  const envelope: StoredEnvelope = {
    schema: LOOPER_KEYBINDINGS_SCHEMA_VERSION,
    bindings,
  }
  try {
    storage.setItem(LOOPER_KEYBINDINGS_STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Quota / private mode — keep the in-memory copy.
  }
}

/**
 * Capture a KeyboardEvent → KeyBinding for "press a key" UI. Returns
 * a normalized binding ready for storage. Returns ``null`` when the
 * event is a pure modifier press (Shift / Ctrl / etc. on their own)
 * so the UI can ignore those and wait for a real key.
 */
export function bindingFromEvent(ev: KeyboardEvent): KeyBinding | null {
  if (
    ev.key === 'Shift' ||
    ev.key === 'Control' ||
    ev.key === 'Alt' ||
    ev.key === 'Meta'
  ) {
    return null
  }
  const b: KeyBinding = {
    shift: ev.shiftKey,
    ctrl: ev.ctrlKey,
    alt: ev.altKey,
    meta: ev.metaKey,
  }
  if (ev.code === 'Space') {
    b.code = 'Space'
  } else {
    b.key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key
  }
  return b
}

/**
 * Surface duplicate bindings for the customizer's warning banner.
 * Returns a list of action arrays — each inner array is a set of
 * actions bound to the same effective key combo.
 */
export function findDuplicateBindings(
  bindings: LooperKeybindings,
): LooperAction[][] {
  const buckets = new Map<string, LooperAction[]>()
  for (const action of LOOPER_ACTIONS) {
    const b = bindings[action]
    // Use the same string label the UI shows — keeps the warning copy
    // aligned with the row content.
    const sig = bindingLabel(b)
    const arr = buckets.get(sig) ?? []
    arr.push(action)
    buckets.set(sig, arr)
  }
  const dupes: LooperAction[][] = []
  for (const arr of buckets.values()) {
    if (arr.length >= 2) dupes.push(arr)
  }
  return dupes
}
