import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, RefreshCw, Loader2, AlertTriangle, Check } from 'lucide-react'
import { pluginsApi } from '../../map2/api'
import type { Plugin } from '../../map2/types'

export function PluginManagementCard() {
  const queryClient = useQueryClient()
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'author' | 'format'>('name')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch all plugins
  const { data: pluginsData, isLoading, isError } = useQuery({
    queryKey: ['plugins', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/plugins/discover')
      if (!response.ok) throw new Error('Failed to fetch plugins')
      return response.json()
    },
  })

  const plugins = useMemo(() => {
    const list = pluginsData?.plugins || []
    
    // Filter by search term
    let filtered = list.filter((p: Plugin) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.uri.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Sort
    filtered.sort((a: Plugin, b: Plugin) => {
      switch (sortBy) {
        case 'author':
          return a.author.localeCompare(b.author) || a.name.localeCompare(b.name)
        case 'format':
          return (a.format || '').localeCompare(b.format || '') || a.name.localeCompare(b.name)
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })

    return filtered
  }, [pluginsData, searchTerm, sortBy])

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (uris: string[]) => {
      const errors: string[] = []
      const successes: string[] = []
      
      for (const uri of uris) {
        try {
          const result = await pluginsApi.delete(uri)
          successes.push(result.uri)
          console.log(`Deleted: ${uri}`, result)
        } catch (error: any) {
          const message = error?.message || `Failed to delete ${uri}`
          errors.push(message)
          console.error(`Error deleting ${uri}:`, error)
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`${errors.length}/${uris.length} failed: ${errors.join(', ')}`)
      }
      
      return { successes, errors }
    },
    onSuccess: () => {
      setSelectedUris(new Set())
      setShowDeleteConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })

  // Selection handlers
  const toggleSelectAll = useCallback(() => {
    if (selectedUris.size === plugins.length) {
      setSelectedUris(new Set())
    } else {
      setSelectedUris(new Set(plugins.map((p: Plugin) => p.uri)))
    }
  }, [plugins, selectedUris.size])

  const toggleSelect = useCallback((uri: string) => {
    const newSelected = new Set(selectedUris)
    if (newSelected.has(uri)) {
      newSelected.delete(uri)
    } else {
      newSelected.add(uri)
    }
    setSelectedUris(newSelected)
  }, [selectedUris])

  const handleDelete = useCallback(() => {
    if (selectedUris.size === 0) return
    deleteMutation.mutate(Array.from(selectedUris))
  }, [selectedUris, deleteMutation])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'all'] })
    } catch (error) {
      console.error('Failed to refresh plugins:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [queryClient])

  return (
    <div className="card">
      <div className="section-heading">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plugin Management</h2>
          <p className="subtitle">{plugins.length} plugins installed</p>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16, padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
        {/* Search and Sort */}
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            placeholder="Search plugins..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ flex: 1 }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'author' | 'format')}
            className="input"
            style={{ width: 150 }}
          >
            <option value="name">Sort by Name</option>
            <option value="author">Sort by Author</option>
            <option value="format">Sort by Format</option>
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={toggleSelectAll}
              className="btn btn-sm btn-ghost"
              style={{ padding: '6px 12px' }}
            >
              {selectedUris.size === plugins.length && plugins.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
            <span style={{ fontSize: 12, color: '#888' }}>
              {selectedUris.size} of {plugins.length} selected
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className={`btn btn-sm ${isRefreshing ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {isRefreshing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  Refresh
                </>
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedUris.size === 0 || deleteMutation.isPending}
              className="btn btn-sm btn-danger"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, opacity: selectedUris.size === 0 ? 0.5 : 1 }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  Delete Selected
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ maxWidth: 400, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#ff6b6b' }}>
              <AlertTriangle size={24} />
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>Delete Plugins</h2>
            </div>
            <p style={{ color: '#888', marginBottom: 24 }}>
              This will permanently delete {selectedUris.size} plugin{selectedUris.size === 1 ? '' : 's'} from your system.
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-ghost"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="btn btn-danger"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {deleteMutation.isError && (
        <div className="pill warn" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600 }}>Error deleting plugins</p>
          <p style={{ fontSize: 12 }}>{(deleteMutation.error as any)?.message || 'Unknown error'}</p>
        </div>
      )}

      {deleteMutation.isSuccess && (
        <div className="pill" style={{ marginBottom: 16, background: 'rgba(34, 197, 94, 0.2)', borderLeft: '4px solid #22c55e', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={16} />
          <p style={{ fontWeight: 600 }}>Plugins deleted successfully</p>
        </div>
      )}

      {/* Plugin Table */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : isError ? (
        <div className="pill warn">Failed to load plugins</div>
      ) : plugins.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#888' }}>
          No plugins found
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedUris.size === plugins.length && plugins.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#aaa' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#aaa' }}>Author</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#aaa' }}>Format</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#aaa' }}>Category</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#aaa' }}>URI</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((plugin: Plugin, idx: number) => (
                <tr
                  key={plugin.uri}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: selectedUris.has(plugin.uri) ? 'rgba(59, 130, 246, 0.2)' : idx % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <input
                      type="checkbox"
                      checked={selectedUris.has(plugin.uri)}
                      onChange={() => toggleSelect(plugin.uri)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '12px', fontWeight: 500, color: 'white' }}>{plugin.name}</td>
                  <td style={{ padding: '12px', color: '#aaa' }}>{plugin.author || '-'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '4px 8px', background: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa', borderRadius: 4, fontSize: 11 }}>
                      {plugin.format || 'LV2'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#aaa' }}>{plugin.category || '-'}</td>
                  <td style={{ padding: '12px', color: '#666', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={plugin.uri}>
                    {plugin.uri}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
