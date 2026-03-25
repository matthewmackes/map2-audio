import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Package, Music as MusicNotes, Waveform } from '@carbon/icons-react'
import { FxDrums } from '../components/icons/effectIcons'
import { ClickableTile } from '@carbon/react'
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
import { useWebSocketConnection, useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import { chainsApi } from '../../map2/api'
import type { Chain, ChainPlugin } from '../../map2/types'
import { type RemediationWorkflow, usePlatformRemediationSummary } from '../hooks/usePlatformRemediation'
import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'
import './HomePage.css'

// ── Signal chain summary ────────────────────────────────────────────────────

function formatSignalChain(plugins: ChainPlugin[]): string {
  if (!plugins || plugins.length === 0) return 'No processors loaded'
  const active = plugins
    .filter((p) => !p.bypassed)
    .sort((a, b) => a.position - b.position)
  if (active.length === 0) return 'All processors bypassed'
  return active.map((p) => p.name).join(' → ')
}

function useActiveChainSummary() {
  const [chain, setChain] = useState<Chain | null>(null)
  useWebSocketConnection()

  useEffect(() => {
    let cancelled = false
    chainsApi.list().then((res) => {
      if (cancelled) return
      const active = res.chains?.find((c) => c.is_active) ?? res.chains?.[0]
      if (active) setChain(active)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useWebSocketTopic('chain_updates', () => {
    chainsApi.list().then((res) => {
      const active = res.chains?.find((c) => c.is_active) ?? res.chains?.[0]
      if (active) setChain(active)
    }).catch(() => {})
  })

  return chain ? formatSignalChain(chain.plugins) : null
}

// ── Node status for Platforms card ──────────────────────────────────────────

function useNodeStatusLabel(): string | null {
  const topology = useNodeTopology()
  const nodes = topology.data?.nodes
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
  icon: React.ComponentType<{ size?: number }>
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

const MIDDLE_CARDS: WorkspaceCard[] = [
  {
    id: 'midi-hub',
    to: '/midi-hub',
    icon: MusicNotes,
    title: 'MIDI Hub',
    description: 'Controllers, mappings, and routing',
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

// ── Component ───────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const { localNode } = useNodePageContext(NODE_PAGE_KEYS.home)
  const chainSummary = useActiveChainSummary()
  const nodeStatusLabel = useNodeStatusLabel()
  const remediationSummary = usePlatformRemediationSummary()
  const [activeRemediation, setActiveRemediation] = useState<{
    mode: RemediationWorkflow
    state: string | null
    nodeIds: string[]
  } | null>(null)

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'
  const remediationCounts = remediationSummary.data?.counts

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
  ].filter((pill) => pill.count > 0)

  return (
    <div className="hp2-root">
      <nav className="hp2-layout" aria-label="Workspaces">
        {/* ── Hero: Audio Grid ─────────────────────────────────── */}
        <ClickableTile
          className="hp2-card hp2-card--hero"
          onClick={() => navigate(HERO_CARD.to)}
        >
          <div className="hp2-card__body">
            <HERO_CARD.icon size={24} />
            <h2 className="hp2-card__title">{HERO_CARD.title}</h2>
            <p className="hp2-card__desc">{HERO_CARD.description}</p>
            {chainSummary ? (
              <p className="hp2-card__chain">{chainSummary}</p>
            ) : null}
          </div>
          <ArrowRight size={20} className="hp2-card__arrow" />
        </ClickableTile>

        {/* ── Middle tier ──────────────────────────────────────── */}
        <div className="hp2-middle">
          {MIDDLE_CARDS.map((card) => {
            const dynamicDesc =
              card.id === 'platforms' && nodeStatusLabel
                ? nodeStatusLabel
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
                  {card.id === 'platforms' && remediationPills.length > 0 ? (
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
        {MAP2_PLATFORM_VERSION} · {hostname}
      </footer>
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
