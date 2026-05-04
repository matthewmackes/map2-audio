import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import { PlatformModalContent } from '../../../components/Platform/PlatformModal'
import {
  buildLegacyPlatformWorkspaceRedirectPath,
  buildWorkspaceHubPlatformPath,
  resolvePlatformWorkspaceTarget,
} from '../../../platform/routes'

export function PlatformWorkspaceSection() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace: workspaceParam } = useParams<{ workspace: string }>()
  // Platform Guide (formerly the `about` standalone panel) was retired 2026-05-04
  // and inlined on Home — `/about` now hard-redirects, so no normalization here.
  const workspace = workspaceParam
  // Nav reorg 2026-05-03 (second pass) — `buildLegacyPlatformWorkspaceRedirectPath`
  // now returns the canonical `/node-ops/<id>` path for any known
  // workspace id, including ids we're already mounted at. Only honor
  // the redirect when it points somewhere different from the current
  // pathname; otherwise we'd infinite-redirect onto ourselves.
  const legacyRedirect = buildLegacyPlatformWorkspaceRedirectPath(workspace, buildWorkspaceHubPlatformPath)
  const target = resolvePlatformWorkspaceTarget(workspace)

  if (legacyRedirect && legacyRedirect !== `${location.pathname}${location.search}` && legacyRedirect !== location.pathname) {
    return <Navigate to={legacyRedirect} replace />
  }

  if (!target) {
    return <Navigate to={buildWorkspaceHubPlatformPath('overview')} replace />
  }

  return (
    <PlatformModalContent
      surface="route"
      renderSidebar={false}
      initialLayer={target.layer ?? null}
      initialPanel={target.panel ?? null}
      onNavigate={(params) => {
        if (!params) {
          navigate(buildWorkspaceHubPlatformPath('overview'))
          return
        }

        navigate(buildWorkspaceHubPlatformPath((params.panel ?? params.layer) ?? 'overview'))
      }}
      onClose={() => navigate('/node-ops')}
    />
  )
}

export default PlatformWorkspaceSection
