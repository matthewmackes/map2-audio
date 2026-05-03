/**
 * T2492-2 — covers the Connections-page "Unknown device" Tag eligibility.
 *
 * The backend enriches each port in /api/midi/hub/status with
 * vendor_id/product_id/profile_id (when known). isUnknownDevicePort
 * gates the Tag click-through to DevicePackGeneratorModal.
 */

import { describe, expect, it } from '@jest/globals'
import { isUnknownDevicePort, readPorts } from './portUtils'
import type { HubPort } from './portUtils'

const ALSA_PORT_BASE: HubPort = {
  port_id: 'alsa:0:Unknown Vendor MIDI Adapter',
  name: 'Unknown Vendor MIDI Adapter',
  direction: 'duplex',
  kind: 'alsa',
}

describe('readPorts', () => {
  it('parses the optional USB descriptor + profile_id fields', () => {
    const ports = readPorts([
      {
        port_id: 'alsa:0:foo',
        name: 'foo',
        direction: 'duplex',
        kind: 'alsa',
        vendor_id: '0x1234',
        product_id: '0x5678',
        profile_id: 'maschine_mk1',
      },
    ])
    expect(ports[0]).toMatchObject({
      vendor_id: '0x1234',
      product_id: '0x5678',
      profile_id: 'maschine_mk1',
    })
  })

  it('leaves descriptor fields undefined when the backend omits them', () => {
    const ports = readPorts([
      { port_id: 'virt:0:net', name: 'net', direction: 'duplex', kind: 'virtual' },
    ])
    expect(ports[0].vendor_id).toBeUndefined()
    expect(ports[0].product_id).toBeUndefined()
    expect(ports[0].profile_id).toBeUndefined()
  })

  it('drops empty-string descriptor values to undefined', () => {
    const ports = readPorts([
      {
        port_id: 'alsa:0:foo',
        name: 'foo',
        direction: 'duplex',
        kind: 'alsa',
        vendor_id: '   ',
        product_id: '',
      },
    ])
    expect(ports[0].vendor_id).toBeUndefined()
    expect(ports[0].product_id).toBeUndefined()
  })
})

describe('isUnknownDevicePort', () => {
  it('returns false for non-alsa ports even with VID/PID', () => {
    expect(
      isUnknownDevicePort({
        ...ALSA_PORT_BASE,
        kind: 'virtual',
        vendor_id: '0x1234',
        product_id: '0x5678',
      }),
    ).toBe(false)
  })

  it('returns false when the backend has not surfaced VID/PID', () => {
    expect(isUnknownDevicePort(ALSA_PORT_BASE)).toBe(false)
  })

  it('returns true when VID/PID known but no curated profile', () => {
    expect(
      isUnknownDevicePort({
        ...ALSA_PORT_BASE,
        vendor_id: '0x1234',
        product_id: '0x5678',
      }),
    ).toBe(true)
  })

  it('returns true when device-registry resolved to generic_controller', () => {
    expect(
      isUnknownDevicePort({
        ...ALSA_PORT_BASE,
        vendor_id: '0x1234',
        product_id: '0x5678',
        profile_id: 'generic_controller',
      }),
    ).toBe(true)
  })

  it('returns false when a curated device-pack matches the VID/PID', () => {
    expect(
      isUnknownDevicePort({
        ...ALSA_PORT_BASE,
        vendor_id: '0x17cc',
        product_id: '0x0808',
        profile_id: 'maschine_mk1',
      }),
    ).toBe(false)
  })
})
