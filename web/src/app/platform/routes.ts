import { isStandalonePanel, type StandalonePanel } from '../data/platformMenuItems'
import { buildHostMachinePath } from '../pages/hostMachineRoutes'
import { isPlatformLayerId, type PlatformLayerId } from './model'

export type PlatformWorkspaceId = PlatformLayerId | StandalonePanel
export const PLATFORM_WORKSPACE_BASE_PATH = '/platforms'
export const WORKSPACE_HUB_PLATFORM_BASE_PATH = '/workspace/platforms'

const LEGACY_PLATFORM_LAYER_REDIRECTS: Record<string, PlatformLayerId> = {
  'single-node': 'management',
  'api-observatory': 'network-discovery',
}

export function isPlatformWorkspaceId(value: string | null | undefined): value is PlatformWorkspaceId {
  return isPlatformLayerId(value) || isStandalonePanel(value)
}

function buildPlatformWorkspacePathForBase(
  basePath: string,
  workspace: PlatformWorkspaceId = 'overview',
): string {
  if (workspace === 'host-machine') {
    return buildHostMachinePath()
  }

  return `${basePath}/${workspace}`
}

export function buildPlatformWorkspacePath(workspace: PlatformWorkspaceId = 'overview'): string {
  return buildPlatformWorkspacePathForBase(PLATFORM_WORKSPACE_BASE_PATH, workspace)
}

export function buildWorkspaceHubPlatformPath(workspace: PlatformWorkspaceId = 'overview'): string {
  return buildPlatformWorkspacePathForBase(WORKSPACE_HUB_PLATFORM_BASE_PATH, workspace)
}

function normalizeSearchValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function buildPlatformNodeWorkspaceHref(
  workspace: PlatformWorkspaceId = 'overview',
  nodeId?: string | null,
): string {
  const normalizedNodeId = normalizeSearchValue(nodeId)
  const basePath = buildPlatformWorkspacePath(workspace)

  if (!normalizedNodeId) {
    return basePath
  }

  const searchParams = new URLSearchParams()
  searchParams.set('focusNodeId', normalizedNodeId)
  return `${basePath}?${searchParams.toString()}`
}

export function resolvePlatformWorkspaceTarget(workspace: string | null | undefined): {
  layer?: PlatformLayerId
  panel?: StandalonePanel
} | null {
  const normalizedWorkspace = workspace && LEGACY_PLATFORM_LAYER_REDIRECTS[workspace]
    ? LEGACY_PLATFORM_LAYER_REDIRECTS[workspace]
    : workspace

  if (isPlatformLayerId(normalizedWorkspace)) {
    return { layer: normalizedWorkspace }
  }

  if (isStandalonePanel(normalizedWorkspace)) {
    return { panel: normalizedWorkspace }
  }

  return null
}

export function buildLegacyPlatformWorkspaceRedirectPath(
  workspace: string | null | undefined,
  buildPath: (workspace: PlatformWorkspaceId) => string = buildPlatformWorkspacePath,
): string | null {
  if (!workspace) {
    return null
  }

  if (workspace === 'midi-cluster') {
    return '/midi-hub/connections'
  }

  if (workspace === 'host-machine') {
    return buildHostMachinePath()
  }

  const redirectedLayer = LEGACY_PLATFORM_LAYER_REDIRECTS[workspace]
  return redirectedLayer ? buildPath(redirectedLayer) : null
}

export function buildLegacyPlatformRedirectPath(
  searchParams: URLSearchParams,
  buildPath: (workspace: PlatformWorkspaceId) => string = buildPlatformWorkspacePath,
): string | null {
  const layer = searchParams.get('layer')
  const panel = searchParams.get('panel')
  const redirectedLayer = layer ? LEGACY_PLATFORM_LAYER_REDIRECTS[layer] ?? layer : layer
  const target = panel && isStandalonePanel(panel)
    ? buildPath(panel)
    : redirectedLayer && isPlatformLayerId(redirectedLayer)
      ? buildPath(redirectedLayer)
      : null

  if (!target) {
    return null
  }

  const nextSearchParams = new URLSearchParams(searchParams)
  nextSearchParams.delete('layer')
  nextSearchParams.delete('panel')
  const nextSearch = nextSearchParams.toString()
  return nextSearch ? `${target}?${nextSearch}` : target
}
