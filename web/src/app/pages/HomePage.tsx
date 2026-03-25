import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Package, Music as MusicNotes } from '@carbon/icons-react'
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
]

// ── Component ───────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const { localNode } = useNodePageContext(NODE_PAGE_KEYS.home)
  const chainSummary = useActiveChainSummary()
  const nodeStatusLabel = useNodeStatusLabel()

  const hostname = localNode?.hostname ?? window.location.hostname ?? 'localhost'

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
    </div>
  )
}

export default HomePage
