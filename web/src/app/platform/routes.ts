import { isStandalonePanel, type StandalonePanel } from '../data/platformMenuItems'
import { buildHostMachinePath } from '../pages/hostMachineRoutes'
import { isPlatformLayerId, type PlatformLayerId } from './model'

export type PlatformWorkspaceId = PlatformLayerId | StandalonePanel

// Nav reorg 2026-05-03 (second pass) — `/workspace/*` and the
// `/platforms/` middle segment are eliminated as canonical paths.
// `/node-ops/*` is now the canonical mount for everything that used
// to live at `/workspace/platforms/*`. Legacy /workspace/* and
// /platforms/* URLs continue to resolve via App.tsx redirects so
// existing operator bookmarks survive.
export const NODE_OPS_BASE_PATH = '/node-ops'
// Legacy bases retained only as targets for redirect helpers and
// breadcrumb fallbacks; do NOT use these to construct new links.
export const LEGACY_PLATFORM_WORKSPACE_BASE_PATH = '/platforms'
export const LEGACY_WORKSPACE_HUB_PLATFORM_BASE_PATH = '/workspace/platforms'

// Backwards-compat alias — older callsites import the original
// `PLATFORM_WORKSPACE_BASE_PATH` symbol to detect when the user is on
// a legacy `/platforms/...` URL. The string value stays `/platforms`
// so existing prefix-matching code keeps working; consumers that need
// to also recognize the canonical `/node-ops/*` mount have been
// updated separately. New code should import the explicit
// `LEGACY_PLATFORM_WORKSPACE_BASE_PATH` or `NODE_OPS_BASE_PATH`.
export const PLATFORM_WORKSPACE_BASE_PATH = LEGACY_PLATFORM_WORKSPACE_BASE_PATH

// About has its own root URL (it's a top-level nav item, not a
// Node Ops sub-page anymore). Keep the helper so callers don't have
// to know which target each panel maps to.
const ROOT_PANEL_ROUTES: Partial<Record<StandalonePanel, string>> = {
  about: '/about',
}

const LEGACY_PLATFORM_LAYER_REDIRECTS: Record<string, PlatformLayerId> = {
  'single-node': 'management',
}

const LEGACY_PLATFORM_PANEL_REDIRECTS: Record<string, StandalonePanel> = {
  'api-webhooks': 'midpoint',
}

export function isPlatformWorkspaceId(value: string | null | undefined): value is PlatformWorkspaceId {
  return isPlatformLayerId(value) || isStandalonePanel(value)
}

function buildNodeOpsWorkspacePath(workspace: PlatformWorkspaceId = 'overview'): string {
  if (workspace === 'host-machine') {
    return buildHostMachinePath()
  }

  const rootRoute = ROOT_PANEL_ROUTES[workspace as StandalonePanel]
  if (rootRoute) {
    return rootRoute
  }

  return `${NODE_OPS_BASE_PATH}/${workspace}`
}

/**
 * Canonical builder for any node-ops platform/panel surface.
 * After the 2026-05-03 second-pass reorg, this returns paths under
 * `/node-ops/*` (or the dedicated root URL for panels listed in
 * ROOT_PANEL_ROUTES, e.g. `/about`).
 */
export function buildPlatformWorkspacePath(workspace: PlatformWorkspaceId = 'overview'): string {
  return buildNodeOpsWorkspacePath(workspace)
}

/**
 * Historically there were two separate path builders — one for the
 * raw `/platforms/*` mount and one for the WorkspaceHubShell's
 * `/workspace/platforms/*` mount. Both surfaces have been collapsed
 * onto the canonical `/node-ops/*` mount, so this helper now returns
 * the same path as `buildPlatformWorkspacePath`. The function is
 * preserved as a thin alias to avoid touching every callsite at once;
 * future cleanup can inline it.
 */
export function buildWorkspaceHubPlatformPath(workspace: PlatformWorkspaceId = 'overview'): string {
  return buildNodeOpsWorkspacePath(workspace)
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
    : workspace && LEGACY_PLATFORM_PANEL_REDIRECTS[workspace]
      ? LEGACY_PLATFORM_PANEL_REDIRECTS[workspace]
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

  // Nav reorg 2026-05-03 — AVB Routing was promoted out of the
  // platform layer set into its own /avb/* shell.
  if (workspace === 'avb-routing') {
    return '/avb/routing'
  }

  const redirectedPanel = LEGACY_PLATFORM_PANEL_REDIRECTS[workspace]
  if (redirectedPanel) {
    return buildPath(redirectedPanel)
  }

  const redirectedLayer = LEGACY_PLATFORM_LAYER_REDIRECTS[workspace]
  if (redirectedLayer) {
    return buildPath(redirectedLayer)
  }

  // Nav reorg 2026-05-03 (second pass) — any direct workspace id
  // that is itself a known panel/layer also needs to be redirected
  // into the canonical /node-ops/* (or root) path. Without this
  // branch a legacy bookmark like /platforms/audio-engine would
  // null-resolve and fall through to the catch-all.
  if (isPlatformLayerId(workspace) || isStandalonePanel(workspace)) {
    return buildPath(workspace as PlatformWorkspaceId)
  }

  return null
}

export function buildLegacyPlatformRedirectPath(
  searchParams: URLSearchParams,
  buildPath: (workspace: PlatformWorkspaceId) => string = buildPlatformWorkspacePath,
): string | null {
  const layer = searchParams.get('layer')
  const panel = searchParams.get('panel')

  // Nav reorg 2026-05-03 — handle ?layer=avb-routing first.
  if (layer === 'avb-routing') {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('layer')
    nextSearchParams.delete('panel')
    const nextSearch = nextSearchParams.toString()
    return nextSearch ? `/avb/routing?${nextSearch}` : '/avb/routing'
  }

  const redirectedLayer = layer ? LEGACY_PLATFORM_LAYER_REDIRECTS[layer] ?? layer : layer
  const redirectedPanel = panel ? LEGACY_PLATFORM_PANEL_REDIRECTS[panel] ?? panel : panel
  const target = panel && isStandalonePanel(panel)
    ? buildPath(panel)
    : redirectedPanel && isStandalonePanel(redirectedPanel)
      ? buildPath(redirectedPanel)
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
