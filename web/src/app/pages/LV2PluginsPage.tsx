import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Package, Download, Trash2, RefreshCw, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, EyeOff, Eye, Search, SlidersHorizontal, Zap, Timer, Waves, Activity, Gauge, Guitar, Mic, AudioLines, Settings2, ChevronRight, Plus, User, List, Tag, Star, X } from 'lucide-react'
import { pluginsApi } from '../../map2/api'
import type { Plugin } from '../../map2/types'
import { getPluginDescription } from '../data/pluginDescriptions'
import { TagBadge, TagSelector } from '../components/PluginTags'
import { usePluginTags, usePluginMetadata } from '../hooks/usePluginTags'

// Inline tag display that lazy-loads tags for a plugin
function PluginTagDisplay({ uri, onClick }: { uri: string; onClick?: () => void }) {
  const { metadata } = usePluginMetadata(uri)
  if (!metadata?.tags || metadata.tags.length === 0) return null
  return <TagBadge tags={metadata.tags} maxDisplay={2} onClick={onClick} />
}

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
}

const getCategoryConfig = (category: string) => {
  return CATEGORY_CONFIG[category] || { color: '#888', bg: 'rgba(136, 136, 136, 0.15)', icon: AudioLines }
}

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
  can_install?: boolean  // Whether this pack can be installed via package manager
  can_uninstall?: boolean  // Whether this pack can be uninstalled via package manager
}

interface PluginDiscoverResponse {
  plugins: Plugin[]
  cached?: boolean
}

export function LV2PluginsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pluginPacks, setPluginPacks] = useState<PluginPack[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshingPlugins, setRefreshingPlugins] = useState(false)

  // Plugin Browser state - persisted to localStorage
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem('map2_lv2_search') || '';
    } catch { return ''; }
  })
  const [selectedCategory, setSelectedCategory] = useState(() => {
    try {
      return localStorage.getItem('map2_lv2_category') || 'all';
    } catch { return 'all'; }
  })
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_lv2_collapsed_categories');
      return val ? new Set(JSON.parse(val)) : new Set();
    } catch { return new Set(); }
  })

  // Sort/Group mode state - persisted to localStorage
  const [sortBy, setSortBy] = useState<'category' | 'author' | 'name'>(() => {
    try {
      const val = localStorage.getItem('map2_lv2_sort_by');
      return (val as 'category' | 'author' | 'name') || 'category';
    } catch { return 'category'; }
  })

  // Hidden plugins state - persisted to localStorage
  const [hiddenPlugins, setHiddenPlugins] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_lv2_hidden_plugins');
      return val ? new Set(JSON.parse(val)) : new Set();
    } catch { return new Set(); }
  })
  const [showHidden, setShowHidden] = useState(false)

  // Tag management state
  const [tagSelectorPlugin, setTagSelectorPlugin] = useState<Plugin | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const { favorites, isLoadingFavorites } = usePluginTags()

  // Plugin discovery query
  const pluginsQuery = useQuery<PluginDiscoverResponse>({
    queryKey: ['plugins', 'discover'],
    queryFn: () => pluginsApi.discover(),
    staleTime: 60000,
  })

  // Refresh plugins with force refresh to pick up newly installed plugins
  const refreshPlugins = useCallback(async () => {
    setRefreshingPlugins(true)
    try {
      // Call API with refresh=true to bypass backend cache
      await pluginsApi.discover(true)
      // Invalidate React Query cache to refetch
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'discover'] })
    } catch (err) {
      console.error('Failed to refresh plugins:', err)
    } finally {
      setRefreshingPlugins(false)
    }
  }, [queryClient])

  // Filter and group plugins
  const pluginCategories = useMemo(() => {
    const set = new Set<string>()
    pluginsQuery.data?.plugins?.forEach((p: Plugin) => set.add(p.category))
    return Array.from(set).sort()
  }, [pluginsQuery.data])

  // Build favorite URIs set for quick lookup
  const favoriteUris = useMemo(() => {
    return new Set(favorites.map((f: { uri: string }) => f.uri))
  }, [favorites])

  const filteredPlugins = useMemo(() => {
    if (!pluginsQuery.data?.plugins) return []
    const term = searchQuery.toLowerCase()
    return pluginsQuery.data.plugins.filter((p: Plugin) => {
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory
      const matchText = p.name.toLowerCase().includes(term) ||
                       p.category.toLowerCase().includes(term) ||
                       p.author?.toLowerCase().includes(term)
      const matchHidden = showHidden || !hiddenPlugins.has(p.uri)
      const matchFavorite = !showFavoritesOnly || favoriteUris.has(p.uri)
      return matchCategory && matchText && matchHidden && matchFavorite
    })
  }, [pluginsQuery.data, searchQuery, selectedCategory, showHidden, hiddenPlugins, showFavoritesOnly, favoriteUris])

  const hiddenCount = hiddenPlugins.size

  const groupedPlugins = useMemo(() => {
    const groups: Record<string, Plugin[]> = {}

    if (sortBy === 'name') {
      // Flat list sorted alphabetically by plugin name
      const sorted = [...filteredPlugins].sort((a, b) => a.name.localeCompare(b.name))
      groups['All Plugins'] = sorted
    } else if (sortBy === 'author') {
      // Group by author
      filteredPlugins.forEach((p: Plugin) => {
        const author = p.author || 'Unknown Author'
        if (!groups[author]) groups[author] = []
        groups[author].push(p)
      })
      // Sort plugins within each author group by name
      Object.values(groups).forEach(plugins => plugins.sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      // Group by category (default)
      filteredPlugins.forEach((p: Plugin) => {
        if (!groups[p.category]) groups[p.category] = []
        groups[p.category].push(p)
      })
      // Sort plugins within each category by name
      Object.values(groups).forEach(plugins => plugins.sort((a, b) => a.name.localeCompare(b.name)))
    }

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredPlugins, sortBy])

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const loadPluginPacks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/plugin-packages/list')
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      console.log('Plugin packs response:', data)
      if (!data.packs || data.packs.length === 0) {
        setError('No plugin packs returned from API')
      }
      setPluginPacks(data.packs || [])
    } catch (err) {
      console.error('Failed to load plugin packs:', err)
      setError(err instanceof Error ? err.message : 'Failed to load plugin packs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPluginPacks()
  }, [loadPluginPacks])

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('map2_lv2_search', searchQuery);
    } catch { /* Ignore localStorage errors */ }
  }, [searchQuery])

  useEffect(() => {
    try {
      localStorage.setItem('map2_lv2_category', selectedCategory);
    } catch { /* Ignore localStorage errors */ }
  }, [selectedCategory])

  useEffect(() => {
    try {
      localStorage.setItem('map2_lv2_collapsed_categories', JSON.stringify([...collapsedCategories]));
    } catch { /* Ignore localStorage errors */ }
  }, [collapsedCategories])

  useEffect(() => {
    try {
      localStorage.setItem('map2_lv2_hidden_plugins', JSON.stringify([...hiddenPlugins]));
    } catch { /* Ignore localStorage errors */ }
  }, [hiddenPlugins])

  useEffect(() => {
    try {
      localStorage.setItem('map2_lv2_sort_by', sortBy);
    } catch { /* Ignore localStorage errors */ }
  }, [sortBy])

  const toggleHidePlugin = (uri: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHiddenPlugins(prev => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }

  const handleInstall = async (packId: string) => {
    try {
      await fetch(`/api/plugin-packages/${packId}/install`, { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'installing' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to install:', err)
    }
  }

  const handleUninstall = async (packId: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin pack?')) return
    try {
      await fetch(`/api/plugin-packages/${packId}/uninstall`, { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'uninstalling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to uninstall:', err)
    }
  }

  const handleDisable = async (packId: string) => {
    if (!confirm('Are you sure you want to disable this plugin pack? The plugins will be moved to a disabled folder.')) return
    try {
      await fetch(`/api/plugin-packages/${packId}/disable`, { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'disabling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to disable:', err)
    }
  }

  const handleEnable = async (packId: string) => {
    try {
      await fetch(`/api/plugin-packages/${packId}/enable`, { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'enabling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to enable:', err)
    }
  }

  const pollPackStatus = (packId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/plugin-packages/${packId}/status`)
        const data = await response.json()
        setPluginPacks(prev => prev.map(p =>
          p.id === packId ? { ...p, status: data.status, error_message: data.error_message } : p
        ))
        // Stop polling when no longer in a transitional state
        const transitionalStates = ['installing', 'uninstalling', 'disabling', 'enabling']
        if (!transitionalStates.includes(data.status)) {
          clearInterval(interval)
        }
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 300000)
  }

  const installedCount = pluginPacks.filter(p => p.status === 'installed').length
  const disabledCount = pluginPacks.filter(p => p.status === 'disabled').length
  const totalPlugins = pluginPacks.reduce((acc, p) => acc + (p.status === 'installed' ? p.plugin_count : 0), 0)

  const packCategories = [...new Set(pluginPacks.map(p => p.category))].sort()

  return (
    <div className="stack">
      <PageHeader
        title="LV2 Plugin Pack Manager"
        subtitle="Install and manage curated LV2 plugin collections from system packages"
        actions={
          <button
            className="btn btn-ghost"
            onClick={loadPluginPacks}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
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
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Error Loading Plugin Packs</div>
              <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                Check that the backend API is running at /api/plugin-packages/list
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
        borderColor: 'rgba(55, 214, 201, 0.3)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#37d6c9' }}>{installedCount}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Installed</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#6b7280' }}>{disabledCount}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Disabled</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#a78bfa' }}>{pluginPacks.length}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#4ade80' }}>{totalPlugins}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Plugins Active</div>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{packCategories.length}</div>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Categories</div>
          </div>
        </div>
      </div>

      {/* Plugin Browser */}
      <div className="card">
          <div className="section-heading">
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plugin Browser</h2>
              <p className="subtitle">Browse {pluginsQuery.data?.plugins?.length ?? 0} discovered LV2 plugins</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="pill">{filteredPlugins.length} shown</span>
              {/* Favorites filter */}
              <button
                className={`btn btn-sm ${showFavoritesOnly ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                style={{
                  fontSize: 11,
                  padding: '6px 10px',
                  color: showFavoritesOnly ? '#f59e0b' : '#6b7280',
                  borderColor: showFavoritesOnly ? 'rgba(245, 158, 11, 0.5)' : 'rgba(107, 114, 128, 0.3)',
                  background: showFavoritesOnly ? 'rgba(245, 158, 11, 0.15)' : undefined,
                }}
                title={showFavoritesOnly ? 'Show all plugins' : `Show only favorites (${favoriteUris.size})`}
                disabled={isLoadingFavorites}
              >
                <Star size={12} style={{ fill: showFavoritesOnly ? '#f59e0b' : 'none' }} />
                {showFavoritesOnly ? 'Favorites' : `${favoriteUris.size} Favorites`}
              </button>
              {hiddenCount > 0 && (
                <button
                  className={`btn btn-sm ${showHidden ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setShowHidden(!showHidden)}
                  style={{
                    fontSize: 11,
                    padding: '6px 10px',
                    color: showHidden ? undefined : '#6b7280',
                    borderColor: showHidden ? undefined : 'rgba(107, 114, 128, 0.3)',
                  }}
                  title={showHidden ? 'Hide hidden plugins' : `Show ${hiddenCount} hidden plugin${hiddenCount > 1 ? 's' : ''}`}
                >
                  {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showHidden ? 'Showing All' : `${hiddenCount} Hidden`}
                </button>
              )}
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
                <select
                  className="input"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'category' | 'author' | 'name')}
                  title="Group/sort plugins by"
                >
                  <option value="category">Group by Category</option>
                  <option value="author">Group by Author</option>
                  <option value="name">Sort by Name</option>
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={refreshPlugins}
                  disabled={refreshingPlugins || pluginsQuery.isLoading}
                  title="Rescan for newly installed LV2 plugins"
                  style={{ padding: '6px 10px' }}
                >
                  {refreshingPlugins ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {pluginsQuery.isLoading ? (
            <div className="flex" style={{ padding: '24px', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={18} />
              <span style={{ marginLeft: 8 }}>Loading plugins...</span>
            </div>
          ) : pluginsQuery.error ? (
            <div className="pill warn">Failed to load plugins</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto', overflowX: 'hidden' }}>
              {groupedPlugins.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
                  No plugins match your search
                </div>
              ) : (
                groupedPlugins.map(([groupName, plugins]) => {
                  // Get styling based on sort mode
                  const isCategoryMode = sortBy === 'category'
                  const isAuthorMode = sortBy === 'author'
                  const isNameMode = sortBy === 'name'

                  // For category mode, use category colors; for author/name mode, use neutral colors
                  const catConfig = isCategoryMode ? getCategoryConfig(groupName) : {
                    color: isAuthorMode ? '#a78bfa' : '#37d6c9',
                    bg: isAuthorMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(55, 214, 201, 0.15)',
                    icon: isAuthorMode ? User : List
                  }
                  const GroupIcon = catConfig.icon
                  const isCollapsed = collapsedCategories.has(groupName)

                  // For 'name' mode (flat list), don't show a collapsible header
                  const showHeader = !isNameMode

                  return (
                    <div key={groupName} style={{ marginBottom: 12 }}>
                      {showHeader && (
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
                          onClick={() => toggleCategory(groupName)}
                        >
                          {isCollapsed ? (
                            <ChevronRight size={14} style={{ color: catConfig.color }} />
                          ) : (
                            <ChevronDown size={14} style={{ color: catConfig.color }} />
                          )}
                          <GroupIcon size={14} style={{ color: catConfig.color }} />
                          <span style={{ color: catConfig.color, fontWeight: 600, fontSize: 13 }}>
                            {groupName}
                          </span>
                          <span className="pill" style={{ fontSize: 10, marginLeft: 'auto', background: `${catConfig.color}20`, color: catConfig.color }}>
                            {plugins.length}
                          </span>
                        </div>
                      )}

                      {(!isCollapsed || isNameMode) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px' }}>
                          {plugins.map((p: Plugin) => {
                            // Use plugin's actual category for individual item styling
                            const pluginCatConfig = getCategoryConfig(p.category)
                            const isHidden = hiddenPlugins.has(p.uri)
                            const PluginIcon = pluginCatConfig.icon
                            return (
                              <div
                                key={p.uri}
                                className="list-item"
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  borderLeft: `3px solid ${pluginCatConfig.color}`,
                                  background: selectedPlugin?.uri === p.uri
                                    ? `linear-gradient(135deg, ${pluginCatConfig.bg} 0%, rgba(0,0,0,0.3) 100%)`
                                    : isHidden
                                      ? 'rgba(107, 114, 128, 0.1)'
                                      : undefined,
                                  boxShadow: selectedPlugin?.uri === p.uri
                                    ? `0 0 10px ${pluginCatConfig.color}30`
                                    : undefined,
                                  opacity: isHidden ? 0.6 : 1,
                                  position: 'relative',
                                }}
                                onClick={() => setSelectedPlugin(p)}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <PluginIcon size={14} style={{ color: pluginCatConfig.color }} />
                                  {favoriteUris.has(p.uri) && (
                                    <Star size={12} style={{ color: '#f59e0b', fill: '#f59e0b', flexShrink: 0 }} />
                                  )}
                                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setTagSelectorPlugin(p)
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 4,
                                      borderRadius: 4,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#666',
                                      opacity: 0.6,
                                      transition: 'opacity 0.15s, color 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.opacity = '1'
                                      e.currentTarget.style.color = '#a78bfa'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.opacity = '0.6'
                                      e.currentTarget.style.color = '#666'
                                    }}
                                    title="Manage tags"
                                  >
                                    <Tag size={12} />
                                  </button>
                                  <button
                                    onClick={(e) => toggleHidePlugin(p.uri, e)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 4,
                                      borderRadius: 4,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: isHidden ? '#6b7280' : '#666',
                                      opacity: 0.6,
                                      transition: 'opacity 0.15s, color 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.opacity = '1'
                                      e.currentTarget.style.color = isHidden ? '#4ade80' : '#ef4444'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.opacity = '0.6'
                                      e.currentTarget.style.color = isHidden ? '#6b7280' : '#666'
                                    }}
                                    title={isHidden ? 'Show plugin' : 'Hide plugin'}
                                  >
                                    {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                                  </button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, color: '#888' }}>{p.author || 'Unknown author'}</span>
                                  <PluginTagDisplay uri={p.uri} onClick={() => setTagSelectorPlugin(p)} />
                                </div>
                                {getPluginDescription(p.name) && (
                                  <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                                    {getPluginDescription(p.name)}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span className="pill muted" style={{ fontSize: 9 }}>{p.in_ports}→{p.out_ports}</span>
                                  {p.parameters && p.parameters.length > 0 && (
                                    <span className="pill muted" style={{ fontSize: 9 }}>{p.parameters.length} params</span>
                                  )}
                                  {p.has_ui && <span className="pill info" style={{ fontSize: 9 }}>GUI</span>}
                                  {!isCategoryMode && (
                                    <span className="pill" style={{ fontSize: 9, color: pluginCatConfig.color, borderColor: `${pluginCatConfig.color}40`, background: pluginCatConfig.bg }}>{p.category}</span>
                                  )}
                                  {isHidden && <span className="pill" style={{ fontSize: 9, color: '#6b7280', borderColor: 'rgba(107, 114, 128, 0.3)' }}>Hidden</span>}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigate(`/grid?addPlugin=${encodeURIComponent(p.uri)}`)
                                    }}
                                    style={{
                                      marginLeft: 'auto',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '3px 8px',
                                      background: `linear-gradient(135deg, ${pluginCatConfig.color}30, ${pluginCatConfig.color}15)`,
                                      border: `1px solid ${pluginCatConfig.color}50`,
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: pluginCatConfig.color,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = `linear-gradient(135deg, ${pluginCatConfig.color}50, ${pluginCatConfig.color}30)`
                                      e.currentTarget.style.transform = 'translateY(-1px)'
                                      e.currentTarget.style.boxShadow = `0 2px 8px ${pluginCatConfig.color}40`
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = `linear-gradient(135deg, ${pluginCatConfig.color}30, ${pluginCatConfig.color}15)`
                                      e.currentTarget.style.transform = 'none'
                                      e.currentTarget.style.boxShadow = 'none'
                                    }}
                                    title="Add this plugin to the Flow editor"
                                  >
                                    <Plus size={10} />
                                    Add to Flow
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

      {/* Quick Status Row */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Package size={16} style={{ color: '#37d6c9' }} />
          <span style={{ fontSize: 12, color: '#888' }}>Quick Status:</span>
          {pluginPacks.map(pack => {
            const isTransitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)
            const isDisabled = pack.status === 'disabled'
            return (
              <span
                key={pack.id}
                onClick={() => setExpanded(true)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: pack.status === 'installed'
                    ? 'rgba(74, 222, 128, 0.2)'
                    : isDisabled
                      ? 'rgba(107, 114, 128, 0.2)'
                      : isTransitional
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                  color: pack.status === 'installed'
                    ? '#4ade80'
                    : isDisabled
                      ? '#6b7280'
                      : isTransitional
                        ? '#f59e0b'
                        : '#888',
                  border: `1px solid ${pack.status === 'installed' ? 'rgba(74, 222, 128, 0.3)' : isDisabled ? 'rgba(107, 114, 128, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  textDecoration: isDisabled ? 'line-through' : 'none',
                  opacity: isDisabled ? 0.7 : 1
                }}
              >
                {isTransitional ? (
                  <Loader2 size={10} className="animate-spin" style={{ marginRight: 4, display: 'inline' }} />
                ) : pack.status === 'installed' ? (
                  <CheckCircle size={10} style={{ marginRight: 4, display: 'inline' }} />
                ) : isDisabled ? (
                  <EyeOff size={10} style={{ marginRight: 4, display: 'inline' }} />
                ) : null}
                {pack.name}
              </span>
            )
          })}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Collapse Packs' : 'Expand Packs'}
          </button>
        </div>
      </div>

      {/* Plugin Packs Grid */}
      {expanded && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={16} />
            Available Plugin Packs
          </h3>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: '#37d6c9' }} />
              <span style={{ marginLeft: 12, color: '#888' }}>Loading plugin packs...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {pluginPacks.map(pack => {
                const isDisabled = pack.status === 'disabled'
                const isTransitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)
                return (
                  <div
                    key={pack.id}
                    style={{
                      padding: 16,
                      background: pack.status === 'installed'
                        ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(0,0,0,0.2))'
                        : isDisabled
                          ? 'linear-gradient(135deg, rgba(107, 114, 128, 0.1), rgba(0,0,0,0.3))'
                          : 'linear-gradient(135deg, rgba(55, 214, 201, 0.05), rgba(0,0,0,0.2))',
                      border: `1px solid ${pack.status === 'installed' ? 'rgba(74, 222, 128, 0.3)' : isDisabled ? 'rgba(107, 114, 128, 0.3)' : 'rgba(55, 214, 201, 0.2)'}`,
                      borderLeft: `4px solid ${pack.status === 'installed' ? '#4ade80' : isDisabled ? '#6b7280' : '#37d6c9'}`,
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      opacity: isTransitional ? 0.7 : isDisabled ? 0.6 : 1,
                      transition: 'all 0.3s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: isDisabled ? '#6b7280' : '#f2f6ff',
                          margin: 0,
                          textDecoration: isDisabled ? 'line-through' : 'none'
                        }}>
                          {pack.name}
                        </h4>
                        <span style={{
                          fontSize: 10,
                          color: '#888',
                          textTransform: 'uppercase',
                          letterSpacing: 1
                        }}>
                          {pack.category}
                        </span>
                      </div>
                      {pack.status === 'installed' && (
                        <CheckCircle size={18} style={{ color: '#4ade80' }} />
                      )}
                      {pack.status === 'disabled' && (
                        <span title="Disabled">
                          <EyeOff size={18} style={{ color: '#6b7280' }} />
                        </span>
                      )}
                      {pack.status === 'error' && (
                        <span title={pack.error_message || 'Error'}>
                          <XCircle size={18} style={{ color: '#ef4444' }} />
                        </span>
                      )}
                      {isTransitional && (
                        <Loader2 size={18} className="animate-spin" style={{ color: '#f59e0b' }} />
                      )}
                    </div>

                  <p style={{ fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.5 }}>
                    {pack.description}
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(167, 139, 250, 0.2)',
                      border: '1px solid rgba(167, 139, 250, 0.3)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: '#a78bfa'
                    }}>
                      {pack.plugin_count} plugins
                    </span>
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(55, 214, 201, 0.1)',
                      border: '1px solid rgba(55, 214, 201, 0.2)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: '#37d6c9'
                    }}>
                      {pack.size_estimate}
                    </span>
                  </div>

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pack.status === 'installing' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <Loader2 size={14} className="animate-spin" /> Installing...
                        </button>
                      ) : pack.status === 'uninstalling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <Loader2 size={14} className="animate-spin" /> Uninstalling...
                        </button>
                      ) : pack.status === 'disabling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <Loader2 size={14} className="animate-spin" /> Disabling...
                        </button>
                      ) : pack.status === 'enabling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <Loader2 size={14} className="animate-spin" /> Enabling...
                        </button>
                      ) : pack.status === 'disabled' ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleEnable(pack.id)}
                          style={{ width: '100%' }}
                        >
                          <Eye size={14} /> Enable
                        </button>
                      ) : pack.status === 'installed' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleDisable(pack.id)}
                            style={{
                              flex: 1,
                              color: '#6b7280',
                              borderColor: 'rgba(107, 114, 128, 0.3)'
                            }}
                            title="Temporarily disable without uninstalling"
                          >
                            <EyeOff size={14} /> Disable
                          </button>
                          {pack.can_uninstall !== false && (
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleUninstall(pack.id)}
                              style={{
                                flex: 1,
                                color: '#ef4444',
                                borderColor: 'rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              <Trash2 size={14} /> Uninstall
                            </button>
                          )}
                        </div>
                      ) : pack.can_install !== false ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleInstall(pack.id)}
                          style={{ width: '100%' }}
                        >
                          <Download size={14} /> Install
                        </button>
                      ) : (
                        <div style={{
                          padding: '8px 12px',
                          background: 'rgba(107, 114, 128, 0.1)',
                          border: '1px solid rgba(107, 114, 128, 0.2)',
                          borderRadius: 6,
                          fontSize: 11,
                          color: '#6b7280',
                          textAlign: 'center'
                        }}>
                          Not available via package manager
                        </div>
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
      <div className="card" style={{ background: 'rgba(55, 214, 201, 0.05)', borderColor: 'rgba(55, 214, 201, 0.2)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#37d6c9', marginBottom: 8 }}>
          About LV2 Plugin Packs
        </h4>
        <p style={{ fontSize: 12, color: '#888', margin: 0, lineHeight: 1.6 }}>
          LV2 (LADSPA Version 2) plugins are audio processing modules that can be loaded into the signal chain.
          These curated packs are installed via apt package manager and provide high-quality effects, instruments,
          and utilities. Installation requires sudo privileges and an internet connection.
        </p>
      </div>

      {/* Tag Selector Modal */}
      {tagSelectorPlugin && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setTagSelectorPlugin(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <TagSelector
              pluginUri={tagSelectorPlugin.uri}
              pluginName={tagSelectorPlugin.name}
              onClose={() => setTagSelectorPlugin(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
