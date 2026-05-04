import {
  buildLegacyPlatformRedirectPath,
  buildPlatformNodeWorkspaceHref,
  buildPlatformWorkspacePath,
} from './routes'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

describe('platform routes', () => {
  // Nav reorg 2026-05-03 (second pass) — canonical platform/panel
  // mounts moved from `/platforms/<id>` to `/node-ops/<id>`. The
  // about panel is now `/about` (no `/node-ops/about`); host-machine
  // keeps its dedicated route.
  it('builds node-aware workspace hrefs when a focus node is supplied', () => {
    expect(buildPlatformNodeWorkspaceHref('management', 'node-b')).toBe('/node-ops/management?focusNodeId=node-b')
  })

  it('falls back to the plain workspace path when the node id is blank', () => {
    expect(buildPlatformNodeWorkspaceHref('cluster-dashboard', '   ')).toBe(buildPlatformWorkspacePath('cluster-dashboard'))
  })

  it('preserves focusNodeId when legacy layer aliases redirect into active platform routes', () => {
    const searchParams = new URLSearchParams('layer=single-node&focusNodeId=node-b')

    expect(buildLegacyPlatformRedirectPath(searchParams)).toBe('/node-ops/management?focusNodeId=node-b')
  })

  it('resolves the retired host-machine platform panel to the hardware-owned route', () => {
    expect(buildPlatformWorkspacePath('host-machine')).toBe(HOST_MACHINE_ROUTE)

    const searchParams = new URLSearchParams('panel=host-machine')
    expect(buildLegacyPlatformRedirectPath(searchParams)).toBe(HOST_MACHINE_ROUTE)
  })

  it('redirects the retired api-webhooks panel to the Midpoint workspace', () => {
    expect(buildPlatformWorkspacePath('midpoint')).toBe('/node-ops/midpoint')

    expect(buildLegacyPlatformRedirectPath(new URLSearchParams('panel=api-webhooks'))).toBe('/node-ops/midpoint')
  })

  // The `about` standalone panel was retired 2026-05-04 — the Platform Guide
  // now lives inline on Home (`/#platform-guide`), so there is no panel route
  // to promote. Test removed; the redirect itself is exercised in App.tsx.
})
