import { isStandalonePanel, type StandalonePanel } from '../data/platformMenuItems'
import { isPlatformLayerId, type PlatformLayerId } from './model'

export type PlatformWorkspaceId = PlatformLayerId | StandalonePanel

export function isPlatformWorkspaceId(value: string | null | undefined): value is PlatformWorkspaceId {
  return isPlatformLayerId(value) || isStandalonePanel(value)
}

export function buildPlatformWorkspacePath(workspace: PlatformWorkspaceId = 'overview'): string {
  return `/platforms/${workspace}`
}

export function resolvePlatformWorkspaceTarget(workspace: string | null | undefined): {
  layer?: PlatformLayerId
  panel?: StandalonePanel
} | null {
  if (isPlatformLayerId(workspace)) {
    return { layer: workspace }
  }

  if (isStandalonePanel(workspace)) {
    return { panel: workspace }
  }

  return null
}

export function buildLegacyPlatformRedirectPath(searchParams: URLSearchParams): string | null {
  const layer = searchParams.get('layer')
  const panel = searchParams.get('panel')
  const target = panel && isStandalonePanel(panel)
    ? buildPlatformWorkspacePath(panel)
    : layer && isPlatformLayerId(layer)
      ? buildPlatformWorkspacePath(layer)
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
