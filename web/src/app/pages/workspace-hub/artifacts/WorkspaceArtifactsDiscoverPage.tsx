import { AudioArtifactsPage } from '../../AudioArtifactsPage'
import {
  WORKSPACE_ARTIFACTS_BASE_PATH,
  buildWorkspaceArtifactsDiscoverPath,
  buildWorkspaceArtifactsPath,
} from '../../audioArtifactsRoutes'

export function WorkspaceArtifactsDiscoverPage() {
  return (
    <AudioArtifactsPage
      discoverMode
      renderShell={false}
      buildLibraryPath={buildWorkspaceArtifactsPath}
      buildDiscoverPath={buildWorkspaceArtifactsDiscoverPath}
      routeActivePaths={[WORKSPACE_ARTIFACTS_BASE_PATH]}
    />
  )
}

export default WorkspaceArtifactsDiscoverPage
