import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { PlatformModalContent } from '../../../components/Platform/PlatformModal'
import {
  buildLegacyPlatformWorkspaceRedirectPath,
  buildWorkspaceHubPlatformPath,
  resolvePlatformWorkspaceTarget,
} from '../../../platform/routes'

export function PlatformWorkspaceSection() {
  const navigate = useNavigate()
  const { workspace } = useParams<{ workspace: string }>()
  const legacyRedirect = buildLegacyPlatformWorkspaceRedirectPath(workspace, buildWorkspaceHubPlatformPath)
  const target = resolvePlatformWorkspaceTarget(workspace)

  if (legacyRedirect) {
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
      onClose={() => navigate('/workspace')}
    />
  )
}

export default PlatformWorkspaceSection
