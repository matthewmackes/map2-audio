import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { PlatformModalContent } from '../components/Platform/PlatformModal'
import {
  buildLegacyPlatformWorkspaceRedirectPath,
  buildPlatformWorkspacePath,
  resolvePlatformWorkspaceTarget,
} from '../platform/routes'

export function PlatformWorkspacePage() {
  const navigate = useNavigate()
  const { workspace } = useParams<{ workspace: string }>()
  const legacyRedirect = buildLegacyPlatformWorkspaceRedirectPath(workspace)
  const target = resolvePlatformWorkspaceTarget(workspace)

  if (legacyRedirect) {
    return <Navigate to={legacyRedirect} replace />
  }

  if (!target) {
    return <Navigate to={buildPlatformWorkspacePath('overview')} replace />
  }

  return (
    <PlatformModalContent
      surface="route"
      initialLayer={target.layer ?? null}
      initialPanel={target.panel ?? null}
      onNavigate={(params) => {
        if (!params) {
          navigate(buildPlatformWorkspacePath('overview'))
          return
        }

        navigate(buildPlatformWorkspacePath((params.panel ?? params.layer) ?? 'overview'))
      }}
      onClose={() => navigate('/')}
    />
  )
}

export default PlatformWorkspacePage
