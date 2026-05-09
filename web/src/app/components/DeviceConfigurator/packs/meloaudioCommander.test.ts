/**
 * T2499-A slice 3 — MeloAudio adapter parity test.
 *
 * Verifies that adapting `CommanderStatusResponse` to
 * `DeviceDetectionStatus` is lossless: every firmware_kind maps to
 * the right presence, every descriptor field lands in `raw`, and the
 * pack descriptor advertises the right primitives.
 */

import {
  adaptCommanderStatus,
  meloaudioCommanderPack,
} from './meloaudioCommander'
import type { CommanderStatusResponse } from '../../../../map2/clients/meloaudioCommander'

function makeResponse(
  overrides: Partial<CommanderStatusResponse> = {},
): CommanderStatusResponse {
  return {
    firmware_kind: 'stock',
    is_present: true,
    supports_discovery_wizard: true,
    supports_canonical_config_push: false,
    vendor_id: 0x2eee,
    product_id: 0x0301,
    product_string: 'TSMIDI2.0',
    manufacturer_string: 'MeloAudio',
    serial: 'SN-123',
    sysfs_path: '/sys/bus/usb/devices/1-2',
    bcd_device: '0100',
    ...overrides,
  }
}

describe('adaptCommanderStatus — firmware_kind → presence mapping', () => {
  it('maps stock to present_stock', () => {
    expect(adaptCommanderStatus(makeResponse({ firmware_kind: 'stock' })).presence).toBe(
      'present_stock',
    )
  })
  it('maps custom to present_custom', () => {
    expect(
      adaptCommanderStatus(makeResponse({ firmware_kind: 'custom' })).presence,
    ).toBe('present_custom')
  })
  it('maps dfu_bootloader to present_bootloader', () => {
    expect(
      adaptCommanderStatus(makeResponse({ firmware_kind: 'dfu_bootloader' }))
        .presence,
    ).toBe('present_bootloader')
  })
  it('maps unknown to present_unknown', () => {
    expect(
      adaptCommanderStatus(makeResponse({ firmware_kind: 'unknown' })).presence,
    ).toBe('present_unknown')
  })
  it('maps not_present to not_present', () => {
    expect(
      adaptCommanderStatus(
        makeResponse({
          firmware_kind: 'not_present',
          is_present: false,
          vendor_id: null,
          product_id: null,
          product_string: null,
          manufacturer_string: null,
          serial: null,
          sysfs_path: null,
          bcd_device: null,
        }),
      ).presence,
    ).toBe('not_present')
  })
})

describe('adaptCommanderStatus — top-level fields', () => {
  it('uses pack_id="meloaudio" and transport="usb-sysfs"', () => {
    const status = adaptCommanderStatus(makeResponse())
    expect(status.pack_id).toBe('meloaudio')
    expect(status.transport).toBe('usb-sysfs')
  })

  it('threads serial through to top-level for the generic status card', () => {
    expect(adaptCommanderStatus(makeResponse({ serial: 'SN-XYZ' })).serial).toBe(
      'SN-XYZ',
    )
  })

  it('preserves null serial when device is absent', () => {
    expect(
      adaptCommanderStatus(
        makeResponse({ firmware_kind: 'not_present', serial: null }),
      ).serial,
    ).toBeNull()
  })
})

describe('adaptCommanderStatus — raw descriptor fields', () => {
  it('formats vendor_id and product_id as 0x-prefixed uppercase hex', () => {
    const status = adaptCommanderStatus(
      makeResponse({ vendor_id: 0x2eee, product_id: 0x0301 }),
    )
    expect(status.raw?.vendor_id).toBe('0x2EEE')
    expect(status.raw?.product_id).toBe('0x0301')
  })

  it('formats null IDs as empty string so the status card shows "—"', () => {
    const status = adaptCommanderStatus(
      makeResponse({ vendor_id: null, product_id: null }),
    )
    expect(status.raw?.vendor_id).toBe('')
    expect(status.raw?.product_id).toBe('')
  })

  it('threads firmware_kind into raw so the bespoke field is still inspectable', () => {
    expect(
      adaptCommanderStatus(makeResponse({ firmware_kind: 'custom' })).raw
        ?.firmware_kind,
    ).toBe('custom')
  })

  it('preserves capability flags so picker UIs can hide unsupported actions', () => {
    const status = adaptCommanderStatus(
      makeResponse({
        supports_discovery_wizard: true,
        supports_canonical_config_push: false,
      }),
    )
    expect(status.raw?.supports_discovery_wizard).toBe(true)
    expect(status.raw?.supports_canonical_config_push).toBe(false)
  })

  it('substitutes empty strings for null descriptor fields', () => {
    const status = adaptCommanderStatus(
      makeResponse({
        product_string: null,
        manufacturer_string: null,
        bcd_device: null,
        sysfs_path: null,
      }),
    )
    expect(status.raw?.product_string).toBe('')
    expect(status.raw?.manufacturer_string).toBe('')
    expect(status.raw?.bcd_device).toBe('')
    expect(status.raw?.sysfs_path).toBe('')
  })

  it('preserves non-null descriptor fields verbatim', () => {
    const status = adaptCommanderStatus(makeResponse())
    expect(status.raw?.product_string).toBe('TSMIDI2.0')
    expect(status.raw?.manufacturer_string).toBe('MeloAudio')
    expect(status.raw?.bcd_device).toBe('0100')
    expect(status.raw?.sysfs_path).toBe('/sys/bus/usb/devices/1-2')
  })
})

describe('meloaudioCommanderPack descriptor', () => {
  it('declares all five Configurator primitives', () => {
    expect(meloaudioCommanderPack.supportedPrimitives).toEqual([
      'detection',
      'discovery',
      'override',
      'install',
      'push',
    ])
  })

  it('uses the canonical pack_id and a human display name', () => {
    expect(meloaudioCommanderPack.packId).toBe('meloaudio')
    expect(meloaudioCommanderPack.displayName).toBe('MeloAudio MIDI Commander')
    expect(meloaudioCommanderPack.vendorName).toBe('MeloAudio')
  })

  it('points to the bespoke production UI route in metadata', () => {
    expect(meloaudioCommanderPack.metadata?.bespoke_route).toBe(
      '/midi-services/devices/meloaudio-commander',
    )
  })

  it('starts with no tabs in slice 3 — bespoke UI owns the operator surface', () => {
    expect(meloaudioCommanderPack.tabs).toEqual([])
  })
})
