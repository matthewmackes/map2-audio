import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { Package, RefreshCw, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Search, SlidersHorizontal, Zap, Timer, Waves, Activity, Gauge, Guitar, Mic, AudioLines, Settings2, ChevronRight, FolderOpen, HardDrive, Download, ExternalLink, Play, Square, AlertTriangle } from 'lucide-react'
import { vst3Api, vst3PackagesApi } from '../../map2/api'
import type { VST3Plugin, VST3Package, VST3DownloadProgress } from '../../map2/api'
import { VST3PluginParameterEditor } from '../components/VST3PluginParameterEditor'

// Category configuration for plugin display
type IconComponent = React.ComponentType<{ size?: number; style?: React.CSSProperties }>
const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: IconComponent }> = {
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: Timer },
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: Waves },
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  'Cabinet': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: Mic },
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Settings2 },
  'Generator': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: AudioLines },
  'Synthesizer': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: AudioLines },
  'Modular': { color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)', icon: Settings2 },
  'Multi-Effect': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Package },
  'Effect': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: Waves },
}

const getCategoryConfig = (category: string) => {
  return CATEGORY_CONFIG[category] || { color: '#888', bg: 'rgba(136, 136, 136, 0.15)', icon: AudioLines }
}

// Format file size
const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface VST3DiscoverResponse {
  plugins: VST3Plugin[]
  cached?: boolean
}

export function VST3PluginsPage() {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Plugin Browser state - persisted to localStorage
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem('map2_vst3_search') || '';
    } catch { return ''; }
  })
  const [selectedCategory, setSelectedCategory] = useState(() => {
    try {
      return localStorage.getItem('map2_vst3_category') || 'all';
    } catch { return 'all'; }
  })
  const [selectedPlugin, setSelectedPlugin] = useState<VST3Plugin | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_vst3_collapsed_categories');
      return val ? new Set(JSON.parse(val)) : new Set();
    } catch { return new Set(); }
  })

  // VST3 plugin discovery query
  const pluginsQuery = useQuery<VST3DiscoverResponse>({
    queryKey: ['vst3-plugins', 'discover'],
    queryFn: () => vst3Api.discover(),
    staleTime: 60000,
  })

  // VST3 paths query
  const pathsQuery = useQuery({
    queryKey: ['vst3-paths'],
    queryFn: () => vst3Api.getPaths(),
    staleTime: 300000,
  })

  // Cache status query
  const cacheQuery = useQuery({
    queryKey: ['vst3-cache-status'],
    queryFn: () => vst3Api.getCacheStatus(),
    staleTime: 30000,
  })

  // VST3 packages queries
  const sourcesQuery = useQuery({
    queryKey: ['vst3-packages-sources'],
    queryFn: () => vst3PackagesApi.getSources(),
    staleTime: 300000,
  })

  const packagesQuery = useQuery({
    queryKey: ['vst3-packages'],
    queryFn: () => vst3PackagesApi.list(),
    staleTime: 60000,
  })

  const progressQuery = useQuery<VST3DownloadProgress>({
    queryKey: ['vst3-packages-progress'],
    queryFn: () => vst3PackagesApi.getProgress(),
    refetchInterval: (query) => query.state.data?.is_downloading ? 1000 : false,
    staleTime: 1000,
  })

  // Mutations
  const discoverMutation = useMutation({
    mutationFn: () => vst3PackagesApi.discover(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vst3-packages'] })
    },
  })

  const downloadMutation = useMutation({
    mutationFn: (sources?: string[]) => vst3PackagesApi.download(sources),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vst3-packages-progress'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => vst3PackagesApi.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vst3-packages-progress'] })
    },
  })

  const downloadSourceMutation = useMutation({
    mutationFn: (source: string) => vst3PackagesApi.downloadSource(source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vst3-packages-progress'] })
    },
  })

  // Filter and group plugins
  const pluginCategories = useMemo(() => {
    const set = new Set<string>()
    pluginsQuery.data?.plugins?.forEach((p: VST3Plugin) => set.add(p.category))
    return Array.from(set).sort()
  }, [pluginsQuery.data])

  const filteredPlugins = useMemo(() => {
    if (!pluginsQuery.data?.plugins) return []
    const term = searchQuery.toLowerCase()
    return pluginsQuery.data.plugins.filter((p: VST3Plugin) => {
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory
      const matchText = p.name.toLowerCase().includes(term) ||
                       p.category.toLowerCase().includes(term) ||
                       p.author?.toLowerCase().includes(term)
      return matchCategory && matchText
    })
  }, [pluginsQuery.data, searchQuery, selectedCategory])

  const groupedPlugins = useMemo(() => {
    const groups: Record<string, VST3Plugin[]> = {}
    filteredPlugins.forEach((p: VST3Plugin) => {
      if (!groups[p.category]) groups[p.category] = []
      groups[p.category].push(p)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredPlugins])

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('map2_vst3_search', searchQuery);
    } catch { /* Ignore localStorage errors */ }
  }, [searchQuery])

  useEffect(() => {
    try {
      localStorage.setItem('map2_vst3_category', selectedCategory);
    } catch { /* Ignore localStorage errors */ }
  }, [selectedCategory])

  useEffect(() => {
    try {
      localStorage.setItem('map2_vst3_collapsed_categories', JSON.stringify([...collapsedCategories]));
    } catch { /* Ignore localStorage errors */ }
  }, [collapsedCategories])

  const handleRefresh = async () => {
    try {
      await vst3Api.refresh()
      pluginsQuery.refetch()
      cacheQuery.refetch()
      pathsQuery.refetch()
    } catch (err) {
      console.error('Failed to refresh VST3 plugins:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    }
  }

  const totalPlugins = pluginsQuery.data?.plugins?.length || 0
  const compatiblePlugins = pluginsQuery.data?.plugins?.filter(p => p.compatible !== false).length || 0
  const incompatiblePlugins = totalPlugins - compatiblePlugins
  const categoriesCount = pluginCategories.length
  const pathsWithPlugins = pathsQuery.data?.paths?.filter(p => p.exists && p.plugin_count > 0) || []
  const isDownloading = progressQuery.data?.is_downloading || false

  return (
    <div className="stack">
      <PageHeader
        title="VST3 Plugin Manager"
        subtitle="Discover and manage VST3 plugins using JUCE engine"
        actions={
          <div className="flex" style={{ gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={handleRefresh}
              disabled={pluginsQuery.isLoading}
            >
              {pluginsQuery.isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        }
      />

      {/* Error Display */}
      {error && (
        <div className="card" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          padding: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={20} style={{ color: '#ef4444' }} />
            <div>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Error</div>
              <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
        borderColor: 'rgba(139, 92, 246, 0.3)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6' }}>{compatiblePlugins}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Compatible</div>
            {incompatiblePlugins > 0 && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
                +{incompatiblePlugins} incompatible
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#a78bfa' }}>{categoriesCount}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Categories</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#c4b5fd' }}>{pathsWithPlugins.length}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Active Paths</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: pluginsQuery.data?.cached ? '#4ade80' : '#f59e0b' }}>
              {pluginsQuery.data?.cached ? 'Cached' : 'Live'}
            </div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
          </div>
        </div>
      </div>

      {/* Plugin Browser + Parameters Grid - Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: '55% 45%', gap: 16 }}>
        {/* Plugin Browser Card */}
        <div className="card">
          <div className="section-heading">
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>VST3 Plugin Browser</h2>
              <p className="subtitle">Browse {pluginsQuery.data?.plugins?.length ?? 0} discovered VST3 plugins</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="pill">{filteredPlugins.length} shown</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                  <input
                    type="text"
                    placeholder="Search plugins..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input"
                    style={{ paddingLeft: 32, minWidth: 180 }}
                  />
                </div>
                <select
                  className="input"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {pluginCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {pluginsQuery.isLoading ? (
            <div className="flex" style={{ padding: '24px', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={18} />
              <span style={{ marginLeft: 8 }}>Loading VST3 plugins...</span>
            </div>
          ) : pluginsQuery.error ? (
            <div className="pill warn">Failed to load plugins</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto', overflowX: 'hidden' }}>
              {groupedPlugins.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
                  No VST3 plugins found. Install VST3 plugins to ~/.vst3 or /usr/lib/vst3
                </div>
              ) : (
                groupedPlugins.map(([categoryName, plugins]) => {
                  const catConfig = getCategoryConfig(categoryName)
                  const CategoryIcon = catConfig.icon
                  const isCollapsed = collapsedCategories.has(categoryName)
                  return (
                    <div key={categoryName} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          background: `linear-gradient(90deg, ${catConfig.bg} 0%, rgba(0,0,0,0.2) 100%)`,
                          borderLeft: `4px solid ${catConfig.color}`,
                          borderRadius: '0 6px 6px 0',
                          marginBottom: isCollapsed ? 0 : 8,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                        onClick={() => toggleCategory(categoryName)}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={14} style={{ color: catConfig.color }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: catConfig.color }} />
                        )}
                        <CategoryIcon size={14} style={{ color: catConfig.color }} />
                        <span style={{ color: catConfig.color, fontWeight: 600, fontSize: 13 }}>
                          {categoryName}
                        </span>
                        <span className="pill" style={{ fontSize: 10, marginLeft: 'auto', background: `${catConfig.color}20`, color: catConfig.color }}>
                          {plugins.length}
                        </span>
                      </div>

                      {!isCollapsed && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 8px' }}>
                          {plugins.map((p: VST3Plugin) => {
                            const isIncompatible = p.compatible === false
                            return (
                            <div
                              key={p.uri}
                              className="list-item"
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                borderLeft: `3px solid ${isIncompatible ? '#ef4444' : catConfig.color}`,
                                background: selectedPlugin?.uri === p.uri
                                  ? `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(0,0,0,0.3) 100%)`
                                  : isIncompatible
                                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(0,0,0,0.2) 100%)'
                                    : undefined,
                                boxShadow: selectedPlugin?.uri === p.uri
                                  ? `0 0 10px ${catConfig.color}30`
                                  : undefined,
                                opacity: isIncompatible ? 0.7 : 1,
                              }}
                              onClick={() => setSelectedPlugin(p)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <CategoryIcon size={14} style={{ color: catConfig.color }} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#888' }}>{p.author || 'Unknown author'}</div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                <span className="pill muted" style={{ fontSize: 9 }}>{p.in_ports}→{p.out_ports}</span>
                                <span className="pill info" style={{ fontSize: 9, background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>VST3</span>
                                {p.has_ui && <span className="pill info" style={{ fontSize: 9 }}>GUI</span>}
                                {p.compatible === false && (
                                  <span className="pill" style={{ fontSize: 9, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <AlertTriangle size={10} />
                                    {p.platform === 'windows' ? 'Windows' : p.platform === 'macos' ? 'macOS' : 'Incompatible'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )})}

                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Parameters Card - Full Editor */}
        <div className="card" style={{ maxHeight: 800, overflow: 'auto' }}>
          {!selectedPlugin ? (
            <div style={{
              padding: 32,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 48,
                marginBottom: 16,
                filter: 'grayscale(0.3)',
              }}>
                🎛️
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>
                Select a VST3 Plugin
              </div>
              <div style={{ fontSize: 12, color: '#888', maxWidth: 240, margin: '0 auto', lineHeight: 1.5 }}>
                Click on any plugin in the browser to view and edit its parameters, save presets, and add it to your chain.
              </div>
            </div>
          ) : (
            <VST3PluginParameterEditor
              plugin={selectedPlugin}
              showAddToChain={true}
            />
          )}
        </div>
      </div>

      {/* VST3 Plugin Packages - Download Grid */}
      <div className="card">
        <div className="section-heading">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Download size={20} style={{ color: '#8b5cf6' }} />
              Free VST3 Plugin Packages
            </h2>
            <p className="subtitle">
              Download free, open-source VST3 plugins from trusted sources
              {progressQuery.data?.install_path && (
                <span style={{ marginLeft: 8, color: '#4ade80' }}>
                  → Install path: <code style={{ background: 'rgba(74, 222, 128, 0.1)', padding: '2px 6px', borderRadius: 4 }}>{progressQuery.data.install_path}</code>
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending || isDownloading}
            >
              {discoverMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Discover
            </button>
            {isDownloading ? (
              <button
                className="btn"
                style={{ background: '#ef4444' }}
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                <Square size={16} />
                Cancel
              </button>
            ) : (
              <button
                className="btn"
                style={{ background: '#8b5cf6' }}
                onClick={() => downloadMutation.mutate(undefined)}
                disabled={downloadMutation.isPending || (packagesQuery.data?.packages?.length ?? 0) === 0}
              >
                <Play size={16} />
                Download All
              </button>
            )}
          </div>
        </div>

        {/* Download Progress */}
        {isDownloading && progressQuery.data && (
          <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(0,0,0,0.2))',
            borderRadius: 8,
            marginBottom: 16,
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6' }}>
                Downloading...
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                {progressQuery.data.progress_percent.toFixed(0)}%
              </span>
            </div>
            <div style={{
              height: 6,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressQuery.data.progress_percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
            {progressQuery.data.stats && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#888' }}>
                <span>Downloaded: {progressQuery.data.stats.downloaded}</span>
                <span>Failed: {progressQuery.data.stats.failed}</span>
                <span>Skipped: {progressQuery.data.stats.skipped}</span>
              </div>
            )}
          </div>
        )}

        {/* Package Grid */}
        {packagesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#8b5cf6' }} />
            <span style={{ marginLeft: 12, color: '#888' }}>Loading packages...</span>
          </div>
        ) : (packagesQuery.data?.packages?.length ?? 0) === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <Download size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
            <div style={{ fontSize: 14, marginBottom: 8 }}>No packages discovered yet</div>
            <div style={{ fontSize: 12 }}>Click "Discover" to find available VST3 plugin packages</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {packagesQuery.data?.packages?.map((pkg: VST3Package) => {
              const catConfig = getCategoryConfig(pkg.category)
              const CategoryIcon = catConfig.icon
              const sourceState = progressQuery.data?.sources?.find(s => s.name === pkg.source)

              return (
                <div
                  key={`${pkg.source}-${pkg.name}`}
                  style={{
                    padding: 16,
                    background: `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(0,0,0,0.3) 100%)`,
                    border: `1px solid ${catConfig.color}40`,
                    borderLeft: `4px solid ${catConfig.color}`,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: `${catConfig.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <CategoryIcon size={18} style={{ color: catConfig.color }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff' }}>{pkg.name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{pkg.author || 'Unknown'}</div>
                      </div>
                    </div>
                    {pkg.homepage && (
                      <a
                        href={pkg.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#888' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>

                  {/* Description */}
                  {pkg.description && (
                    <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.4 }}>
                      {pkg.description}
                    </div>
                  )}

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 8px',
                      background: `${catConfig.color}20`,
                      color: catConfig.color,
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 500,
                    }}>
                      {pkg.category}
                    </span>
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#a78bfa',
                      borderRadius: 4,
                      fontSize: 10,
                    }}>
                      {pkg.source}
                    </span>
                    {pkg.version && (
                      <span style={{
                        padding: '3px 8px',
                        background: 'rgba(100, 116, 139, 0.2)',
                        color: '#94a3b8',
                        borderRadius: 4,
                        fontSize: 10,
                      }}>
                        v{pkg.version}
                      </span>
                    )}
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(74, 222, 128, 0.1)',
                      color: '#4ade80',
                      borderRadius: 4,
                      fontSize: 10,
                    }}>
                      {pkg.license}
                    </span>
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <span style={{ fontSize: 11, color: '#666' }}>
                      {formatFileSize(pkg.file_size)}
                    </span>
                    <button
                      className="btn btn-sm"
                      style={{
                        background: sourceState?.state === 'downloading' ? 'rgba(139, 92, 246, 0.3)' : catConfig.color,
                        color: sourceState?.state === 'downloading' ? catConfig.color : '#000',
                        padding: '4px 12px',
                        fontSize: 11,
                      }}
                      onClick={() => downloadSourceMutation.mutate(pkg.source)}
                      disabled={isDownloading || downloadSourceMutation.isPending}
                    >
                      {sourceState?.state === 'downloading' ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          Install
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Status Row */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Package size={16} style={{ color: '#8b5cf6' }} />
          <span style={{ fontSize: 12, color: '#888', marginRight: 8 }}>Quick Status:</span>
          {pluginCategories.map(category => {
            const catConfig = getCategoryConfig(category)
            const count = pluginsQuery.data?.plugins?.filter(p => p.category === category).length || 0
            return (
              <span
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: `${catConfig.color}20`,
                  color: catConfig.color,
                  border: `1px solid ${catConfig.color}30`,
                }}
              >
                {category} ({count})
              </span>
            )
          })}
        </div>
      </div>

      {/* VST3 Paths Section */}
      {expanded && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={16} />
            VST3 Search Paths
          </h3>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            The system searches these directories for VST3 plugins. Downloaded plugins are installed to <code style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '2px 6px', borderRadius: 4, color: '#a78bfa' }}>~/.vst3</code>
          </p>

          {pathsQuery.isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: '#8b5cf6' }} />
              <span style={{ marginLeft: 12, color: '#888' }}>Loading paths...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {pathsQuery.data?.paths?.map((pathInfo) => {
                const isInstallPath = pathInfo.path.endsWith('/.vst3') || pathInfo.path === '~/.vst3'
                return (
                  <div
                    key={pathInfo.path}
                    style={{
                      padding: 16,
                      background: isInstallPath
                        ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(0,0,0,0.2))'
                        : pathInfo.exists && pathInfo.plugin_count > 0
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(0,0,0,0.2))'
                          : pathInfo.exists
                            ? 'linear-gradient(135deg, rgba(107, 114, 128, 0.1), rgba(0,0,0,0.3))'
                            : 'linear-gradient(135deg, rgba(55, 55, 55, 0.1), rgba(0,0,0,0.2))',
                      border: `1px solid ${isInstallPath ? 'rgba(74, 222, 128, 0.4)' : pathInfo.exists && pathInfo.plugin_count > 0 ? 'rgba(139, 92, 246, 0.3)' : pathInfo.exists ? 'rgba(107, 114, 128, 0.3)' : 'rgba(55, 55, 55, 0.2)'}`,
                      borderLeft: `4px solid ${isInstallPath ? '#4ade80' : pathInfo.exists && pathInfo.plugin_count > 0 ? '#8b5cf6' : pathInfo.exists ? '#6b7280' : '#333'}`,
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      opacity: pathInfo.exists ? 1 : 0.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <HardDrive size={16} style={{ color: isInstallPath ? '#4ade80' : pathInfo.exists ? '#8b5cf6' : '#666' }} />
                        <span style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: pathInfo.exists ? '#f2f6ff' : '#666',
                          wordBreak: 'break-all',
                        }}>
                          {pathInfo.path}
                        </span>
                      </div>
                      {pathInfo.exists ? (
                        <CheckCircle size={16} style={{ color: '#4ade80', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={16} style={{ color: '#666', flexShrink: 0 }} />
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '3px 8px',
                        background: pathInfo.exists && pathInfo.plugin_count > 0 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                        border: `1px solid ${pathInfo.exists && pathInfo.plugin_count > 0 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`,
                        borderRadius: 4,
                        fontSize: 10,
                        color: pathInfo.exists && pathInfo.plugin_count > 0 ? '#a78bfa' : '#888',
                      }}>
                        {pathInfo.plugin_count} plugins
                      </span>
                      <span style={{
                        padding: '3px 8px',
                        background: pathInfo.exists ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${pathInfo.exists ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        borderRadius: 4,
                        fontSize: 10,
                        color: pathInfo.exists ? '#4ade80' : '#ef4444',
                      }}>
                        {pathInfo.exists ? 'Exists' : 'Not found'}
                      </span>
                      {isInstallPath && (
                        <span style={{
                          padding: '3px 8px',
                          background: 'rgba(74, 222, 128, 0.2)',
                          border: '1px solid rgba(74, 222, 128, 0.4)',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#4ade80',
                        }}>
                          ⬇ Install Path
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="card" style={{ background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.2)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>
          About VST3 Plugins
        </h4>
        <p style={{ fontSize: 12, color: '#888', margin: 0, lineHeight: 1.6 }}>
          VST3 (Virtual Studio Technology 3) plugins are professional audio processing modules developed by Steinberg.
          They offer advanced features like dynamic I/O, better parameter automation, and improved resource management.
          VST3 plugins are loaded through the JUCE engine for cross-platform compatibility. Install plugins to
          ~/.vst3 or /usr/lib/vst3 directories.
        </p>
        {incompatiblePlugins > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertTriangle size={14} style={{ color: '#f87171' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>Windows/macOS Plugins Detected</span>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: 0, lineHeight: 1.5 }}>
              {incompatiblePlugins} plugin{incompatiblePlugins > 1 ? 's' : ''} found that {incompatiblePlugins > 1 ? 'are' : 'is'} not Linux-native.
              To use Windows VST3 plugins on Linux, install <a href="https://github.com/robbert-vdh/yabridge" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>yabridge</a>.
              After installing yabridge, run <code style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '2px 6px', borderRadius: 4, color: '#c4b5fd' }}>yabridgectl sync</code> to convert plugins.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
