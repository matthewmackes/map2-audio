import type { ComponentType, MouseEvent } from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar, Tag, Tile } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_VERSION,
} from '../components/branding/map2Branding'
import {
  MapArtifactsLibraryIcon,
  MapOs2DrivesIcon,
  MapOs2FileManagerIcon,
  MapOs2HomeIcon,
  MapStagePerformanceIcon,
} from '../components/icons/map'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useNodeTopology } from '../hooks/useNodeTopology'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { type RemediationWorkflow, usePlatformRemediationSummary } from '../hooks/usePlatformRemediation'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'
import map2Logo from '../../assets/MAP2-LOGO.png'
import landingBg from '../../assets/NEW-map2-landing-bg.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import './HomePage.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

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

interface WorkplaceObject {
  route: string
  label: string
  summary: string
  Icon: ComponentType<{ size?: number }>
}

interface WallpaperContextMenuState {
  x: number
  y: number
}

type StatusTagTone = 'green' | 'red' | 'warm-gray' | 'cool-gray'

const WORKPLACE_OBJECTS: WorkplaceObject[] = [
  {
    route: '/platforms/overview',
    label: 'System Setup',
    summary: 'Supervise nodes, remediation pressure, and platform posture.',
    Icon: MapOs2DrivesIcon,
  },
  {
    route: '/artifacts',
    label: 'Audio Artifacts',
    summary: 'Browse plugins, captures, presets, and native processors.',
    Icon: MapArtifactsLibraryIcon,
  },
  {
    route: '/platforms/workspace-catalog',
    label: 'Program Catalog',
    summary: 'Add routed workspaces to the desktop menu tile directory.',
    Icon: MapOs2FileManagerIcon,
  },
  {
    route: '/platforms/theme',
    label: 'Display Settings',
    summary: 'Adjust Carbon theme tokens and wallpaper behavior for this browser.',
    Icon: MapOs2HomeIcon,
  },
]

function statusTagTone(state: string | undefined): StatusTagTone {
  if (state === 'ok') {
    return 'green'
  }

  if (state === 'warn' || state === 'warning' || state === 'critical' || state === 'offline') {
    return 'red'
  }

  if (!state || state === 'unknown') {
    return 'cool-gray'
  }

  return 'warm-gray'
}

export function HomePage() {
  const navigate = useNavigate()
  const { localNode } = useNodePageContext(NODE_PAGE_KEYS.home)
  const topology = useNodeTopology()
  const remediationSummary = usePlatformRemediationSummary()
  const [activeRemediation, setActiveRemediation] = useState<{
    mode: RemediationWorkflow
    state: string | null
    nodeIds: string[]
  } | null>(null)
  const [showBootSplash, setShowBootSplash] = useState(() => shouldShowHomeBootSplash())
  const [contextMenu, setContextMenu] = useState<WallpaperContextMenuState | null>(null)
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'
  const platformStatus = useHomePlatformStatus()
  const nodes = topology.data?.nodes
  const desktopStatusTags = [
    { label: platformStatus.avb.label, tone: statusTagTone(platformStatus.avb.state) },
    { label: platformStatus.avdecc.label, tone: statusTagTone(platformStatus.avdecc.state) },
    { label: platformStatus.nodes.label, tone: statusTagTone(platformStatus.nodes.state) },
  ]
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
      x: event.clientX,
      y: event.clientY,
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
          <div className="hp2-boot__mark-wrap">
            <img src={map2Logo} alt="MAP2 logo" className="hp2-boot__mark" />
          </div>
          <h1 className="hp2-boot__title">{MAP2_PLATFORM_NAME}</h1>
          <p className="hp2-boot__subtitle">Initializing the Carbon-governed pre-Warp desktop session and restoring platform context.</p>
        </div>
        <div className="hp2-boot__progress">
          <ProgressBar
            label="Boot progress"
            helperText="Restoring workplace shell"
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
        <div className="hp2-desktop__underlay" aria-hidden="true" />
        <div className="hp2-desktop__status">
          <header className="hp2-shellbar" aria-label="Workplace shell header">
            <div className="hp2-shellbar__hero">
              <div className="hp2-shellbar__hero-plate">
                <img src={map2Logo} alt="MAP2 logo" className="hp2-shellbar__hero-mark" />
              </div>
            </div>
          </header>
          <div className="hp2-desktop__workspace">
            <main className="hp2-desktop__panels">
              <Tile className="hp2-window hp2-window--workplace">
                <div className="hp2-window__titlebar">
                  <div className="hp2-window__titlegroup">
                    <span className="hp2-window__title-indicator" aria-hidden="true" />
                    <strong>Program Manager</strong>
                  </div>
                  <span className="hp2-window__titlemeta">{hostname}</span>
                </div>
                <div className="hp2-window__body">
                  <div className="hp2-workplace__hero">
                    <div className="hp2-workplace__copy">
                      <p className="hp2-window__eyebrow">Industrial Audio Workstation</p>
                      <h2>MAP2 desktop session</h2>
                      <p>
                        The landing route now reads like a serious OS/2 control desktop: icon-first entry,
                        flat Carbon chrome, and workstation-grade routing into supervisory, library, and display workflows.
                      </p>
                    </div>
                    <div className="hp2-workplace__tags" aria-label="Platform heartbeat">
                      {desktopStatusTags.map((status) => (
                        <Tag key={status.label} type={status.tone} size="sm">
                          {status.label}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  <div className="hp2-workplace__section">
                    <div className="hp2-workplace__section-header">
                      <p className="hp2-window__eyebrow">Program Objects</p>
                      <span>Operator shortcuts</span>
                    </div>
                    <div className="hp2-workplace__object-grid">
                      {WORKPLACE_OBJECTS.map((item) => (
                        <button
                          key={item.route}
                          type="button"
                          className="hp2-object-button"
                          onClick={() => navigate(item.route)}
                        >
                          <span className="hp2-object-button__icon" aria-hidden="true">
                            <item.Icon size={22} />
                          </span>
                          <span className="hp2-object-button__copy">
                            <strong>{item.label}</strong>
                            <span>{item.summary}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Tile>
              <div className="hp2-desktop__panel-row hp2-desktop__panel-row--single">
                <Tile className="hp2-window hp2-window--status">
                  <div className="hp2-window__titlebar">
                    <div className="hp2-window__titlegroup">
                      <span className="hp2-window__title-indicator" aria-hidden="true" />
                      <strong>System Setup</strong>
                    </div>
                    <span className="hp2-window__titlemeta">Nodes and remediation</span>
                  </div>
                  <div className="hp2-window__body hp2-window__body--compact">
                    <div
                      className="hp2-desktop__platform-card"
                      role="button"
                      aria-label="Open Platforms overview"
                      tabIndex={0}
                      onClick={() => navigate('/platforms/overview')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigate('/platforms/overview')
                        }
                      }}
                    >
                      <div className="hp2-desktop__platform-meta">
                        <MapOs2DrivesIcon size={20} aria-hidden />
                        <strong>Platforms</strong>
                      </div>
                      <p>{syncWorkflowAvailable ? platformsStatusLabel : 'Sync unavailable'}</p>
                      <div className="hp2-desktop__platform-summary">
                        <span>{hostname}</span>
                        <span>{MAP2_PLATFORM_VERSION}</span>
                      </div>
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
                    {(totalRemediationCount > 0 || !syncWorkflowAvailable) ? (
                      <div className="hp2-desktop__watermarks" aria-label="Desktop watermarks">
                        <button
                          type="button"
                          className="hp2-desktop__watermark hp2-desktop__watermark--remediation"
                          data-testid="home-desktop-remediation-watermark"
                          onClick={handleOpenRemediationWatermark}
                        >
                          <span className="hp2-desktop__watermark-eyebrow">Platform remediation</span>
                          <strong>{totalRemediationCount > 0 ? `${totalRemediationCount} items need attention` : 'Sync unavailable'}</strong>
                          <span>Open the remediation workflow from the desktop shell.</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </Tile>
              </div>
            </main>
          </div>
          <footer className="hp2-footer">
            <span className="hp2-footer__cell">{MAP2_PLATFORM_VERSION}</span>
            <span className="hp2-footer__cell">{hostname}</span>
            <span className="hp2-footer__cell">{platformStatus.avb.label}</span>
            <span className="hp2-footer__cell">{platformStatus.avdecc.label}</span>
            <span className="hp2-footer__cell">{platformStatus.nodes.label}</span>
          </footer>
        </div>
        {contextMenu ? (
          <div
            className="hp2-desktop__context-menu"
            role="menu"
            aria-label="Desktop context menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button type="button" className="hp2-desktop__context-item" onClick={handleRefreshDesktop}>
              Refresh
            </button>
            <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/theme')}>
              Display settings
            </button>
            <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/about')}>
              About
            </button>
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
