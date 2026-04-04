import { buildAvbRoutingWorkspaceHref } from './avbRoutingWorkspaceHref'

describe('buildAvbRoutingWorkspaceHref', () => {
  it('returns the routed Platforms AVB workspace path when no focus is provided', () => {
    expect(buildAvbRoutingWorkspaceHref()).toBe('/platforms/avb-routing')
  })

  it('builds Tesira and entity focus parameters for routed deep links', () => {
    expect(buildAvbRoutingWorkspaceHref({
      tesiraDeviceId: 'tesira-a',
      entityId: '0x0011aa22bb33cc44',
      nodeId: 'node-b',
    })).toBe('/platforms/avb-routing?focusTesiraDevice=tesira-a&focusEntity=0x0011aa22bb33cc44&focusNodeId=node-b')
  })

  it('drops blank focus parameters', () => {
    expect(buildAvbRoutingWorkspaceHref({
      tesiraDeviceId: ' ',
      entityId: 'entity-a',
      nodeId: '',
    })).toBe('/platforms/avb-routing?focusEntity=entity-a')
  })
})
