import { buildAvbRoutingWorkspaceHref } from './avbRoutingWorkspaceHref'

describe('buildAvbRoutingWorkspaceHref', () => {
  it('returns the canonical /avb/routing path when no focus is provided', () => {
    expect(buildAvbRoutingWorkspaceHref()).toBe('/avb/routing')
  })

  it('builds Tesira and entity focus parameters for canonical deep links', () => {
    expect(buildAvbRoutingWorkspaceHref({
      tesiraDeviceId: 'tesira-a',
      entityId: '0x0011aa22bb33cc44',
      nodeId: 'node-b',
    })).toBe('/avb/routing?focusTesiraDevice=tesira-a&focusEntity=0x0011aa22bb33cc44&focusNodeId=node-b')
  })

  it('drops blank focus parameters', () => {
    expect(buildAvbRoutingWorkspaceHref({
      tesiraDeviceId: ' ',
      entityId: 'entity-a',
      nodeId: '',
    })).toBe('/avb/routing?focusEntity=entity-a')
  })
})
