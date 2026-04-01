import { type ComponentType, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BareMetalServer, Package, Waveform } from '@carbon/icons-react'
import { Beaker } from 'lucide-react'
import { FxDrums } from '../components/icons/effectIcons'
import { ClickableTile, Tag } from '@carbon/react'
import {
  MAP2_PLATFORM_VERSION,
} from '../components/branding/map2Branding'
import {
  MapAudioGridIcon,
  MapClusterFabricIcon,
} from '../components/icons/map/MapAppIcons'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useNodeTopology } from '../hooks/useNodeTopology'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { type RemediationWorkflow, usePlatformRemediationSummary } from '../hooks/usePlatformRemediation'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { getLauncherCatalogItem } from '../data/launcherCatalog'
import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'
import type { NodeSummary, NodeTopology } from '../types/node'
import landingBg from '../../assets/map2-landing-bg.png'
import './HomePage.css'

// ── Audio flow summary ──────────────────────────────────────────────────────

interface AudioFlowPath {
  id: string
  nodes: NodeSummary[]
}

function getFriendlyNodeName(node: NodeSummary): string {
  return node.display_label?.trim() || node.hostname
}

function buildAudioFlowPaths(topology: NodeTopology | undefined): AudioFlowPath[] {
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const activeEdges = Array.isArray(topology?.audio_edges)
    ? topology.audio_edges.filter((edge) => edge.active)
    : []

  if (nodes.length === 0 || activeEdges.length === 0) {
    return []
  }

  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]))
  const adjacency = new Map<string, string[]>()
  const incomingCounts = new Map<string, number>()

  activeEdges.forEach((edge) => {
    if (!nodeMap.has(edge.source_node_id) || !nodeMap.has(edge.dest_node_id)) {
      return
    }
    const next = adjacency.get(edge.source_node_id) ?? []
    if (!next.includes(edge.dest_node_id)) {
      next.push(edge.dest_node_id)
      adjacency.set(edge.source_node_id, next)
      incomingCounts.set(edge.dest_node_id, (incomingCounts.get(edge.dest_node_id) ?? 0) + 1)
    }
  })

  if (adjacency.size === 0) {
    return []
  }

  const startIds = Array.from(adjacency.keys()).filter((nodeId) => (incomingCounts.get(nodeId) ?? 0) === 0)
  const orderedStarts = (startIds.length > 0 ? startIds : [activeEdges[0].source_node_id]).sort((left, right) => {
    const leftName = getFriendlyNodeName(nodeMap.get(left) as NodeSummary)
    const rightName = getFriendlyNodeName(nodeMap.get(right) as NodeSummary)
    return leftName.localeCompare(rightName)
  })
  const collected = new Set<string>()
  const paths: AudioFlowPath[] = []

  function visit(nodeId: string, trail: string[]) {
    if (trail.includes(nodeId)) {
      const cyclePath = [...trail, nodeId]
      const key = cyclePath.join('>')
      if (!collected.has(key)) {
        collected.add(key)
        paths.push({
          id: key,
          nodes: cyclePath
            .map((id) => nodeMap.get(id))
            .filter((node): node is NodeSummary => Boolean(node)),
        })
      }
      return
    }

    const nextTrail = [...trail, nodeId]
    const nextIds = [...(adjacency.get(nodeId) ?? [])].sort((left, right) => {
      const leftName = getFriendlyNodeName(nodeMap.get(left) as NodeSummary)
      const rightName = getFriendlyNodeName(nodeMap.get(right) as NodeSummary)
      return leftName.localeCompare(rightName)
    })
    if (nextIds.length === 0) {
      const key = nextTrail.join('>')
      if (!collected.has(key)) {
        collected.add(key)
        paths.push({
          id: key,
          nodes: nextTrail
            .map((id) => nodeMap.get(id))
            .filter((node): node is NodeSummary => Boolean(node)),
        })
      }
      return
    }

    nextIds.forEach((nextId) => visit(nextId, nextTrail))
  }

  orderedStarts.forEach((startId) => visit(startId, []))

  return paths.filter((path) => path.nodes.length > 0)
}

// ── Node status for Platforms card ──────────────────────────────────────────

function useNodeStatusLabel(topology: NodeTopology | undefined): string | null {
  const nodes = topology?.nodes
  if (!nodes || !Array.isArray(nodes)) return null

  const total = nodes.length
  const unhealthy = nodes.filter(
    (n) => n.status === 'warn' || n.status === 'critical' || n.status === 'offline',
  ).length

  if (unhealthy > 0) return `${unhealthy} of ${total} nodes need attention`
  return `${total} node${total !== 1 ? 's' : ''} online`
}

// ── Card definitions ────────────────────────────────────────────────────────

interface WorkspaceCard {
  id: string
  to: string
  icon: ComponentType<{ size?: number }>
  title: string
  description: string
}

const HERO_CARD: WorkspaceCard = {
  id: 'audio-grid',
  to: '/juce-grid',
  icon: MapAudioGridIcon,
  title: 'Audio Grid',
  description: 'Signal flow, routing, and snapshots',
}

const RIGHT_COLUMN_CARDS: WorkspaceCard[] = [
  {
    id: 'labs',
    to: '/labs',
    icon: Beaker,
    title: 'Labs',
    description: 'Experimental routes and advanced workspaces',
  },
  {
    id: 'artifacts',
    to: '/artifacts',
    icon: Package,
    title: 'Audio Artifacts',
    description: 'Plugins, models, and impulse responses',
  },
  {
    id: 'platforms',
    to: '/platforms/overview',
    icon: MapClusterFabricIcon,
    title: 'Platforms',
    description: 'System setup and node status',
  },
]

const LEFT_COLUMN_CARDS: WorkspaceCard[] = [
  {
    id: 'drums',
    to: '/drums',
    icon: ({ size = 20 }: { size?: number }) => <FxDrums width={size} height={size} />,
    title: 'Drum Machine',
    description: 'Patterns, kits, and sequencing',
  },
  {
    id: 'synth-forge',
    to: '/synth-forge',
    icon: Waveform,
    title: 'SynthForge',
    description: 'Sampler, soundfonts, and synthesis',
  },
]

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
  const nodeStatusLabel = useNodeStatusLabel(topology.data)
  const remediationSummary = usePlatformRemediationSummary()
  const { settings: specialSettings, isLoading: specialSettingsLoading } = useSpecialSettings()
  const [activeRemediation, setActiveRemediation] = useState<{
    mode: RemediationWorkflow
    state: string | null
    nodeIds: string[]
  } | null>(null)

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'
  const platformStatus = useHomePlatformStatus()
  const remediationCounts = remediationSummary.data?.counts
  const syncWorkflowAvailable = remediationSummary.data?.workflows?.sync?.available !== false
  const audioFlowPaths = useMemo(() => buildAudioFlowPaths(topology.data), [topology.data])
  const landingTileLaunchers = useMemo(() => {
    return (specialSettings?.landingTiles ?? [])
      .map((tile) => {
        const launcher = getLauncherCatalogItem(tile.route)
        if (!launcher || !launcher.landingEligible) {
          return null
        }

        return { ...tile, launcher }
      })
      .filter((tile): tile is NonNullable<typeof tile> => Boolean(tile))
  }, [specialSettings?.landingTiles])
  const showLandingBoard = landingTileLaunchers.length > 0 || !specialSettingsLoading

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
        {showLandingBoard ? (
          <section className="hp2-launchers" aria-label="Promoted launchers">
            <div className="hp2-launchers__header">
              <div>
                <p className="hp2-launchers__eyebrow">Landing Page</p>
                <h2 className="hp2-launchers__title">Promoted launchers</h2>
              </div>
              <p className="hp2-launchers__summary">
                Shared launcher placements now live in Theme and render here as Windows-style tiles above the existing home surface.
              </p>
            </div>

            {landingTileLaunchers.length > 0 ? (
              <div className="hp2-launchers__grid" role="list">
                {landingTileLaunchers.map((tile) => {
                  const Icon = tile.launcher.icon

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
                        <h3 className="hp2-launchers__tile-title">{tile.launcher.label}</h3>
                        <p className="hp2-launchers__tile-desc">{tile.launcher.description}</p>
                      </div>
                      <ArrowRight size={18} className="hp2-card__arrow" />
                    </ClickableTile>
                  )
                })}
              </div>
            ) : (
              <div className="hp2-launchers__empty">
                <div>
                  <p className="hp2-launchers__eyebrow">No Tiles Yet</p>
                  <h3 className="hp2-launchers__empty-title">Landing-page launchers are not configured.</h3>
                  <p className="hp2-launchers__empty-copy">
                    Open the Theme launcher organizer to add tiles, choose sizes, and order them.
                  </p>
                </div>
                <button
                  type="button"
                  className="hp2-launchers__empty-button"
                  onClick={() => navigate('/platforms/theme?themeModal=launchers')}
                >
                  Open launcher organizer in Theme
                </button>
              </div>
            )}
          </section>
        ) : null}
        <nav className="hp2-layout" aria-label="Workspaces">
          <div className="hp2-column hp2-column--left">
            <ClickableTile
              className="hp2-card hp2-card--hero"
              onClick={() => navigate(HERO_CARD.to)}
            >
              <div className="hp2-card__body">
                <HERO_CARD.icon size={24} />
                <h2 className="hp2-card__title">{HERO_CARD.title}</h2>
                <p className="hp2-card__desc">{HERO_CARD.description}</p>
                <div className="hp2-card__flow" aria-label="Audio Grid signal flow">
                  {audioFlowPaths.length > 0 ? (
                    audioFlowPaths.map((path) => (
                      <div key={path.id} className="hp2-card__flow-row">
                        {path.nodes.map((node, index) => (
                          <div key={`${path.id}-${node.node_id}-${index}`} className="hp2-card__flow-segment">
                            <span className="hp2-card__flow-node">
                              <BareMetalServer size={14} aria-hidden />
                              <span>{getFriendlyNodeName(node)}</span>
                            </span>
                            {index < path.nodes.length - 1 ? <ArrowRight size={14} aria-hidden className="hp2-card__flow-arrow" /> : null}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="hp2-card__flow-empty">No Active Flow</p>
                  )}
                </div>
              </div>
              <ArrowRight size={20} className="hp2-card__arrow" />
            </ClickableTile>

            <div className="hp2-subgrid" aria-label="Performance workspaces">
              {LEFT_COLUMN_CARDS.map((card) => (
                <ClickableTile
                  key={card.id}
                  className="hp2-card hp2-card--subgrid"
                  onClick={() => navigate(card.to)}
                >
                  <div className="hp2-card__body">
                    <card.icon size={20} />
                    <h2 className="hp2-card__title">{card.title}</h2>
                    <p className="hp2-card__desc">{card.description}</p>
                  </div>
                  <ArrowRight size={16} className="hp2-card__arrow" />
                </ClickableTile>
              ))}
            </div>
          </div>
          <div className="hp2-column hp2-column--right">
            {RIGHT_COLUMN_CARDS.map((card) => {
              const dynamicDesc =
                card.id === 'platforms' && nodeStatusLabel
                  ? (syncWorkflowAvailable ? nodeStatusLabel : 'Sync unavailable')
                  : card.description

              return (
                <ClickableTile
                  key={card.id}
                  className="hp2-card hp2-card--middle"
                  onClick={() => navigate(card.to)}
                >
                  <div className="hp2-card__body">
                    <card.icon size={20} />
                    <h2 className="hp2-card__title">{card.title}</h2>
                    {card.id === 'platforms' && (remediationPills.length > 0 || !syncWorkflowAvailable) ? (
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
                    <p className="hp2-card__desc">{dynamicDesc}</p>
                  </div>
                  <ArrowRight size={16} className="hp2-card__arrow" />
                </ClickableTile>
              )
            })}
          </div>
        </nav>

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
