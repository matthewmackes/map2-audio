/**
 * T2512-KEYBOARD-CUSTOMIZE — unit tests for the binding spec module.
 */
import {
  DEFAULT_LOOPER_KEYBINDINGS,
  LOOPER_ACTIONS,
  LOOPER_KEYBINDINGS_SCHEMA_VERSION,
  LOOPER_KEYBINDINGS_STORAGE_KEY,
  bindingFromEvent,
  bindingLabel,
  bindingMatches,
  findDuplicateBindings,
  loadLooperKeybindings,
  normalizeBinding,
  resolveActionForEvent,
  saveLooperKeybindings,
  type LooperKeybindings,
} from './looperKeybindings'

function mockEvent(props: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...props,
  } as unknown as KeyboardEvent
}

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  } as Storage
}

describe('looperKeybindings — defaults', () => {
  test('every action has a default binding', () => {
    for (const action of LOOPER_ACTIONS) {
      expect(DEFAULT_LOOPER_KEYBINDINGS[action]).toBeDefined()
    }
  })

  test('record + stop share Space but differ on shift modifier', () => {
    expect(DEFAULT_LOOPER_KEYBINDINGS.record).toEqual({ code: 'Space' })
    expect(DEFAULT_LOOPER_KEYBINDINGS.stop).toEqual({
      code: 'Space',
      shift: true,
    })
  })

  test('selectTrack1..4 map to digit keys without modifiers', () => {
    expect(DEFAULT_LOOPER_KEYBINDINGS.selectTrack1).toEqual({ key: '1' })
    expect(DEFAULT_LOOPER_KEYBINDINGS.selectTrack4).toEqual({ key: '4' })
  })
})

describe('looperKeybindings — bindingLabel', () => {
  test('formats Space, shifted Space, and bare letters', () => {
    expect(bindingLabel({ code: 'Space' })).toBe('Space')
    expect(bindingLabel({ code: 'Space', shift: true })).toBe('Shift + Space')
    expect(bindingLabel({ key: 'u' })).toBe('U')
  })

  test('formats Ctrl+Alt+Shift combos in deterministic order', () => {
    expect(
      bindingLabel({ key: 'k', ctrl: true, alt: true, shift: true }),
    ).toBe('Ctrl + Alt + Shift + K')
  })

  test('renders an em-dash for an unbound binding', () => {
    expect(bindingLabel({})).toBe('—')
  })
})

describe('looperKeybindings — bindingMatches', () => {
  test('matches by code when set', () => {
    expect(
      bindingMatches({ code: 'Space' }, mockEvent({ code: 'Space', key: ' ' })),
    ).toBe(true)
  })

  test('rejects matching code when an unwanted modifier is held', () => {
    expect(
      bindingMatches(
        { code: 'Space' },
        mockEvent({ code: 'Space', shiftKey: true }),
      ),
    ).toBe(false)
  })

  test('case-insensitive key match', () => {
    expect(bindingMatches({ key: 'u' }, mockEvent({ key: 'U' }))).toBe(true)
    expect(bindingMatches({ key: 'U' }, mockEvent({ key: 'u' }))).toBe(true)
  })

  test('empty binding never matches', () => {
    expect(bindingMatches({}, mockEvent({ key: 'a' }))).toBe(false)
  })
})

describe('looperKeybindings — resolveActionForEvent', () => {
  test('default bindings resolve the original layout', () => {
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ code: 'Space', key: ' ' }),
      ),
    ).toBe('record')
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ code: 'Space', shiftKey: true }),
      ),
    ).toBe('stop')
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ key: 'u' }),
      ),
    ).toBe('undo')
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ key: '?' }),
      ),
    ).toBe('helpToggle')
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ key: '3' }),
      ),
    ).toBe('selectTrack3')
  })

  test('null when no binding matches', () => {
    expect(
      resolveActionForEvent(
        DEFAULT_LOOPER_KEYBINDINGS,
        mockEvent({ key: 'z' }),
      ),
    ).toBeNull()
  })

  test('remapped bindings take precedence', () => {
    const custom: LooperKeybindings = {
      ...DEFAULT_LOOPER_KEYBINDINGS,
      undo: { key: 'z', ctrl: true },
    }
    expect(
      resolveActionForEvent(
        custom,
        mockEvent({ key: 'z', ctrlKey: true }),
      ),
    ).toBe('undo')
    // Plain `z` still resolves to nothing because we replaced the binding.
    expect(
      resolveActionForEvent(custom, mockEvent({ key: 'z' })),
    ).toBeNull()
  })
})

describe('looperKeybindings — bindingFromEvent', () => {
  test('captures Space as a code binding (layout-independent)', () => {
    const b = bindingFromEvent(mockEvent({ code: 'Space', key: ' ' }))
    expect(b).toEqual({
      code: 'Space',
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    })
  })

  test('captures a letter as a key binding with modifier state', () => {
    const b = bindingFromEvent(
      mockEvent({ code: 'KeyU', key: 'U', shiftKey: true }),
    )
    expect(b).toEqual({
      key: 'u',
      shift: true,
      ctrl: false,
      alt: false,
      meta: false,
    })
  })

  test('returns null for a pure modifier press', () => {
    expect(bindingFromEvent(mockEvent({ key: 'Shift' }))).toBeNull()
    expect(bindingFromEvent(mockEvent({ key: 'Control' }))).toBeNull()
    expect(bindingFromEvent(mockEvent({ key: 'Alt' }))).toBeNull()
    expect(bindingFromEvent(mockEvent({ key: 'Meta' }))).toBeNull()
  })
})

describe('looperKeybindings — load/save round trip', () => {
  test('save then load returns the same map', () => {
    const storage = memoryStorage()
    const custom: LooperKeybindings = {
      ...DEFAULT_LOOPER_KEYBINDINGS,
      record: { key: 'g', ctrl: true },
    }
    saveLooperKeybindings(custom, storage)
    const loaded = loadLooperKeybindings(storage)
    expect(loaded.record).toEqual(normalizeBinding({ key: 'g', ctrl: true }))
  })

  test('schema envelope is embedded', () => {
    const storage = memoryStorage()
    saveLooperKeybindings(DEFAULT_LOOPER_KEYBINDINGS, storage)
    const raw = storage.getItem(LOOPER_KEYBINDINGS_STORAGE_KEY)!
    const parsed = JSON.parse(raw)
    expect(parsed.schema).toBe(LOOPER_KEYBINDINGS_SCHEMA_VERSION)
    expect(parsed.bindings).toBeDefined()
  })

  test('corrupt JSON falls back to defaults', () => {
    const storage = memoryStorage()
    storage.setItem(LOOPER_KEYBINDINGS_STORAGE_KEY, '{not json')
    const loaded = loadLooperKeybindings(storage)
    expect(loaded).toEqual(DEFAULT_LOOPER_KEYBINDINGS)
  })

  test('missing schema falls back to defaults', () => {
    const storage = memoryStorage()
    storage.setItem(
      LOOPER_KEYBINDINGS_STORAGE_KEY,
      JSON.stringify({ bindings: { record: { key: 'g' } } }),
    )
    const loaded = loadLooperKeybindings(storage)
    expect(loaded).toEqual(DEFAULT_LOOPER_KEYBINDINGS)
  })

  test('partial stored bindings merge over defaults', () => {
    const storage = memoryStorage()
    storage.setItem(
      LOOPER_KEYBINDINGS_STORAGE_KEY,
      JSON.stringify({
        schema: LOOPER_KEYBINDINGS_SCHEMA_VERSION,
        bindings: { record: { key: 'g' } },
      }),
    )
    const loaded = loadLooperKeybindings(storage)
    expect(loaded.record).toEqual(normalizeBinding({ key: 'g' }))
    // Other actions still on defaults.
    expect(loaded.undo).toEqual(DEFAULT_LOOPER_KEYBINDINGS.undo)
  })

  test('null storage yields defaults (server / quota / private mode)', () => {
    const loaded = loadLooperKeybindings(null)
    expect(loaded).toEqual(DEFAULT_LOOPER_KEYBINDINGS)
  })
})

describe('looperKeybindings — findDuplicateBindings', () => {
  test('no duplicates by default', () => {
    expect(findDuplicateBindings(DEFAULT_LOOPER_KEYBINDINGS)).toEqual([])
  })

  test('detects two actions sharing a binding', () => {
    const custom: LooperKeybindings = {
      ...DEFAULT_LOOPER_KEYBINDINGS,
      undo: { key: 'm' }, // collides with muteToggle (also m)
    }
    const dupes = findDuplicateBindings(custom)
    expect(dupes).toHaveLength(1)
    expect(dupes[0]).toEqual(expect.arrayContaining(['undo', 'muteToggle']))
  })
})
