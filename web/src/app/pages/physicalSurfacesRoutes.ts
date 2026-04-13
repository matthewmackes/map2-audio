export const PHYSICAL_SURFACES_BASE_PATH = '/physical-surfaces'
export const WORKSPACE_PHYSICAL_SURFACES_BASE_PATH = '/workspace/physical-surfaces'

export function buildPhysicalSurfacesPath(surfaceId?: string | null): string {
  return surfaceId ? `${PHYSICAL_SURFACES_BASE_PATH}/${surfaceId}` : PHYSICAL_SURFACES_BASE_PATH
}

export function buildWorkspacePhysicalSurfacesPath(surfaceId?: string | null): string {
  return surfaceId ? `${WORKSPACE_PHYSICAL_SURFACES_BASE_PATH}/${surfaceId}` : WORKSPACE_PHYSICAL_SURFACES_BASE_PATH
}
