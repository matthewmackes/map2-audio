import {
  buildLegacyPlatformRedirectPath,
  buildPlatformNodeWorkspaceHref,
  buildPlatformWorkspacePath,
} from './routes'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

describe('platform routes', () => {
  it('builds node-aware workspace hrefs when a focus node is supplied', () => {
    expect(buildPlatformNodeWorkspaceHref('management', 'node-b')).toBe('/platforms/management?focusNodeId=node-b')
  })

  it('falls back to the plain workspace path when the node id is blank', () => {
    expect(buildPlatformNodeWorkspaceHref('cluster-dashboard', '   ')).toBe(buildPlatformWorkspacePath('cluster-dashboard'))
  })

  it('preserves focusNodeId when legacy layer aliases redirect into active platform routes', () => {
    const searchParams = new URLSearchParams('layer=single-node&focusNodeId=node-b')

    expect(buildLegacyPlatformRedirectPath(searchParams)).toBe('/platforms/management?focusNodeId=node-b')
  })

  it('resolves the retired host-machine platform panel to the hardware-owned route', () => {
    expect(buildPlatformWorkspacePath('host-machine')).toBe(HOST_MACHINE_ROUTE)

    const searchParams = new URLSearchParams('panel=host-machine')
    expect(buildLegacyPlatformRedirectPath(searchParams)).toBe(HOST_MACHINE_ROUTE)
  })
})
