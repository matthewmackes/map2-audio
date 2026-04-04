import {
  buildLegacyPlatformRedirectPath,
  buildPlatformNodeWorkspaceHref,
  buildPlatformWorkspacePath,
} from './routes'

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
})
