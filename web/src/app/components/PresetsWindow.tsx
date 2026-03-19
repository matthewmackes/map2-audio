import { useState, useEffect } from 'react'
import { presetManager, type Preset } from '../services/presetManager'
import {
  Close as X,
  Download as DownloadSimple,
  Edit as PencilSimple,
  Search as MagnifyingGlass,
  TrashCan as Trash,
  Upload as UploadSimple,
} from '@carbon/icons-react'

interface PresetsWindowProps {
  isOpen: boolean
  onClose: () => void
}

export function PresetsWindow({ isOpen, onClose }: PresetsWindowProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [filteredPresets, setFilteredPresets] = useState<Preset[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null)

  useEffect(() => {
    if (isOpen) {
      const allPresets = presetManager.getAllPresets()
      setPresets(allPresets)
      setFilteredPresets(allPresets)
    }
  }, [isOpen])

  useEffect(() => {
    const results = presetManager.searchPresets(searchQuery)
    setFilteredPresets(results)
  }, [searchQuery])

  const handleRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const saveRename = (id: string) => {
    if (editingName.trim()) {
      presetManager.renamePreset(id, editingName)
      setPresets(presetManager.getAllPresets())
      setFilteredPresets(presetManager.searchPresets(searchQuery))
    }
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = (id: string) => {
    if (confirm('Delete this preset?')) {
      presetManager.deletePreset(id)
      setPresets(presetManager.getAllPresets())
      setFilteredPresets(presetManager.searchPresets(searchQuery))
      if (selectedPreset?.id === id) setSelectedPreset(null)
    }
  }

  const handleExport = () => {
    const json = presetManager.exportPresetsAsJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `map2-presets-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const json = event.target?.result as string
          if (presetManager.importPresetsFromJSON(json)) {
            setPresets(presetManager.getAllPresets())
            setFilteredPresets(presetManager.searchPresets(searchQuery))
            alert('Presets imported successfully!')
          } else {
            alert('Failed to import presets. Invalid file format.')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
        border: '1px solid rgba(37, 99, 235, 0.3)',
        borderRadius: 12,
        width: '100%',
        maxWidth: 900,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(37, 99, 235, 0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: 20,
          borderBottom: '1px solid rgba(37, 99, 235, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2563eb', margin: 0, marginBottom: 4 }}>
              Preset Manager
            </h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
              {presets.length} preset{presets.length !== 1 ? 's' : ''} saved
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Controls */}
        <div style={{
          padding: 16,
          borderBottom: '1px solid rgba(37, 99, 235, 0.2)',
          display: 'flex',
          gap: 8,
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              placeholder="Search presets, plugins, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
              }}
            />
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 10, top: 12, color: '#6b7280' }} />
          </div>
          <button
            onClick={handleExport}
            title="Export all presets"
            style={{
              padding: '10px 14px',
              background: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#2563eb',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <DownloadSimple size={14} /> Export
          </button>
          <button
            onClick={handleImport}
            title="Import presets"
            style={{
              padding: '10px 14px',
              background: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#2563eb',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <UploadSimple size={14} /> Import
          </button>
        </div>

        {/* Presets List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}>
          {filteredPresets.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: 40,
              color: '#6b7280',
            }}>
              <p style={{ fontSize: 14, marginBottom: 8 }}>No presets found</p>
              <p style={{ fontSize: 12 }}>
                {presets.length === 0
                  ? 'Save presets from the parameter controls to get started!'
                  : 'Try adjusting your search query'}
              </p>
            </div>
          ) : (
            filteredPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => setSelectedPreset(preset)}
                style={{
                  padding: 12,
                  background: selectedPreset?.id === preset.id
                    ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(0,0,0,0.4))'
                    : 'rgba(0, 0, 0, 0.2)',
                  border: selectedPreset?.id === preset.id
                    ? '2px solid rgba(37, 99, 235, 0.6)'
                    : '1px solid rgba(37, 99, 235, 0.2)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.5)'
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(37, 99, 235, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = selectedPreset?.id === preset.id
                    ? 'rgba(37, 99, 235, 0.6)'
                    : 'rgba(37, 99, 235, 0.2)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  {editingId === preset.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(preset.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(37, 99, 235, 0.4)',
                        borderRadius: 4,
                        color: '#fff',
                        fontSize: 12,
                      }}
                    />
                  ) : (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', marginBottom: 2 }}>
                        {preset.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>
                        {preset.pluginUri.split('/').pop()}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRename(preset.id, preset.name)
                      }}
                      title="Rename"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <PencilSimple size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(preset.id)
                      }}
                      title="Delete"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {Object.keys(preset.parameters).length} parameters
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 16,
          borderTop: '1px solid rgba(37, 99, 235, 0.2)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px',
              background: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#2563eb',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
