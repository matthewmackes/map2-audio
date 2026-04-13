import { AudioArtifactsPage } from '../../AudioArtifactsPage'
import {
  WORKSPACE_ARTIFACTS_BASE_PATH,
  buildWorkspaceArtifactsDiscoverPath,
  buildWorkspaceArtifactsPath,
} from '../../audioArtifactsRoutes'

export function WorkspaceArtifactsOverviewPage() {
  return (
    <AudioArtifactsPage
      renderShell={false}
      buildLibraryPath={buildWorkspaceArtifactsPath}
      buildDiscoverPath={buildWorkspaceArtifactsDiscoverPath}
      routeActivePaths={[WORKSPACE_ARTIFACTS_BASE_PATH]}
    />
  )
}

export default WorkspaceArtifactsOverviewPage
