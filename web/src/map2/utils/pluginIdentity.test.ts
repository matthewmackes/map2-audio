import {
  getPluginIdentityKey,
  getPluginIdentityKeyFromParts,
  samePluginIdentity,
} from './pluginIdentity'

describe('pluginIdentity', () => {
  it('prefers instance identity when available', () => {
    expect(getPluginIdentityKey({
      uri: 'urn:test:duplicate',
      position: 0,
      instance_id: 101,
    })).toBe('instance:101')

    expect(getPluginIdentityKeyFromParts('urn:test:duplicate', 1, 202)).toBe('instance:202')
  })

  it('falls back to uri plus position when no instance id exists', () => {
    expect(getPluginIdentityKey({
      uri: 'urn:test:duplicate',
      position: 3,
    })).toBe('position:urn:test:duplicate:3')
  })

  it('matches duplicate plugins by instance id before uri and position', () => {
    expect(samePluginIdentity(
      { uri: 'urn:test:duplicate', position: 0, instance_id: 101 },
      { uri: 'urn:test:duplicate', position: 1, instance_id: 101 },
    )).toBe(true)

    expect(samePluginIdentity(
      { uri: 'urn:test:duplicate', position: 0, instance_id: 101 },
      { uri: 'urn:test:duplicate', position: 0, instance_id: 202 },
    )).toBe(false)

    expect(samePluginIdentity(
      { uri: 'urn:test:duplicate', position: 4, instance_id: 101 },
      { uri: 'urn:test:duplicate', position: 4 },
    )).toBe(true)
  })
})
