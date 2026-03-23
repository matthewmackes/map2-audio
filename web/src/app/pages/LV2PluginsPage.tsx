import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  DataTable,
  Grid,
  InlineLoading,
  InlineNotification,
  Layer,
  Modal,
  Row,
  Column,
  Select,
  SelectItem,
  Table,
  TableBatchAction,
  TableBatchActions,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react'
import {
  CheckmarkFilled,
  Download,
  Network_4,
  Package,
  Renew,
  TrashCan,
  View,
  ViewOff,
  WarningFilled,
} from '@carbon/icons-react'
import { pluginsApi } from '../../map2/api'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { PageHeader } from '../components/PageHeader'
import { useCluster } from '../contexts/ClusterContext'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { withNodeQuery } from '../utils/clusterTransport'
import { usePluginBrowser, type PluginInfo } from '../hooks/usePluginBrowser'
import './LV2PluginsPage.css'

interface PluginPack {
  id: string
  name: string
  description: string
  packages: string[]
  category: string
  size_estimate: string
  plugin_count: number
  status: 'installed' | 'not_installed' | 'installing' | 'uninstalling' | 'disabled' | 'disabling' | 'enabling' | 'error'
  error_message?: string | null
  can_install?: boolean
  can_uninstall?: boolean
}

type SortKey = 'name' | 'author' | 'format'
type PackConfirmAction = 'disable' | 'uninstall'

const LOCAL_HEADERS = [
  { key: 'name', header: 'Name' },
  { key: 'author', header: 'Author' },
  { key: 'format', header: 'Format' },
  { key: 'category', header: 'Category' },
  { key: 'status', header: 'Status' },
  { key: 'uri', header: 'URI' },
]

const CLUSTER_HEADERS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category' },
  { key: 'version', header: 'Version' },
  { key: 'availability', header: 'Availability' },
  { key: 'uri', header: 'URI' },
]

function formatNodeName(node: { hostname: string; role: string; isLocal: boolean }) {
  if (node.isLocal) {
    return `${node.hostname} (Local)`
  }

  return `${node.hostname} · ${node.role}`
}

function packTag(status: PluginPack['status']) {
  switch (status) {
    case 'installed':
      return { type: 'green' as const, label: 'Installed' }
    case 'disabled':
      return { type: 'gray' as const, label: 'Disabled' }
    case 'installing':
    case 'uninstalling':
    case 'disabling':
    case 'enabling':
      return { type: 'blue' as const, label: status.replace('_', ' ') }
    case 'error':
      return { type: 'red' as const, label: 'Error' }
    default:
      return { type: 'red' as const, label: 'Missing' }
  }
}

function inventoryHeaders(clusterViewActive: boolean) {
  return clusterViewActive ? CLUSTER_HEADERS : LOCAL_HEADERS
}

export function LV2PluginsPage() {
  const { activeNodeId, nodes, localNodeId, isClusterMode, setActiveNode } = useCluster()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const { localNode: pageLocalNode, viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.lv2Plugins)
  const queryClient = useQueryClient()
  const [pluginPacks, setPluginPacks] = useState<PluginPack[]>([])
  const [loadingPacks, setLoadingPacks] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [clusterView, setClusterView] = useState(activeNodeId === 'all')
  const [refreshingCatalog, setRefreshingCatalog] = useState(false)
  const [deleteCandidateUris, setDeleteCandidateUris] = useState<string[]>([])
  const [missingNodePrompt, setMissingNodePrompt] = useState<{ plugin: PluginInfo; nodeId: string } | null>(null)
  const [packConfirm, setPackConfirm] = useState<{ action: PackConfirmAction; pack: PluginPack } | null>(null)

  const resolvedLocalNodeId = pageLocalNode?.node_id ?? localNodeId
  const detailNodeId = activeNodeId === 'all' ? null : (viewedNodeId === resolvedLocalNodeId ? null : viewedNodeId)
  const selectedNode = (viewedNode?.node_id === viewedNodeId ? viewedNode : null)
    ?? nodes.find((node) => node.nodeId === viewedNodeId)
    ?? nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(detailNodeId)
  const clusterViewActive = activeNodeId === 'all' || clusterView
  const pluginBrowser = usePluginBrowser({ nodeId: clusterViewActive ? 'all' : detailNodeId })
  const availabilityNodes = useMemo(
    () => (
      nodes.length
        ? nodes
        : [{ nodeId: localNodeId, hostname: 'local', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null }]
    ),
    [localNodeId, nodes],
  )

  useEffect(() => {
    if (activeNodeId === 'all') {
      setClusterView(true)
    }
  }, [activeNodeId])

  const refreshCatalog = useCallback(async () => {
    setRefreshingCatalog(true)
    try {
      if (!clusterViewActive) {
        await pluginsApi.discover(true, detailNodeId)
      }
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setRefreshingCatalog(false)
    }
  }, [clusterViewActive, detailNodeId, queryClient])

  const loadPluginPacks = useCallback(async () => {
    if (clusterViewActive) {
      setPluginPacks([])
      setLoadingPacks(false)
      setCatalogError(null)
      return
    }

    try {
      setLoadingPacks(true)
      setCatalogError(null)
      const response = await fetch(withNodeQuery('/api/plugin-packages/list', detailNodeId))
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as { packs?: PluginPack[] }
      setPluginPacks(data.packs ?? [])
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Failed to load plugin packs')
    } finally {
      setLoadingPacks(false)
    }
  }, [clusterViewActive, detailNodeId])

  useEffect(() => {
    void loadPluginPacks()
  }, [loadPluginPacks])

  const managementPlugins = useMemo(() => {
    const list = pluginBrowser.allPlugins ?? []
    const lowered = searchTerm.trim().toLowerCase()
    const filtered = lowered
      ? list.filter((plugin) =>
          getDisplayPluginName(plugin.name, plugin.uri).toLowerCase().includes(lowered)
            || sanitizeRestrictedDisplayText(plugin.author || '').toLowerCase().includes(lowered)
            || plugin.uri.toLowerCase().includes(lowered),
        )
      : list.slice()

    filtered.sort((left, right) => {
      if (sortBy === 'author') {
        return sanitizeRestrictedDisplayText(left.author || '').localeCompare(sanitizeRestrictedDisplayText(right.author || ''))
          || getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
      }

      if (sortBy === 'format') {
        return (left.format || '').localeCompare(right.format || '')
          || getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
      }

      return getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
    })

    return filtered
  }, [pluginBrowser.allPlugins, searchTerm, sortBy])

  const clusterNodeCount = availabilityNodes.length
  const fullyReplicatedCount = useMemo(
    () => managementPlugins.filter((plugin) => (plugin.installedOn?.length ?? 0) >= clusterNodeCount).length,
    [clusterNodeCount, managementPlugins],
  )
  const partiallyReplicatedCount = useMemo(
    () => managementPlugins.filter((plugin) => {
      const installedCount = plugin.installedOn?.length ?? 0
      return installedCount > 0 && installedCount < clusterNodeCount
    }).length,
    [clusterNodeCount, managementPlugins],
  )
  const missingInstallSlots = useMemo(
    () => managementPlugins.reduce((total, plugin) => total + Math.max(clusterNodeCount - (plugin.installedOn?.length ?? 0), 0), 0),
    [clusterNodeCount, managementPlugins],
  )

  const installedCount = pluginPacks.filter((pack) => pack.status === 'installed').length
  const disabledCount = pluginPacks.filter((pack) => pack.status === 'disabled').length
  const totalPlugins = pluginPacks.reduce((count, pack) => count + (pack.status === 'installed' ? pack.plugin_count : 0), 0)
  const packCategories = [...new Set(pluginPacks.map((pack) => pack.category))].sort()

  const inventoryRows = useMemo(() => {
    return managementPlugins.map((plugin) => ({
      id: plugin.uri,
      name: getDisplayPluginName(plugin.name, plugin.uri),
      author: sanitizeRestrictedDisplayText(plugin.author || '') || 'Unknown',
      format: plugin.format || 'LV2',
      category: plugin.category || 'Uncategorized',
      status: 'Active',
      version: plugin.version || 'unknown',
      availability: (plugin.installedOn ?? []).join(', '),
      uri: plugin.uri,
    }))
  }, [managementPlugins])

  const deleteMutation = useMutation({
    mutationFn: async (uris: string[]) => {
      const failures: string[] = []

      for (const uri of uris) {
        try {
          await pluginsApi.delete(uri, detailNodeId)
        } catch (error: any) {
          failures.push(error?.message || `Failed to delete ${uri}`)
        }
      }

      if (failures.length > 0) {
        throw new Error(failures.join(', '))
      }

      return uris
    },
    onSuccess: async () => {
      setDeleteCandidateUris([])
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })

  const handleInstall = async (packId: string) => {
    await fetch(withNodeQuery(`/api/plugin-packages/${packId}/install`, detailNodeId), { method: 'POST' })
    setPluginPacks((previous) => previous.map((pack) => (
      pack.id === packId ? { ...pack, status: 'installing' } : pack
    )))
    pollPackStatus(packId)
  }

  const handleEnable = async (packId: string) => {
    await fetch(withNodeQuery(`/api/plugin-packages/${packId}/enable`, detailNodeId), { method: 'POST' })
    setPluginPacks((previous) => previous.map((pack) => (
      pack.id === packId ? { ...pack, status: 'enabling' } : pack
    )))
    pollPackStatus(packId)
  }

  const handlePackConfirm = async () => {
    if (!packConfirm) {
      return
    }

    const path = packConfirm.action === 'disable' ? 'disable' : 'uninstall'
    const pendingStatus = packConfirm.action === 'disable' ? 'disabling' : 'uninstalling'

    await fetch(withNodeQuery(`/api/plugin-packages/${packConfirm.pack.id}/${path}`, detailNodeId), { method: 'POST' })
    setPluginPacks((previous) => previous.map((pack) => (
      pack.id === packConfirm.pack.id ? { ...pack, status: pendingStatus } : pack
    )))
    pollPackStatus(packConfirm.pack.id)
    setPackConfirm(null)
  }

  const pollPackStatus = (packId: string) => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(withNodeQuery(`/api/plugin-packages/${packId}/status`, detailNodeId))
        const data = await response.json() as { status: PluginPack['status']; error_message?: string | null }
        setPluginPacks((previous) => previous.map((pack) => (
          pack.id === packId ? { ...pack, status: data.status, error_message: data.error_message } : pack
        )))

        if (!['installing', 'uninstalling', 'disabling', 'enabling'].includes(data.status)) {
          window.clearInterval(interval)
        }
      } catch {
        window.clearInterval(interval)
      }
    }, 2000)

    window.setTimeout(() => window.clearInterval(interval), 300000)
  }

  const pageSubtitle = clusterViewActive
    ? 'Unified catalog with per-node availability, remediation prompts, and Carbon-managed cleanup actions.'
    : remoteSelected
      ? `Manage curated LV2 packs and cleanup actions on ${selectedNode?.hostname ?? detailNodeId}.`
      : 'Install curated LV2 packs, validate node coverage, and keep the catalog clean.'

  return (
    <section className="lv2-plugins-page">
      <Layer className="lv2-plugins-page__surface">
        <div className="stack">
          <PageHeader
            title="Plugins"
            subtitle={pageSubtitle}
            icon={<Package size={32} />}
            actions={(
              <div className="lv2-plugins-page__actions">
                {isClusterMode ? (
                  <Button
                    size="sm"
                    kind={clusterViewActive ? 'primary' : 'tertiary'}
                    renderIcon={Network_4}
                    onClick={() => {
                      if (activeNodeId !== 'all') {
                        setClusterView((previous) => !previous)
                      }
                    }}
                    disabled={activeNodeId === 'all'}
                  >
                    {clusterViewActive ? 'Cluster view on' : 'Cluster view'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  kind="tertiary"
                  renderIcon={Renew}
                  onClick={() => {
                    void refreshCatalog()
                    void loadPluginPacks()
                  }}
                  disabled={refreshingCatalog || pluginBrowser.isLoading || loadingPacks}
                >
                  {refreshingCatalog ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            )}
          />

          {isClusterMode ? (
            <Tile className="lv2-plugins-page__cluster-banner">
              <div className="lv2-plugins-page__cluster-copy">
                <div>
                  <h2 className="lv2-plugins-page__section-title">Cluster target</h2>
                  <p className="lv2-plugins-page__muted">
                    {activeNodeId === 'all'
                      ? `Viewing all ${clusterNodeCount} nodes`
                      : clusterViewActive
                        ? `Comparing node coverage from ${selectedNode?.hostname ?? availabilityNodes[0]?.hostname ?? 'local'}`
                        : selectedNode
                          ? `Managing ${selectedNode.hostname}`
                          : `Managing ${formatNodeName(availabilityNodes[0])}`}
                  </p>
                </div>
                <div className="lv2-plugins-page__banner-tags">
                  <Tag type={clusterViewActive ? 'blue' : 'cool-gray'}>{clusterViewActive ? 'Cluster catalog' : 'Node management'}</Tag>
                  <Tag type={remoteSelected ? 'green' : 'warm-gray'}>
                    {remoteSelected ? 'Remote actions enabled' : 'Local node'}
                  </Tag>
                </div>
              </div>
              <div className="lv2-plugins-page__node-list">
                {availabilityNodes.map((node) => (
                  <Button
                    key={node.nodeId}
                    size="sm"
                    kind={viewedNodeId === node.nodeId ? 'primary' : 'ghost'}
                    onClick={() => {
                      setClusterView(false)
                      setActiveNode(null)
                      setViewedNode(NODE_PAGE_KEYS.lv2Plugins, node.nodeId)
                    }}
                  >
                    {node.hostname}
                  </Button>
                ))}
              </div>
            </Tile>
          ) : null}

          {catalogError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Plugin pack catalog unavailable"
              subtitle={catalogError}
            />
          ) : null}

          <Grid condensed className="lv2-plugins-page__stats">
            {clusterViewActive ? (
              <>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{managementPlugins.length}</span>
                    <span className="lv2-plugins-page__stat-label">Catalog entries</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{fullyReplicatedCount}</span>
                    <span className="lv2-plugins-page__stat-label">Fully replicated</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{partiallyReplicatedCount}</span>
                    <span className="lv2-plugins-page__stat-label">Partial coverage</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{missingInstallSlots}</span>
                    <span className="lv2-plugins-page__stat-label">Missing installs</span>
                  </Tile>
                </Column>
              </>
            ) : (
              <>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{installedCount}</span>
                    <span className="lv2-plugins-page__stat-label">Installed packs</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{disabledCount}</span>
                    <span className="lv2-plugins-page__stat-label">Disabled packs</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{totalPlugins}</span>
                    <span className="lv2-plugins-page__stat-label">Active plugins</span>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile className="lv2-plugins-page__stat">
                    <span className="lv2-plugins-page__stat-value">{packCategories.length}</span>
                    <span className="lv2-plugins-page__stat-label">Categories</span>
                  </Tile>
                </Column>
              </>
            )}
          </Grid>

          {deleteMutation.isError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Delete failed"
              subtitle={(deleteMutation.error as Error)?.message || 'One or more plugins could not be deleted.'}
            />
          ) : null}

          <Tile className="lv2-plugins-page__inventory">
            <div className="lv2-plugins-page__section-header">
              <div>
                <h2 className="lv2-plugins-page__section-title">Plugin inventory</h2>
                <p className="lv2-plugins-page__muted">
                  {clusterViewActive
                    ? 'Read-only cluster coverage. Click a missing node badge to switch into remediation mode.'
                    : 'Search, sort, and batch-delete plugins on the currently selected node.'}
                </p>
              </div>
              <Tag type={clusterViewActive ? 'blue' : 'green'}>
                {clusterViewActive ? `${managementPlugins.length} rows` : `${managementPlugins.length} installed`}
              </Tag>
            </div>

            {pluginBrowser.isLoading ? (
              <div className="lv2-plugins-page__loading">
                <InlineLoading description="Loading plugin inventory" />
              </div>
            ) : pluginBrowser.isError ? (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Inventory unavailable"
                subtitle={pluginBrowser.error instanceof Error ? pluginBrowser.error.message : 'Failed to load plugins.'}
              />
            ) : (
              <DataTable rows={inventoryRows} headers={inventoryHeaders(clusterViewActive)} isSortable useZebraStyles>
                {({
                  rows,
                  headers,
                  getBatchActionProps,
                  getHeaderProps,
                  getRowProps,
                  getSelectionProps,
                  getTableProps,
                  getTableContainerProps,
                  getToolbarProps,
                  selectedRows,
                }) => (
                  <TableContainer
                    {...getTableContainerProps()}
                    title="Plugin catalog"
                    description="Inventory is filtered to the active search, sort order, and node scope."
                    className="lv2-plugins-page__table-container"
                  >
                    <TableToolbar {...getToolbarProps()}>
                      {!clusterViewActive ? (
                        <TableBatchActions {...getBatchActionProps()}>
                          <TableBatchAction
                            renderIcon={TrashCan}
                            iconDescription="Delete selected plugins"
                            onClick={() => setDeleteCandidateUris(selectedRows.map((row) => row.id))}
                          >
                            Delete
                          </TableBatchAction>
                        </TableBatchActions>
                      ) : null}
                      <TableToolbarContent className="lv2-plugins-page__toolbar-content">
                        <TableToolbarSearch
                          persistent
                          value={searchTerm}
                          onChange={(_event, value) => setSearchTerm(value ?? '')}
                        />
                        <div className="lv2-plugins-page__sort">
                          <Select
                            id="plugins-page-sort"
                            labelText="Sort plugins"
                            value={sortBy}
                            size="sm"
                            onChange={(event) => setSortBy(event.target.value as SortKey)}
                          >
                            <SelectItem value="name" text="Sort by name" />
                            <SelectItem value="author" text="Sort by author" />
                            <SelectItem value="format" text="Sort by format" />
                          </Select>
                        </div>
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()} aria-label="Plugin inventory table">
                      <TableHead>
                        <TableRow>
                          {!clusterViewActive ? <TableSelectAll {...getSelectionProps()} /> : null}
                          {headers.map((header) => {
                            const { key: _headerKey, ...headerProps } = getHeaderProps({ header })
                            return (
                              <TableHeader key={header.key} {...headerProps}>
                                {header.header}
                              </TableHeader>
                            )
                          })}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => {
                          const plugin = managementPlugins.find((candidate) => candidate.uri === row.id)
                          const installedNodes = new Set(plugin?.installedOn ?? [])
                          const { key: _rowKey, ...rowProps } = getRowProps({ row })

                          return (
                            <TableRow key={row.id} {...rowProps}>
                              {!clusterViewActive ? <TableSelectRow {...getSelectionProps({ row })} /> : null}
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'format') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="blue">{String(cell.value)}</Tag>
                                    </TableCell>
                                  )
                                }

                                if (cell.info.header === 'status') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="green" renderIcon={CheckmarkFilled}>
                                        Active
                                      </Tag>
                                    </TableCell>
                                  )
                                }

                                if (cell.info.header === 'availability' && plugin) {
                                  return (
                                    <TableCell key={cell.id}>
                                      <div className="lv2-plugins-page__availability">
                                        {availabilityNodes.map((node) => {
                                          const installed = installedNodes.has(node.nodeId)
                                          return (
                                            <button
                                              key={`${plugin.uri}-${node.nodeId}`}
                                              type="button"
                                              className={`lv2-plugins-page__availability-pill${installed ? ' is-installed' : ' is-missing'}`}
                                              onClick={() => {
                                                if (!installed) {
                                                  setMissingNodePrompt({ plugin, nodeId: node.nodeId })
                                                }
                                              }}
                                              disabled={installed}
                                            >
                                              <span className="lv2-plugins-page__availability-node">{node.hostname}</span>
                                              <span>{installed ? 'Installed' : 'Missing'}</span>
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </TableCell>
                                  )
                                }

                                if (cell.info.header === 'uri') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <span className="lv2-plugins-page__uri" title={String(cell.value)}>
                                        {String(cell.value)}
                                      </span>
                                    </TableCell>
                                  )
                                }

                                return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                              })}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
            )}
          </Tile>

          {!clusterViewActive ? (
            <Tile className="lv2-plugins-page__packs">
              <div className="lv2-plugins-page__section-header">
                <div>
                  <h2 className="lv2-plugins-page__section-title">Plugin packs</h2>
                  <p className="lv2-plugins-page__muted">
                    Install, disable, enable, or uninstall curated LV2 collections from the selected node.
                  </p>
                </div>
                <Tag type="cool-gray">{pluginPacks.length} packs</Tag>
              </div>

              {loadingPacks ? (
                <div className="lv2-plugins-page__loading">
                  <InlineLoading description="Loading plugin packs" />
                </div>
              ) : (
                <Accordion align="start" className="lv2-plugins-page__accordion">
                  {pluginPacks.map((pack) => {
                    const tag = packTag(pack.status)
                    const transitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)

                    return (
                      <AccordionItem
                        key={pack.id}
                        title={(
                          <div className="lv2-plugins-page__accordion-title">
                            <span>{pack.name}</span>
                            <div className="lv2-plugins-page__banner-tags">
                              <Tag type={tag.type}>{tag.label}</Tag>
                              <Tag type="purple">{pack.plugin_count} plugins</Tag>
                              <Tag type="blue">{pack.size_estimate}</Tag>
                            </div>
                          </div>
                        )}
                      >
                        <div className="lv2-plugins-page__pack-body">
                          <p className="lv2-plugins-page__pack-description">{pack.description}</p>
                          <div className="lv2-plugins-page__pack-meta">
                            <Tag type="cool-gray">{pack.category}</Tag>
                            {pack.error_message ? <Tag type="red">{pack.error_message}</Tag> : null}
                          </div>
                          <div className="lv2-plugins-page__pack-actions">
                            {transitional ? (
                              <InlineLoading description={`Pack ${tag.label}`} />
                            ) : pack.status === 'disabled' ? (
                              <Button size="sm" kind="primary" renderIcon={View} onClick={() => void handleEnable(pack.id)}>
                                Enable
                              </Button>
                            ) : pack.status === 'installed' ? (
                              <>
                                <Button
                                  size="sm"
                                  kind="tertiary"
                                  renderIcon={ViewOff}
                                  onClick={() => setPackConfirm({ action: 'disable', pack })}
                                >
                                  Disable
                                </Button>
                                {pack.can_uninstall !== false ? (
                                  <Button
                                    size="sm"
                                    kind="danger--tertiary"
                                    renderIcon={TrashCan}
                                    onClick={() => setPackConfirm({ action: 'uninstall', pack })}
                                  >
                                    Uninstall
                                  </Button>
                                ) : null}
                              </>
                            ) : pack.can_install !== false ? (
                              <Button size="sm" kind="primary" renderIcon={Download} onClick={() => void handleInstall(pack.id)}>
                                Install
                              </Button>
                            ) : (
                              <Tag type="warm-gray">Not available from package manager</Tag>
                            )}
                          </div>
                        </div>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}
            </Tile>
          ) : null}

          <Tile className="lv2-plugins-page__about">
            <div className="lv2-plugins-page__section-header">
              <div>
                <h2 className="lv2-plugins-page__section-title">About this workflow</h2>
                <p className="lv2-plugins-page__muted">
                  Use cluster view to compare node coverage before deployment. Switch to a node-scoped view when you need package installs,
                  catalog refreshes, or destructive cleanup operations.
                </p>
              </div>
            </div>
          </Tile>

          <Modal
            danger
            open={deleteCandidateUris.length > 0}
            modalHeading="Delete plugins"
            primaryButtonText={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            secondaryButtonText="Cancel"
            onRequestClose={() => setDeleteCandidateUris([])}
            onRequestSubmit={() => deleteMutation.mutate(deleteCandidateUris)}
            primaryButtonDisabled={deleteMutation.isPending}
          >
            <p className="lv2-plugins-page__modal-copy">
              Delete {deleteCandidateUris.length} plugin{deleteCandidateUris.length === 1 ? '' : 's'} from the selected node.
              This cannot be undone.
            </p>
          </Modal>

          <Modal
            open={missingNodePrompt !== null}
            modalHeading="Switch to missing node"
            primaryButtonText="Switch node"
            secondaryButtonText="Cancel"
            onRequestClose={() => setMissingNodePrompt(null)}
            onRequestSubmit={() => {
              if (!missingNodePrompt) {
                return
              }

              setClusterView(false)
              setActiveNode(null)
              setViewedNode(NODE_PAGE_KEYS.lv2Plugins, missingNodePrompt.nodeId)
              setMissingNodePrompt(null)
            }}
          >
            {missingNodePrompt ? (
              <p className="lv2-plugins-page__modal-copy">
                {getDisplayPluginName(missingNodePrompt.plugin.name, missingNodePrompt.plugin.uri)} is missing on{' '}
                {formatNodeName(availabilityNodes.find((node) => node.nodeId === missingNodePrompt.nodeId) ?? availabilityNodes[0])}. Switch to that node
                to install the required pack.
              </p>
            ) : null}
          </Modal>

          <Modal
            danger={packConfirm?.action === 'uninstall'}
            open={packConfirm !== null}
            modalHeading={packConfirm?.action === 'disable' ? 'Disable plugin pack' : 'Uninstall plugin pack'}
            primaryButtonText={packConfirm?.action === 'disable' ? 'Disable' : 'Uninstall'}
            secondaryButtonText="Cancel"
            onRequestClose={() => setPackConfirm(null)}
            onRequestSubmit={() => {
              void handlePackConfirm()
            }}
          >
            {packConfirm ? (
              <p className="lv2-plugins-page__modal-copy">
                {packConfirm.action === 'disable'
                  ? `Disable ${packConfirm.pack.name} without removing files from disk.`
                  : `Remove ${packConfirm.pack.name} and its managed plugin payload from the selected node.`}
              </p>
            ) : null}
          </Modal>
        </div>
      </Layer>
    </section>
  )
}

export default LV2PluginsPage
