import { normalizePatchbayTopologyNodeIds } from './patchbayTopology'

describe('normalizePatchbayTopologyNodeIds', () => {
  it('returns fallback port ids when topology nodes are missing or malformed', () => {
    expect(normalizePatchbayTopologyNodeIds(undefined, ['usb-in', 'din-out'])).toEqual(['usb-in', 'din-out'])
    expect(normalizePatchbayTopologyNodeIds({ bad: true }, ['usb-in', 'din-out'])).toEqual(['usb-in', 'din-out'])
  })

  it('keeps only non-empty string topology ids when the backend returns an array', () => {
    expect(normalizePatchbayTopologyNodeIds(['usb-in', '', 5, 'din-out'], ['fallback'])).toEqual(['usb-in', 'din-out'])
  })
})
