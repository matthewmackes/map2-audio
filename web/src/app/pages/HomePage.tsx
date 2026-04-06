import type { ComponentType, MouseEvent } from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar, Tag } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_VERSION,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { MapClusterFabricIcon } from '../components/icons/map/MapAppIcons'
import { MapArtifactsLibraryIcon } from '../components/icons/map'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useNodeTopology } from '../hooks/useNodeTopology'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { type RemediationWorkflow, usePlatformRemediationSummary } from '../hooks/usePlatformRemediation'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { getLauncherCatalogItem, normalizeLandingTiles, type LandingTilePlacement } from '../data/launcherCatalog'
import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'
import landingBg from '../../assets/NEW-map2-landing-bg.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import './HomePage.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

// ── Node status for Platforms card ──────────────────────────────────────────

function nodeStatusLabel(nodes: Array<{ status?: string }> | undefined): string {
  if (!Array.isArray(nodes) || nodes.length <= 0) {
    return 'Nodes unavailable'
  }

  const unhealthyCount = nodes.filter((node) => (
    node.status === 'warn'
    || node.status === 'critical'
    || node.status === 'offline'
  )).length
  if (unhealthyCount > 0) {
    return `${unhealthyCount} of ${nodes.length} nodes need attention`
  }

  return `${nodes.length} node${nodes.length !== 1 ? 's' : ''} online`
}

const DEFAULT_DESKTOP_TILES: LandingTilePlacement[] = [
  { route: '/artifacts', size: 'medium' },
]

interface DesktopLauncher {
  route: string
  label: string
  description: string
  Icon: ComponentType<{ size?: number }>
}

interface DesktopContextMenuState {
  kind: 'wallpaper' | 'icon'
  x: number
  y: number
  route?: string
  label?: string
}

function resolveDesktopLaunchers(
  landingTiles: Array<LandingTilePlacement | { route?: string | null; size?: string | null }> | undefined,
): DesktopLauncher[] {
  const normalized = normalizeLandingTiles(landingTiles)
  const sourceTiles = normalized.length > 0 ? normalized : DEFAULT_DESKTOP_TILES

  return sourceTiles
    .map((tile) => {
      const launcher = getLauncherCatalogItem(tile.route)
      if (!launcher) {
        return null
      }

      const Icon = tile.route === '/artifacts' ? MapArtifactsLibraryIcon : launcher.icon
      return {
        route: tile.route,
        label: launcher.label,
        description: launcher.description,
        Icon,
      }
    })
    .filter((launcher): launcher is DesktopLauncher => Boolean(launcher))
}

// ── Component ───────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const { localNode } = useNodePageContext(NODE_PAGE_KEYS.home)
  const topology = useNodeTopology()
  const remediationSummary = usePlatformRemediationSummary()
  const { settings: specialSettings, updateSettings } = useSpecialSettings()
  const [activeRemediation, setActiveRemediation] = useState<{
    mode: RemediationWorkflow
    state: string | null
    nodeIds: string[]
  } | null>(null)
  const [showBootSplash, setShowBootSplash] = useState(() => shouldShowHomeBootSplash())
  const [contextMenu, setContextMenu] = useState<DesktopContextMenuState | null>(null)
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'
  const platformStatus = useHomePlatformStatus()
  const nodes = topology.data?.nodes
  const desktopLaunchers = useMemo(
    () => resolveDesktopLaunchers(specialSettings?.landingTiles),
    [specialSettings?.landingTiles],
  )
  const hasPinnedDesktopIcons = useMemo(
    () => normalizeLandingTiles(specialSettings?.landingTiles).length > 0,
    [specialSettings?.landingTiles],
  )
  const platformsStatusLabel = nodeStatusLabel(nodes)
  const remediationCounts = remediationSummary.data?.counts
  const syncWorkflowAvailable = remediationSummary.data?.workflows?.sync?.available !== false

  const remediationPills = [
    { workflow: 'adoption' as const, state: 'candidate', count: remediationCounts?.adoption?.candidate ?? 0, label: 'Needs Adoption' },
    { workflow: 'adoption' as const, state: 'claimable', count: remediationCounts?.adoption?.claimable ?? 0, label: 'Claimable' },
    { workflow: 'adoption' as const, state: 'adopted', count: remediationCounts?.adoption?.adopted ?? 0, label: 'Adopted' },
    { workflow: 'adoption' as const, state: 'ready', count: remediationCounts?.adoption?.ready ?? 0, label: 'Ready' },
    { workflow: 'adoption' as const, state: 'blocked', count: remediationCounts?.adoption?.blocked ?? 0, label: 'Blocked' },
    { workflow: 'sync' as const, state: 'outdated', count: remediationCounts?.sync?.outdated ?? 0, label: 'Outdated' },
    { workflow: 'sync' as const, state: 'syncing', count: remediationCounts?.sync?.syncing ?? 0, label: 'Syncing' },
    { workflow: 'sync' as const, state: 'failed', count: remediationCounts?.sync?.failed ?? 0, label: 'Failed' },
    { workflow: 'sync' as const, state: 'held', count: remediationCounts?.sync?.held ?? 0, label: 'Held' },
    { workflow: 'sync' as const, state: 'rollback_available', count: remediationCounts?.sync?.rollback_available ?? 0, label: 'Rollback' },
    { workflow: 'clone' as const, state: 'confirmed_clone', count: remediationCounts?.clone?.confirmed_clone ?? 0, label: 'Confirmed Clone' },
    { workflow: 'clone' as const, state: 'suspected_clone', count: remediationCounts?.clone?.suspected_clone ?? 0, label: 'Suspected Clone' },
  ].filter((pill) => pill.count > 0 && (pill.workflow !== 'sync' || syncWorkflowAvailable))
  const totalRemediationCount = remediationPills.reduce((sum, pill) => sum + pill.count, 0)
  const remediationWatermarkEntry = remediationPills.find((pill) => pill.workflow === 'sync')
    ?? remediationPills.find((pill) => pill.workflow === 'adoption')
    ?? remediationPills[0]

  useEffect(() => {
    if (!showBootSplash) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
    }, HOME_BOOT_SPLASH_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showBootSplash])

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    const handleDismiss = () => setContextMenu(null)
    window.addEventListener('click', handleDismiss)
    window.addEventListener('contextmenu', handleDismiss)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('contextmenu', handleDismiss)
    }
  }, [contextMenu])

  const openWallpaperMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setContextMenu({
      kind: 'wallpaper',
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openIconMenu = (event: MouseEvent<HTMLButtonElement>, launcher: DesktopLauncher) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      kind: 'icon',
      x: event.clientX,
      y: event.clientY,
      route: launcher.route,
      label: launcher.label,
    })
  }

  const handleRefreshDesktop = () => {
    setContextMenu(null)
    window.location.reload()
  }

  const handleOpenDesktopRoute = (route: string) => {
    setContextMenu(null)
    navigate(route)
  }

  const handleUnpinDesktopRoute = async (route: string | undefined) => {
    if (!route) {
      return
    }

    const nextTiles = normalizeLandingTiles(specialSettings?.landingTiles).filter((tile) => tile.route !== route)
    await updateSettings({ landingTiles: nextTiles })
    setContextMenu(null)
  }

  const handleOpenRemediationWatermark = () => {
    if (!remediationWatermarkEntry) {
      setActiveRemediation({ mode: 'sync', state: null, nodeIds: [] })
      return
    }

    const nodeIds = (remediationSummary.data?.nodes ?? [])
      .filter((node) => node.adoption_state === remediationWatermarkEntry.state || node.sync_states.includes(remediationWatermarkEntry.state) || node.clone_states.includes(remediationWatermarkEntry.state))
      .map((node) => node.node_id)
    setActiveRemediation({
      mode: remediationWatermarkEntry.workflow,
      state: remediationWatermarkEntry.state,
      nodeIds,
    })
  }

  if (showBootSplash) {
    return (
      <section className="hp2-boot" aria-label="MAP2 boot splash">
        <div className="hp2-boot__center">
          <div className="hp2-boot__mark-wrap" aria-hidden="true">
            <Map2BrandMark className="hp2-boot__mark" />
          </div>
          <p className="hp2-boot__eyebrow">MAP2</p>
          <h1 className="hp2-boot__title">{MAP2_PLATFORM_NAME}</h1>
          <p className="hp2-boot__subtitle">Preparing desktop shell and restoring platform context.</p>
        </div>
        <div className="hp2-boot__progress">
          <ProgressBar
            label="Boot progress"
            helperText="Starting desktop experience"
            hideLabel
            value={null}
          />
        </div>
      </section>
    )
  }

  return (
    <div className="hp2-root">
      <section
        className={`hp2-desktop hp2-desktop--${wallpaper.mode}`}
        data-testid="home-desktop"
        data-wallpaper-mode={wallpaper.mode}
        onContextMenu={openWallpaperMenu}
      >
        {wallpaper.mode !== 'solid-theme' ? (
          <img
            src={wallpaper.mode === 'uploaded-image' ? wallpaper.imageDataUrl : landingBg}
            alt=""
            className="hp2-desktop__wallpaper"
            data-testid="home-desktop-wallpaper-image"
            aria-hidden="true"
          />
        ) : null}
        <div className="hp2-desktop__scrim" aria-hidden="true" />
        <div className="hp2-desktop__status">
          <div className="hp2-desktop__icons" role="list" aria-label="Desktop icons">
            {desktopLaunchers.map((launcher) => (
              <button
                key={launcher.route}
                type="button"
                className="hp2-desktop__icon"
                role="listitem"
                aria-label={`Open ${launcher.label}`}
                title={launcher.description}
                onClick={() => navigate(launcher.route)}
                onContextMenu={(event) => openIconMenu(event, launcher)}
              >
                <span className="hp2-desktop__icon-glyph" aria-hidden="true">
                  <launcher.Icon size={40} />
                </span>
                <span className="hp2-desktop__icon-label">{launcher.label}</span>
              </button>
            ))}
          </div>
          <div className="hp2-desktop__platform-card" role="button" aria-label="Open Platforms overview" tabIndex={0} onClick={() => navigate('/platforms/overview')} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              navigate('/platforms/overview')
            }
          }}>
            <div className="hp2-desktop__platform-meta">
              <MapClusterFabricIcon size={20} aria-hidden />
              <strong>Platforms</strong>
            </div>
            <p>{syncWorkflowAvailable ? platformsStatusLabel : 'Sync unavailable'}</p>
            {(remediationPills.length > 0 || !syncWorkflowAvailable) ? (
              <div className="hp2-card__pills" aria-label="Platforms remediation pills">
                {remediationPills.map((pill) => (
                  <button
                    key={`${pill.workflow}-${pill.state}`}
                    type="button"
                    className="hp2-card__pill"
                    onClick={(event) => {
                      event.stopPropagation()
                      const nodeIds = (remediationSummary.data?.nodes ?? [])
                        .filter((node) => node.adoption_state === pill.state || node.sync_states.includes(pill.state) || node.clone_states.includes(pill.state))
                        .map((node) => node.node_id)
                      if (pill.workflow === 'adoption') {
                        navigate(`/platforms/adoption?state=${encodeURIComponent(pill.state)}`)
                        return
                      }
                      setActiveRemediation({ mode: pill.workflow, state: pill.state, nodeIds })
                    }}
                  >
                    {pill.label}: {pill.count}
                  </button>
                ))}
                {!syncWorkflowAvailable ? (
                  <span className="hp2-card__pill hp2-card__pill--neutral">Sync unavailable</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <footer className="hp2-footer">
            {MAP2_PLATFORM_VERSION} · {hostname} · {platformStatus.avb.label} · {platformStatus.avdecc.label} · {platformStatus.nodes.label}
          </footer>
        </div>
        <div className="hp2-desktop__watermarks" aria-label="Desktop watermarks">
          {!hasPinnedDesktopIcons ? (
            <button
              type="button"
              className="hp2-desktop__watermark"
              data-testid="home-desktop-empty-watermark"
              onClick={() => navigate('/platforms/workspace-catalog')}
            >
              <span className="hp2-desktop__watermark-eyebrow">Desktop hint</span>
              <strong>Visit Workspace Catalog</strong>
              <span>Pin apps to the desktop to replace this empty-state hint.</span>
            </button>
          ) : null}
          {(totalRemediationCount > 0 || !syncWorkflowAvailable) ? (
            <button
              type="button"
              className="hp2-desktop__watermark hp2-desktop__watermark--remediation"
              data-testid="home-desktop-remediation-watermark"
              onClick={handleOpenRemediationWatermark}
            >
              <span className="hp2-desktop__watermark-eyebrow">Platform remediation</span>
              <strong>{totalRemediationCount > 0 ? `${totalRemediationCount} items need attention` : 'Sync unavailable'}</strong>
              <span>Open the remediation workflow.</span>
            </button>
          ) : null}
        </div>
        {contextMenu ? (
          <div
            className="hp2-desktop__context-menu"
            role="menu"
            aria-label={contextMenu.kind === 'wallpaper' ? 'Desktop context menu' : `Desktop icon menu for ${contextMenu.label ?? 'item'}`}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.kind === 'wallpaper' ? (
              <>
                <button type="button" className="hp2-desktop__context-item" onClick={handleRefreshDesktop}>
                  Refresh
                </button>
                <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/theme')}>
                  Display settings
                </button>
                <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/about')}>
                  About
                </button>
              </>
            ) : (
              <>
                <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute(contextMenu.route ?? '/')}>
                  Open
                </button>
                <button type="button" className="hp2-desktop__context-item" onClick={() => void handleUnpinDesktopRoute(contextMenu.route)}>
                  Unpin from Desktop
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>
      {activeRemediation ? (
        <PlatformRemediationWorkflow
          mode={activeRemediation.mode}
          stateFilter={activeRemediation.state}
          initialNodeIds={activeRemediation.nodeIds}
          summary={remediationSummary.data}
          onRequestClose={() => setActiveRemediation(null)}
        />
      ) : null}
    </div>
  )
}

export default HomePage
