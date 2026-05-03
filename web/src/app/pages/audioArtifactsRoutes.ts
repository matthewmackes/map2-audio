// Nav reorg 2026-05-03 (second pass) — `/artifacts` is now the
// canonical Audio Artifacts mount (was `/workspace/artifacts`).
// `WORKSPACE_ARTIFACTS_BASE_PATH` and the matching `buildWorkspace*`
// helpers below are retained only as redirect targets for legacy
// operator bookmarks; do NOT use them to construct new links.
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

// The buildWorkspaceArtifacts* helpers historically pointed at the
// legacy `/workspace/artifacts` mount. They now return the canonical
// `/artifacts` path so any in-flight callsite that hasn't been
// renamed to `buildArtifactsPath` keeps working without an extra
// redirect hop. Future cleanup should rename callsites to the
// `buildArtifacts*` variants and delete these aliases.
export function buildWorkspaceArtifactsPath(search?: string | URLSearchParams | null): string {
  return buildArtifactsPath(search)
}

export function buildWorkspaceArtifactsDiscoverPath(search?: string | URLSearchParams | null): string {
  return buildArtifactsDiscoverPath(search)
}
