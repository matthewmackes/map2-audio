import { useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  Database,
  Keyboard,
  PlugsConnected,
  Stack,
  TerminalWindow,
  Waveform,
} from '@phosphor-icons/react'

import { useToasts } from '../components/Toasts'
import { type OpenApiCatalogEndpoint, useOpenApiSchema } from '../hooks/useOpenApiSchema'
import type { EnvironmentVariableSet, ObservatoryTabId, RequestDraft } from './ApiObservatory/types'
import { CatalogTab } from './ApiObservatory/CatalogTab'
import { ClusterTopologyPanel } from './ApiObservatory/ClusterTopologyPanel'
import { RequestBuilderTab } from './ApiObservatory/RequestBuilderTab'
import { WebSocketInspectorTab } from './ApiObservatory/WebSocketInspectorTab'
import { TrafficMonitorTab } from './ApiObservatory/TrafficMonitorTab'
import { CollectionsTab } from './ApiObservatory/CollectionsTab'
import './ApiObservatoryPage.css'

const OBSERVATORY_TABS: Array<{
  id: ObservatoryTabId
  label: string
  icon: typeof TerminalWindow
  description: string
}> = [
  {
    id: 'catalog',
    label: 'API Catalog',
    icon: Database,
    description: 'OpenAPI-driven endpoint explorer with hand-authored context and schema diffs.',
  },
  {
    id: 'builder',
    label: 'Request Builder',
    icon: TerminalWindow,
    description: 'Send REST requests through a cluster-aware proxy with scripts, tests, and history.',
  },
  {
    id: 'websocket',
    label: 'WebSocket Inspector',
    icon: PlugsConnected,
    description: 'Open multiple WS connections, inspect messages, record/replay, and diff payloads.',
  },
  {
    id: 'traffic',
    label: 'Traffic Monitor',
    icon: Waveform,
    description: 'Watch real-time request waterfall, statistics, and session recordings.',
  },
  {
    id: 'collections',
    label: 'Collections',
    icon: Stack,
    description: 'Manage workspaces, environments, saved requests, and collection automation.',
  },
]

const SHORTCUTS: Array<{ keys: string; description: string; tab?: ObservatoryTabId }> = [
  { keys: 'Ctrl+Enter', description: 'Send request in Request Builder', tab: 'builder' },
  { keys: 'Ctrl+N', description: 'New request tab in Request Builder', tab: 'builder' },
  { keys: 'Ctrl+W', description: 'Close active request tab in Request Builder', tab: 'builder' },
  { keys: 'Ctrl+S', description: 'Save workspace snapshot (Downloads JSON backup)', tab: 'collections' },
  { keys: 'Ctrl+E', description: 'Focus environment selector' },
  { keys: 'Ctrl+L', description: 'Focus URL bar in Request Builder', tab: 'builder' },
  { keys: 'Ctrl+/', description: 'Focus catalog search', tab: 'catalog' },
  { keys: 'Ctrl+Shift+R', description: 'Run collection tests', tab: 'collections' },
  { keys: '?', description: 'Open keyboard shortcuts' },
  { keys: 'Esc', description: 'Close modal/panel' },
]

function buildDefaultEnvironments(baseUrlHint: string): EnvironmentVariableSet[] {
  return [
    {
      id: 'env-local',
      name: 'Local',
      values: {
        base_url: baseUrlHint,
        token: '',
        node_id: 'local-node',
      },
    },
    {
      id: 'env-cluster',
      name: 'Cluster Node',
      values: {
        base_url: 'http://localhost:8080',
        token: '',
        node_id: 'all',
      },
    },
  ]
}

export function ApiObservatoryPage() {
  const [activeTab, setActiveTab] = useState<ObservatoryTabId>('catalog')
  const [selectedNode, setSelectedNode] = useState('local-node')
  const [showTopologyCollapsed, setShowTopologyCollapsed] = useState(false)
  const [showShortcutModal, setShowShortcutModal] = useState(false)
  const [showDiffHighlights, setShowDiffHighlights] = useState(false)
  const [tryItEndpoint, setTryItEndpoint] = useState<OpenApiCatalogEndpoint | null>(null)
  const [environmentSets, setEnvironmentSets] = useState<EnvironmentVariableSet[]>(
    buildDefaultEnvironments(''),
  )
  const [activeEnvironmentId, setActiveEnvironmentId] = useState('env-local')

  const { pushToast } = useToasts()
  const { schema, catalog, loading, error, lastUpdated, diff, refresh } = useOpenApiSchema()

  const pathCount = useMemo(
    () => (schema && typeof schema.paths === 'object' && schema.paths !== null ? Object.keys(schema.paths as Record<string, unknown>).length : 0),
    [schema],
  )
  const operationCount = useMemo(
    () => catalog.reduce((sum, group) => sum + group.endpoints.length, 0),
    [catalog],
  )
  const diffCount = diff.added.length + diff.modified.length + diff.removed.length

  useEffect(() => {
    if (!lastUpdated || diffCount === 0) {
      return
    }
    pushToast(`Schema changed: ${diffCount} path updates detected`, 'info', {
      id: 'api-observatory-schema-change',
      action: {
        label: 'View',
        onClick: () => {
          setActiveTab('catalog')
          setShowDiffHighlights(true)
        },
      },
    })
  }, [diffCount, lastUpdated, pushToast])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '?') {
        const target = event.target as HTMLElement | null
        const isTyping = target && ['INPUT', 'TEXTAREA'].includes(target.tagName)
        if (!isTyping) {
          event.preventDefault()
          setShowShortcutModal(true)
        }
      }

      if (event.key === 'Escape') {
        setShowShortcutModal(false)
      }

      if (!event.ctrlKey) {
        return
      }

      const lowerKey = event.key.toLowerCase()

      if (lowerKey === 'e') {
        event.preventDefault()
        const envSelect = document.querySelector('[data-api-observatory="environment-select"]') as HTMLSelectElement | null
        envSelect?.focus()
      } else if (lowerKey === '/') {
        event.preventDefault()
        const search = document.querySelector('[data-api-observatory="catalog-search"]') as HTMLInputElement | null
        search?.focus()
      } else if (lowerKey === 's' && activeTab === 'collections') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('api-observatory:download-backup'))
      } else if (lowerKey === 'r' && event.shiftKey && activeTab === 'collections') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('api-observatory:run-collections'))
      } else if (lowerKey === 'n' && activeTab === 'builder') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('api-observatory:new-request'))
      } else if (lowerKey === 'w' && activeTab === 'builder') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('api-observatory:close-request'))
      } else if (lowerKey === 'l' && activeTab === 'builder') {
        event.preventDefault()
        const urlInput = document.querySelector('[data-api-observatory="builder-url"]') as HTMLInputElement | null
        urlInput?.focus()
      } else if (lowerKey === 'enter' && activeTab === 'builder') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('api-observatory:send-request'))
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTab])

  const currentTab = OBSERVATORY_TABS.find((tab) => tab.id === activeTab) ?? OBSERVATORY_TABS[0]

  const openDraftFromCollection = (draft: RequestDraft) => {
    setTryItEndpoint(null)
    window.dispatchEvent(new CustomEvent('api-observatory:open-draft', { detail: draft }))
    setActiveTab('builder')
  }

  return (
    <div className="api-observatory-page">
      <header className="api-observatory-page__header">
        <div className="api-observatory-page__heading">
          <span className="api-observatory-page__badge">
            <TerminalWindow size={14} weight="duotone" /> API Observatory
          </span>
          <h1>API Observatory</h1>
          <p>
            Cluster-aware API workbench for OpenAPI discovery, request execution, websocket debugging,
            traffic monitoring, and automated collections.
          </p>
        </div>

        <div className="api-observatory-page__metrics" aria-label="Observatory metrics">
          <div>
            <span>Paths</span>
            <strong>{pathCount}</strong>
          </div>
          <div>
            <span>Operations</span>
            <strong>{operationCount}</strong>
          </div>
          <div>
            <span>Domains</span>
            <strong>{catalog.length}</strong>
          </div>
          <div>
            <span>Last Sync</span>
            <strong>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'pending'}</strong>
          </div>
        </div>
      </header>

      <div className="api-observatory-page__toolbar">
        <nav className="api-observatory-page__tabs" aria-label="API Observatory tabs">
          {OBSERVATORY_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                className={`api-observatory-page__tab${tab.id === activeTab ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} weight="duotone" />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="api-observatory-page__toolbar-actions">
          <select
            data-api-observatory="environment-select"
            value={activeEnvironmentId}
            onChange={(event) => setActiveEnvironmentId(event.target.value)}
          >
            {environmentSets.map((environment) => (
              <option key={environment.id} value={environment.id}>{environment.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              void refresh()
              pushToast('Refreshing OpenAPI schema', 'info')
            }}
          >
            <ArrowsClockwise size={15} /> Refresh schema
          </button>

          <button type="button" onClick={() => setShowShortcutModal(true)}>
            <Keyboard size={15} /> Shortcuts
          </button>
        </div>
      </div>

      <p className="api-observatory-page__tab-description">{currentTab.description}</p>

      {error && <div className="api-observatory-error">Failed to fetch OpenAPI schema: {error}</div>}

      {diffCount > 0 && (
        <div className="api-observatory-page__diff-banner" role="status">
          <span>Schema diff: +{diff.added.length} / ~{diff.modified.length} / -{diff.removed.length}</span>
          <button
            type="button"
            onClick={() => {
              setActiveTab('catalog')
              setShowDiffHighlights(true)
            }}
          >
            View changes
          </button>
        </div>
      )}

      <div className="api-observatory-page__content">
        <ClusterTopologyPanel
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          collapsed={showTopologyCollapsed}
          onToggleCollapsed={() => setShowTopologyCollapsed((prev) => !prev)}
        />

        <main className="api-observatory-page__main">
          {activeTab === 'catalog' && (
            <CatalogTab
              catalog={catalog}
              showDiffHighlights={showDiffHighlights}
              onTryIt={(endpoint) => {
                setTryItEndpoint(endpoint)
                setActiveTab('builder')
              }}
            />
          )}

          {activeTab === 'builder' && (
            <RequestBuilderTab
              environments={environmentSets}
              activeEnvironmentId={activeEnvironmentId}
              onEnvironmentChange={setActiveEnvironmentId}
              selectedNode={selectedNode}
              onNodeTargetChange={setSelectedNode}
              tryItEndpoint={tryItEndpoint}
            />
          )}

          {activeTab === 'websocket' && <WebSocketInspectorTab />}
          {activeTab === 'traffic' && <TrafficMonitorTab />}
          {activeTab === 'collections' && <CollectionsTab onOpenRequest={openDraftFromCollection} />}
        </main>
      </div>

      {loading && <div className="api-observatory-page__loading">Loading OpenAPI catalog…</div>}

      {showShortcutModal && (
        <div className="api-observatory-modal-backdrop" role="dialog" aria-modal="true">
          <div className="api-observatory-modal">
            <header>
              <h2>Keyboard Shortcuts</h2>
              <button type="button" onClick={() => setShowShortcutModal(false)}>Close</button>
            </header>
            <ul>
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.keys}>
                  <code>{shortcut.keys}</code>
                  <span>{shortcut.description}{shortcut.tab ? ` (${shortcut.tab})` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default ApiObservatoryPage
