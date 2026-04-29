import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import type { OpenApiCatalogEndpoint } from '../../hooks/useOpenApiSchema'
import { clearPersisted, readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'
import type { EnvironmentVariableSet, RequestDraft } from '../ApiObservatory/types'
import { EventFeedTab } from './EventFeedTab'
import { WebSshTab } from './WebSshTab'
import '../ApiObservatory/ApiObservatory.css'
import './ApiWebhooksPage.css'

// Observatory tabs are code-split because they pull in the OpenAPI catalog hook
// (which evaluates `import.meta.env` at module-load) and a ~3kLoC primitives bundle.
const CatalogTab = lazy(() => import('../ApiObservatory/CatalogTab').then((m) => ({ default: m.CatalogTab })))
const ClusterTopologyPanel = lazy(() => import('../ApiObservatory/ClusterTopologyPanel').then((m) => ({ default: m.ClusterTopologyPanel })))
const CollectionsTab = lazy(() => import('../ApiObservatory/CollectionsTab').then((m) => ({ default: m.CollectionsTab })))
const RequestBuilderTab = lazy(() => import('../ApiObservatory/RequestBuilderTab').then((m) => ({ default: m.RequestBuilderTab })))
const TrafficMonitorTab = lazy(() => import('../ApiObservatory/TrafficMonitorTab').then((m) => ({ default: m.TrafficMonitorTab })))
const WebSocketInspectorTab = lazy(() => import('../ApiObservatory/WebSocketInspectorTab').then((m) => ({ default: m.WebSocketInspectorTab })))

// Concern-grouped order: observation/inspection first, then action/builder.
export const MIDPOINT_TAB_IDS = [
  'catalog',
  'traffic',
  'event-feed',
  'websocket',
  'web-ssh',
  'builder',
  'collections',
] as const

export type MidpointTabId = (typeof MIDPOINT_TAB_IDS)[number]

const OBSERVATORY_TAB_IDS = new Set<MidpointTabId>([
  'catalog',
  'traffic',
  'websocket',
  'builder',
  'collections',
])

function isMidpointTabId(value: string | null | undefined): value is MidpointTabId {
  return typeof value === 'string' && (MIDPOINT_TAB_IDS as readonly string[]).includes(value)
}

const ACTIVE_TAB_KEY: PersistedKey<MidpointTabId> = {
  storageKey: 'map2_midpoint_active_tab',
  fallback: 'event-feed',
  parse: (raw) => (isMidpointTabId(raw) ? raw : undefined),
}
const LEGACY_ACTIVE_TAB_KEY: PersistedKey<MidpointTabId> = {
  storageKey: 'map2_api_webhooks_active_tab',
  fallback: 'event-feed',
  parse: (raw) => (isMidpointTabId(raw) ? raw : undefined),
}

function readStoredTab(): MidpointTabId {
  const current = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_TAB_KEY.storageKey) : null
  if (isMidpointTabId(current)) return current
  return readPersisted(LEGACY_ACTIVE_TAB_KEY)
}

function buildDefaultEnvironments(): EnvironmentVariableSet[] {
  return [
    {
      id: 'env-local',
      name: 'Local',
      values: { base_url: '', token: '', node_id: 'local-node' },
    },
    {
      id: 'env-cluster',
      name: 'Cluster Node',
      values: { base_url: 'http://localhost:8080', token: '', node_id: 'all' },
    },
  ]
}

export function ApiWebhooksPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // URL is the single source of truth. localStorage backs up the choice for next mount.
  const activeTab = useMemo<MidpointTabId>(() => {
    const params = new URLSearchParams(location.search)
    const fromUrl = params.get('tab')
    if (isMidpointTabId(fromUrl)) return fromUrl
    return readStoredTab()
  }, [location.search])

  // Observatory shared state (only consumed by 5 Observatory tabs).
  const [selectedNode, setSelectedNode] = useState<string>('local-node')
  const [topologyCollapsed, setTopologyCollapsed] = useState(false)
  const [tryItEndpoint, setTryItEndpoint] = useState<OpenApiCatalogEndpoint | null>(null)
  const [environments] = useState<EnvironmentVariableSet[]>(buildDefaultEnvironments())
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string>('env-local')

  // Persist the URL-derived tab to localStorage and migrate the legacy key once.
  useEffect(() => {
    writePersisted(ACTIVE_TAB_KEY, activeTab)
    clearPersisted(LEGACY_ACTIVE_TAB_KEY)
  }, [activeTab])

  // If the URL has no ?tab= but localStorage knows the last choice, surface it in the URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tab') === activeTab) return
    params.set('tab', activeTab)
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const setActiveTab = useCallback(
    (next: MidpointTabId) => {
      const params = new URLSearchParams(location.search)
      if (params.get('tab') === next) return
      params.set('tab', next)
      navigate(
        { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
        { replace: false },
      )
    },
    [location.hash, location.pathname, location.search, navigate],
  )

  const handleChange = useCallback(
    ({ selectedIndex }: { selectedIndex: number }) => {
      const next = MIDPOINT_TAB_IDS[selectedIndex]
      if (next) setActiveTab(next)
    },
    [setActiveTab],
  )

  const handleOpenDraft = useCallback(
    (draft: RequestDraft) => {
      setTryItEndpoint(null)
      window.dispatchEvent(new CustomEvent('api-observatory:open-draft', { detail: draft }))
      setActiveTab('builder')
    },
    [setActiveTab],
  )

  const handleTryIt = useCallback(
    (endpoint: OpenApiCatalogEndpoint) => {
      setTryItEndpoint(endpoint)
      setActiveTab('builder')
    },
    [setActiveTab],
  )

  const selectedIndex = MIDPOINT_TAB_IDS.indexOf(activeTab)
  const showTopology = OBSERVATORY_TAB_IDS.has(activeTab)

  return (
    <section className="api-webhooks-page midpoint-shell" id="api-webhooks-page">
      <Tabs selectedIndex={selectedIndex >= 0 ? selectedIndex : 0} onChange={handleChange}>
        <TabList aria-label="Midpoint tabs" contained>
          <Tab>API Catalog</Tab>
          <Tab>Traffic Monitor</Tab>
          <Tab>Event Feed</Tab>
          <Tab>WebSocket Inspector</Tab>
          <Tab>Web SSH</Tab>
          <Tab>Request Builder</Tab>
          <Tab>Collections</Tab>
        </TabList>

        <div className={`midpoint-shell__layout${showTopology ? ' midpoint-shell__layout--with-topology' : ''}`}>
          <TabPanels>
            <TabPanel>
              <Suspense fallback={<div className="midpoint-shell__lazy-fallback">Loading API Catalog…</div>}>
                <CatalogTab
                  showDiffHighlights={false}
                  onTryIt={handleTryIt}
                />
              </Suspense>
            </TabPanel>
            <TabPanel>
              <Suspense fallback={<div className="midpoint-shell__lazy-fallback">Loading Traffic Monitor…</div>}>
                <TrafficMonitorTab />
              </Suspense>
            </TabPanel>
            <TabPanel>
              <EventFeedTab />
            </TabPanel>
            <TabPanel>
              <Suspense fallback={<div className="midpoint-shell__lazy-fallback">Loading WebSocket Inspector…</div>}>
                <WebSocketInspectorTab />
              </Suspense>
            </TabPanel>
            <TabPanel>
              <WebSshTab />
            </TabPanel>
            <TabPanel>
              <Suspense fallback={<div className="midpoint-shell__lazy-fallback">Loading Request Builder…</div>}>
                <RequestBuilderTab
                  environments={environments}
                  activeEnvironmentId={activeEnvironmentId}
                  onEnvironmentChange={setActiveEnvironmentId}
                  selectedNode={selectedNode}
                  onNodeTargetChange={setSelectedNode}
                  tryItEndpoint={tryItEndpoint}
                />
              </Suspense>
            </TabPanel>
            <TabPanel>
              <Suspense fallback={<div className="midpoint-shell__lazy-fallback">Loading Collections…</div>}>
                <CollectionsTab onOpenRequest={handleOpenDraft} />
              </Suspense>
            </TabPanel>
          </TabPanels>

          {showTopology && (
            <Suspense fallback={null}>
              <ClusterTopologyPanel
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                collapsed={topologyCollapsed}
                onToggleCollapsed={() => setTopologyCollapsed((prev) => !prev)}
              />
            </Suspense>
          )}
        </div>
      </Tabs>

    </section>
  )
}

export default ApiWebhooksPage
