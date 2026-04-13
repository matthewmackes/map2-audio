export const ARTIFACTS_BASE_PATH = '/artifacts'
export const ARTIFACTS_DISCOVER_SEGMENT = 'discover'
export const WORKSPACE_ARTIFACTS_BASE_PATH = '/workspace/artifacts'

function normalizeSearch(search?: string | URLSearchParams | null): string {
  if (!search) {
    return ''
  }

  if (typeof search === 'string') {
    if (!search.trim()) {
      return ''
    }

    return search.startsWith('?') ? search : `?${search}`
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

export function buildArtifactsPath(search?: string | URLSearchParams | null): string {
  return `${ARTIFACTS_BASE_PATH}${normalizeSearch(search)}`
}

export function buildArtifactsDiscoverPath(search?: string | URLSearchParams | null): string {
  return `${ARTIFACTS_BASE_PATH}/${ARTIFACTS_DISCOVER_SEGMENT}${normalizeSearch(search)}`
}

export function buildWorkspaceArtifactsPath(search?: string | URLSearchParams | null): string {
  return `${WORKSPACE_ARTIFACTS_BASE_PATH}${normalizeSearch(search)}`
}

export function buildWorkspaceArtifactsDiscoverPath(search?: string | URLSearchParams | null): string {
  return `${WORKSPACE_ARTIFACTS_BASE_PATH}/${ARTIFACTS_DISCOVER_SEGMENT}${normalizeSearch(search)}`
}
