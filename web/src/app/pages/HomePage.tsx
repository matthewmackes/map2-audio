import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from '@carbon/icons-react'
import { ClickableTile, Tag } from '@carbon/react'
import {
  MAP2_PLATFORM_VERSION,
} from '../components/branding/map2Branding'
import { MapClusterFabricIcon } from '../components/icons/map/MapAppIcons'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useNodeTopology } from '../hooks/useNodeTopology'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { type RemediationWorkflow, usePlatformRemediationSummary } from '../hooks/usePlatformRemediation'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  prioritizeRequiredHomeLauncher,
  REQUIRED_HOME_LAUNCHER_ROUTE,
} from '../data/launcherCatalog'
import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'
import landingBg from '../../assets/map2-landing-bg.png'
import './HomePage.css'

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

// ── Landing launcher rendering helpers ──────────────────────────────────────

interface LandingLauncherTile {
  route: string
  size: 'small' | 'medium' | 'large'
  launcher: NonNullable<ReturnType<typeof getLauncherCatalogItem>>
}

function toLandingLaunchers(
  landingTiles: Array<{ route: string; size: 'small' | 'medium' | 'large' }>,
): LandingLauncherTile[] {
  const seen = new Set<string>()
  const mapped = landingTiles
    .map((tile) => {
      const launcher = getLauncherCatalogItem(tile.route)
      if (!launcher || !launcher.landingEligible || seen.has(tile.route)) {
        return null
      }
      seen.add(tile.route)
      return { ...tile, launcher }
    })
    .filter((tile): tile is LandingLauncherTile => Boolean(tile))

  const platformsIndex = mapped.findIndex((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)
  if (platformsIndex <= 0) {
    return mapped
  }

  const next = [...mapped]
  const [platformsTile] = next.splice(platformsIndex, 1)
  next.unshift(platformsTile)
  return next
}

function resolveLandingLaunchers(
  landingTiles: Array<{ route: string; size: 'small' | 'medium' | 'large' }>,
): LandingLauncherTile[] {
  const normalizedTiles = prioritizeRequiredHomeLauncher(ensureRequiredHomeLauncher(landingTiles))
  return toLandingLaunchers(normalizedTiles)
}

const LANDING_DIRECTORY_LABELS = {
  core: 'Core',
  labs: 'Labs',
  platforms: 'Platforms',
  'nav-only': 'Nav only',
} as const

// ── Component ───────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const { localNode } = useNodePageContext(NODE_PAGE_KEYS.home)
  const topology = useNodeTopology()
  const remediationSummary = usePlatformRemediationSummary()
  const { settings: specialSettings, isLoading: specialSettingsLoading } = useSpecialSettings()
  const [activeRemediation, setActiveRemediation] = useState<{
    mode: RemediationWorkflow
    state: string | null
    nodeIds: string[]
  } | null>(null)

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'
  const platformStatus = useHomePlatformStatus()
  const nodes = topology.data?.nodes
  const platformsStatusLabel = nodeStatusLabel(nodes)
  const remediationCounts = remediationSummary.data?.counts
  const syncWorkflowAvailable = remediationSummary.data?.workflows?.sync?.available !== false
  const landingTileLaunchers = useMemo(() => {
    return resolveLandingLaunchers(specialSettings?.landingTiles ?? [])
  }, [specialSettings?.landingTiles])

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

  return (
    <div className="hp2-root">
      <div className="hp2-shell">
        <div className="hp2-hero" role="img" aria-label="Mackes Audio Platform">
          <img src={landingBg} alt="" className="hp2-hero__img" aria-hidden="true" />
          <div className="hp2-hero__scrim" aria-hidden="true" />
        </div>
        {!specialSettingsLoading && landingTileLaunchers.length > 0 ? (
          <section className="hp2-launchers" aria-label="Landing launchers">
            <div className={`hp2-launchers__grid${landingTileLaunchers.length === 1 ? ' hp2-launchers__grid--single' : ''}`} role="list">
              {landingTileLaunchers.map((tile) => {
                const Icon = tile.route === REQUIRED_HOME_LAUNCHER_ROUTE ? MapClusterFabricIcon : tile.launcher.icon
                const tileTitle = tile.route === REQUIRED_HOME_LAUNCHER_ROUTE ? 'Platforms' : tile.launcher.label
                const tileDescription = tile.route === REQUIRED_HOME_LAUNCHER_ROUTE
                  ? (syncWorkflowAvailable ? platformsStatusLabel : 'Sync unavailable')
                  : tile.launcher.description

                return (
                  <ClickableTile
                    key={tile.route}
                    className={`hp2-launchers__tile hp2-launchers__tile--${tile.size}`}
                    onClick={() => navigate(tile.route)}
                    role="listitem"
                  >
                    <div className="hp2-launchers__tile-body">
                      <div className="hp2-launchers__tile-meta">
                        <Tag type="blue" size="sm">
                          {LANDING_DIRECTORY_LABELS[tile.launcher.directory]}
                        </Tag>
                        <Tag type="cool-gray" size="sm">
                          {tile.size}
                        </Tag>
                      </div>
                      <div className="hp2-launchers__tile-icon" aria-hidden>
                        <Icon size={tile.size === 'large' ? 28 : 22} />
                      </div>
                      <h3 className="hp2-launchers__tile-title">{tileTitle}</h3>
                      {tile.route === REQUIRED_HOME_LAUNCHER_ROUTE && (remediationPills.length > 0 || !syncWorkflowAvailable) ? (
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
                      <p className="hp2-launchers__tile-desc">{tileDescription}</p>
                    </div>
                    <ArrowRight size={18} className="hp2-card__arrow" />
                  </ClickableTile>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="hp2-footer">
          {MAP2_PLATFORM_VERSION} · {hostname} · {platformStatus.avb.label} · {platformStatus.avdecc.label} · {platformStatus.nodes.label}
        </footer>
      </div>
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
