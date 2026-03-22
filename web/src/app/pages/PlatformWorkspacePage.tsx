import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { PlatformModalContent } from '../components/Platform/PlatformModal'
import { buildPlatformWorkspacePath, resolvePlatformWorkspaceTarget } from '../platform/routes'

export function PlatformWorkspacePage() {
  const navigate = useNavigate()
  const { workspace } = useParams<{ workspace: string }>()
  const target = resolvePlatformWorkspaceTarget(workspace)

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
          navigate('/labs')
          return
        }

        navigate(buildPlatformWorkspacePath((params.panel ?? params.layer) ?? 'overview'))
      }}
      onLaunchRoute={(to) => navigate(to)}
      onClose={() => navigate('/')}
    />
  )
}

export default PlatformWorkspacePage
