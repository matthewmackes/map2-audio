import {
  UI_SETTINGS_STORAGE_KEY,
  getPinnedDeviceIds,
  isDevicePinned,
  pinDevice,
  togglePinnedDevice,
  unpinDevice,
  readUiSettings,
} from './uiSettings'

describe('uiSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to an empty pinned set when no storage entry exists', () => {
    expect(getPinnedDeviceIds()).toEqual([])
    expect(readUiSettings()).toEqual({ version: 1, pinnedDevices: [] })
  })

  it('ignores a malformed storage payload and returns empty defaults', () => {
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, '{not valid json')
    expect(getPinnedDeviceIds()).toEqual([])
  })

  it('pins a device and persists the change under the shared settings bag', () => {
    pinDevice('lexicon-mpx1')
    expect(isDevicePinned('lexicon-mpx1')).toBe(true)
    const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw ?? '{}')
    expect(parsed).toEqual({ version: 1, pinnedDevices: ['lexicon-mpx1'] })
  })

  it('never duplicates a pin when pinDevice is called twice', () => {
    pinDevice('mpx1')
    pinDevice('mpx1')
    expect(getPinnedDeviceIds()).toEqual(['mpx1'])
  })

  it('preserves pin order (oldest first) when multiple devices are pinned', () => {
    pinDevice('a')
    pinDevice('b')
    pinDevice('c')
    expect(getPinnedDeviceIds()).toEqual(['a', 'b', 'c'])
  })

  it('removes the device on unpinDevice and leaves other pins intact', () => {
    pinDevice('a')
    pinDevice('b')
    unpinDevice('a')
    expect(getPinnedDeviceIds()).toEqual(['b'])
  })

  it('is a no-op when unpinDevice is called for a device that is not pinned', () => {
    pinDevice('a')
    unpinDevice('b')
    expect(getPinnedDeviceIds()).toEqual(['a'])
  })

  it('togglePinnedDevice returns true on add and false on remove', () => {
    expect(togglePinnedDevice('a')).toBe(true)
    expect(togglePinnedDevice('a')).toBe(false)
    expect(getPinnedDeviceIds()).toEqual([])
  })

  it('coexists with unrelated keys in the same map2.ui.settings bag', () => {
    window.localStorage.setItem(
      UI_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, pinnedDevices: ['a'], someOtherSetting: true }),
    )
    pinDevice('b')
    const parsed = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) ?? '{}')
    expect(parsed.pinnedDevices).toEqual(['a', 'b'])
    expect(parsed.someOtherSetting).toBe(true)
  })

  it('filters non-string entries out of a corrupted pinnedDevices array', () => {
    window.localStorage.setItem(
      UI_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, pinnedDevices: ['a', 42, null, 'b'] }),
    )
    expect(getPinnedDeviceIds()).toEqual(['a', 'b'])
  })
})
